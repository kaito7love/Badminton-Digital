const { Booking, Branch, Court, Customer, User, Role, sequelize } = require("../models");
const { Op } = require("sequelize");
const { getPagination, getPagingData } = require("../utils/pagination");
const { toMinutes, zonedTimeToUtc, localDateString, localTimeString, DEFAULT_TIMEZONE } = require("../utils/dateTime");
const realtimeBus = require("../utils/realtimeBus");
const { activeBookingLimitViolation, pendingExpiryAt } = require("../utils/bookingPolicy");
const AuditService = require("./AuditService");
const CustomerService = require("./CustomerService");
const SettingService = require("./SettingService");
const { operatingHoursViolation } = require("../utils/operatingHours");
const { BOOKING_WINDOW_DAYS, CUSTOMER_MAX_BOOKING_HOURS, bookingWindow } = require("../utils/daySlots");

// Thông điệp khách đọc trực tiếp trên trang Đặt sân (hộp xác nhận và thông báo
// lỗi khi đặt) nên phải là tiếng Việt — ALREADY_BOOKED trước đây là câu tiếng Anh duy nhất trong
// nhóm này và nó đi thẳng ra mặt khách.
const UNAVAILABLE = {
  COURT_NOT_FOUND: "Không tìm thấy sân",
  COURT_INACTIVE: "Sân đã ngưng khai thác, không nhận đặt lịch",
  COURT_MAINTENANCE: "Sân đang bảo trì, không nhận đặt lịch mới cho tới khi hoàn tất",
  OUTSIDE_OPERATING_HOURS: "Khung giờ này nằm ngoài giờ mở cửa của quán",
  SLOT_PASSED: "Khung giờ này đã qua, vui lòng chọn khung giờ khác",
  ALREADY_BOOKED: "Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác",
};

class BookingService {
  /** Thông điệp từ chối, lộ ra để test khoá lại: khách chỉ đọc tiếng Việt. */
  static get UNAVAILABLE() {
    return UNAVAILABLE;
  }

  /**
   * Khung giờ đã trôi qua hẳn chưa — hàm thuần, không đụng DB nên test được
   * trực tiếp.
   *
   * `booking_date` + `end_time` là GIỜ TREO TƯỜNG ở chi nhánh, không phải mốc
   * UTC, nên phải quy về mốc tuyệt đối theo đúng `branches.timezone` rồi mới so
   * với hiện tại. So thẳng với đồng hồ của máy chạy server là sai hai lần: tiến
   * trình server đọc giờ UTC (xem `config.js`) nên từ 00:00 tới 07:00 giờ Việt
   * Nam nó vẫn còn ở ngày hôm trước và sẽ chặn oan cả ngày hôm nay; còn chi
   * nhánh ở múi giờ khác thì lệch hẳn nhiều tiếng về cả hai phía.
   *
   * Chỉ tính mốc KẾT THÚC, không tính mốc bắt đầu: khung giờ đã bắt đầu nhưng
   * chưa xong thì vẫn còn chơi được — khách tới quầy lúc 20:05 vẫn vào khung
   * 20:00–22:00, và tiền sân tính theo giờ chơi thực tế chứ không theo giờ ghi
   * trên lịch. Chỉ khung giờ đã đóng hẳn là thứ không còn ai đặt được nữa.
   */
  static hasSlotPassed({ bookingDate, endTime, timezone, now = new Date() }) {
    const [year, month, day] = String(bookingDate).slice(0, 10).split("-").map(Number);
    const [hour, minute] = String(endTime).split(":").map(Number);
    const endsAt = zonedTimeToUtc(year, month, day, hour, minute, 0, timezone || DEFAULT_TIMEZONE);
    return endsAt.getTime() <= now.getTime();
  }

  /**
   * Khách tự đặt quá xa so với hôm nay chưa — hàm thuần, không đụng DB.
   *
   * Dải khách được đặt là hôm nay … hôm nay + 13 (BOOKING_WINDOW_DAYS = 14 ngày,
   * tính cả hôm nay), đúng dải mà lưới của trang Đặt sân vẽ. "Hôm nay" tính theo
   * lịch của CHI NHÁNH, cùng lý do với `hasSlotPassed`.
   *
   * Chỉ áp cho vai `customer` (`createBooking`): nhân viên đặt xa hơn cho giải
   * đấu hay sự kiện vẫn được. Trả `null` nếu hợp lệ, hoặc câu thông báo nêu rõ
   * ngày cuối cùng đặt được.
   */
  static advanceBookingViolation({ bookingDate, timezone, now = new Date() }) {
    const today = localDateString(now, timezone || DEFAULT_TIMEZONE);
    const { last } = bookingWindow(today);
    if (String(bookingDate).slice(0, 10) <= last) return null;
    const [year, month, day] = last.split("-");
    return `Chỉ nhận đặt trước tối đa ${BOOKING_WINDOW_DAYS} ngày (đến ${day}/${month}/${year}), vui lòng chọn ngày sớm hơn`;
  }

  /**
   * Khách đặt một lượt dài quá giới hạn chưa — hàm thuần (R15). Chỉ áp cho vai `customer` (nhân viên đặt giải
   * đấu/sự kiện dài hơn vẫn được). Trả `null` nếu hợp lệ, hoặc câu thông báo.
   */
  static durationViolation({ startTime, endTime, maxHours = CUSTOMER_MAX_BOOKING_HOURS }) {
    const minutes = toMinutes(endTime) - toMinutes(startTime);
    if (minutes <= maxHours * 60) return null;
    return `Mỗi lượt đặt tối đa ${maxHours} giờ liền, vui lòng chọn khoảng giờ ngắn hơn hoặc đặt thành nhiều lượt`;
  }

  /**
   * Nguồn duy nhất trả lời "sân này có đặt được khoảng giờ đó không".
   *
   * Mọi đường đặt/sửa lịch đều phải đi qua đây, và API tra cứu khả dụng cũng gọi
   * đúng hàm này — nếu để nơi khác tự suy luận từ court.status thì giao diện và
   * server sẽ có lúc nói khác nhau.
   *
   * Hạn chế đã biết: `maintenance` hiện là một lá cờ không có thời hạn, nên chỉ
   * trả lời được theo trạng thái *hiện tại*. Sân đang bảo trì sẽ bị chặn đặt cho
   * mọi khung giờ tương lai, kể cả khi tới lúc đó đã sửa xong. Muốn đặt lịch né
   * đúng khoảng bảo trì thì phải chuyển bảo trì thành bản ghi có starts_at/ends_at.
   */
  static async checkAvailability({
    courtId,
    bookingDate,
    startTime,
    endTime,
    excludeBookingId = null,
    branchId = null,
    transaction = null,
  }) {
    const deny = (reason, conflictBookingId = null, message = UNAVAILABLE[reason]) => ({
      available: false,
      reason,
      message,
      conflictBookingId,
    });

    // Kèm `branch` chỉ để lấy `timezone`: "khung giờ này đã qua chưa" phải trả
    // lời theo đồng hồ của chi nhánh, không phải của máy chạy server.
    const court = await Court.findOne({
      where: { id: courtId, ...(branchId ? { branchId } : {}) },
      include: [{ model: Branch, as: "branch", attributes: ["id", "timezone"] }],
      transaction,
    });
    if (!court) return deny("COURT_NOT_FOUND");
    if (court.status === "inactive") return deny("COURT_INACTIVE");
    if (court.status === "maintenance") return deny("COURT_MAINTENANCE");

    // Lịch cho thời điểm đã qua là rác không ai chơi được, nhưng vẫn chiếm chỗ
    // thật (truy vấn trùng lịch ngay dưới đếm cả `pending`/`confirmed`) và vẫn
    // chui vào màn Quản lý Đặt Sân để nhân viên dọn tay. Chặn ở đây — nơi duy
    // nhất trả lời câu "đặt được không" — nên trang Đặt sân và lúc bấm đặt thật
    // không thể nói khác nhau.
    if (BookingService.hasSlotPassed({ bookingDate, endTime, timezone: court.branch?.timezone })) {
      return deny("SLOT_PASSED");
    }

    // Ngoài giờ mở cửa thì không nhận đặt — lịch 02:00 sáng trước đây vẫn tạo
    // được vì `operating_hours.open`/`close` không ai đọc. Thông điệp nêu rõ
    // khung giờ để khách biết chọn lại thế nào.
    const outsideHours = operatingHoursViolation({
      startTime,
      endTime,
      hours: await SettingService.getOperatingHours(),
    });
    if (outsideHours) return deny("OUTSIDE_OPERATING_HOURS", null, outsideHours);

    const whereCondition = {
      courtId,
      ...(branchId ? { branchId } : {}),
      bookingDate,
      status: { [Op.in]: ["pending", "confirmed"] },
      [Op.and]: [{ startTime: { [Op.lt]: endTime } }, { endTime: { [Op.gt]: startTime } }],
    };

    if (excludeBookingId) {
      whereCondition.id = { [Op.ne]: excludeBookingId };
    }

    const conflictBooking = await Booking.findOne({
      where: whereCondition,
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });
    if (conflictBooking) return deny("ALREADY_BOOKED", conflictBooking.id);

    return { available: true, reason: null, message: null, conflictBookingId: null };
  }

  static async getAllBookings(query, context = {}) {
    const { page, limit, offset } = getPagination(query);
    const { date, courtId, status } = query;
    const direction = String(query.sort || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const where = {};
    if (date) where.bookingDate = date;
    if (courtId) where.courtId = courtId;
    if (status) where.status = status;
    if (context.branchId) where.branchId = context.branchId;
    if (context.actor?.role?.name === "customer") where.customerId = context.actor.customer?.id || -1;

    const data = await Booking.findAndCountAll({
      where,
      limit,
      offset,
      order: [
        ["bookingDate", direction],
        ["startTime", direction],
      ],
      include: [
        { model: Court, as: "court", attributes: ["id", "name"] },
        { model: Customer, as: "customer", attributes: ["id", "fullName", "phone"] },
      ],
    });

    return getPagingData(data, page, limit);
  }

  /**
   * Các trường được đổi khi sửa lịch — cùng danh sách với EDITABLE_BOOKING_FIELDS
   * ở bookingValidation.js. Validator đã trả 400 cho trường khác; lọc lại ở đây
   * để service vẫn an toàn khi có nơi gọi thẳng không qua route.
   */
  static pickEditableFields(data = {}) {
    const editable = ["courtId", "bookingDate", "startTime", "endTime"];
    return editable.reduce((payload, key) => {
      if (data[key] !== undefined) payload[key] = data[key];
      return payload;
    }, {});
  }

  static async getBookingById(id, context = {}) {
    const include = [
      { model: Court, as: "court" },
      { model: Customer, as: "customer" },
    ];
    // Ai tạo lịch (họ tên, email nhân viên) là thông tin nội bộ — khách xem lịch
    // của chính mình không cần tới.
    if (context.actor?.role?.name !== "customer") {
      include.push({ model: User, as: "creator", attributes: ["id", "email", "fullName"] });
    }
    const booking = await Booking.findByPk(id, { include });
    if (!booking) {
      const error = new Error("Booking not found");
      error.statusCode = 404;
      throw error;
    }
    BookingService.assertOwnership(booking, context.actor, context.branchId);
    return booking;
  }

  static async createBooking(data, context) {
    if (toMinutes(data.startTime) >= toMinutes(data.endTime)) {
      const error = new Error("Giờ kết thúc phải sau giờ bắt đầu");
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction({ isolationLevel: "SERIALIZABLE" });
    try {
      const court = await Court.findByPk(data.courtId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!court || (context.branchId && court.branchId !== context.branchId)) {
        const error = new Error("Không tìm thấy sân trong chi nhánh đang chọn — hãy đổi chi nhánh rồi thử lại.");
        error.statusCode = 404;
        throw error;
      }
      // Khách chỉ đặt trong dải 14 ngày; nhân viên không bị giới hạn này. Chỉ vai
      // customer mới tốn thêm một truy vấn lấy múi giờ chi nhánh.
      if (context.actor?.role?.name === "customer") {
        const branch = await Branch.findByPk(court.branchId, { attributes: ["id", "timezone"], transaction });
        const tooFar = BookingService.advanceBookingViolation({
          bookingDate: data.bookingDate,
          timezone: branch?.timezone,
        });
        if (tooFar) {
          const error = new Error(tooFar);
          error.statusCode = 400;
          throw error;
        }
        const tooLong = BookingService.durationViolation({ startTime: data.startTime, endTime: data.endTime });
        if (tooLong) {
          const error = new Error(tooLong);
          error.statusCode = 400;
          throw error;
        }
      }
      let customerId = context.actor?.role?.name === "customer" ? context.actor.customer?.id : data.customerId || null;
      if (context.actor?.role?.name === "customer" && !customerId) {
        const error = new Error("Tài khoản khách hàng chưa có hồ sơ khách hàng");
        error.statusCode = 403;
        throw error;
      }
      if (context.actor?.role?.name === "customer") {
        // Trần số lịch đang giữ (F3): đếm trong cùng transaction nên hai yêu cầu song song không cùng lọt qua trần.
        const policy = await SettingService.getBookingPolicy();
        if (policy.maxActivePerCustomer > 0) {
          const branch = await Branch.findByPk(court.branchId, { attributes: ["id", "timezone"], transaction });
          const timezone = branch?.timezone || DEFAULT_TIMEZONE;
          const now = new Date();
          const activeCount = await Booking.count({
            where: {
              customerId,
              status: { [Op.in]: ["pending", "confirmed"] },
              [Op.or]: [
                { bookingDate: { [Op.gt]: localDateString(now, timezone) } },
                { bookingDate: localDateString(now, timezone), endTime: { [Op.gt]: localTimeString(now, timezone) } },
              ],
            },
            transaction,
          });
          const overLimit = activeBookingLimitViolation({ activeCount, limit: policy.maxActivePerCustomer });
          if (overLimit) {
            const error = new Error(overLimit);
            error.statusCode = 400;
            error.errorCode = "BOOKING_LIMIT";
            throw error;
          }
        }
      }
      let customerMatch = null;
      if (!customerId) {
        // Khách đặt tại quầy chưa có hồ sơ: tạo (hoặc gộp theo SĐT) thành khách hàng
        const walkIn = await CustomerService.resolveWalkInDetailed({
          fullName: data.customerName,
          phone: data.customerPhone,
          transaction,
        });
        customerId = walkIn.customer ? walkIn.customer.id : null;
        if (walkIn.matched) {
          customerMatch = { id: walkIn.customer.id, fullName: walkIn.customer.fullName, nameDiffers: walkIn.nameDiffers };
        }
      }
      const availability = await BookingService.checkAvailability({
        courtId: data.courtId,
        bookingDate: data.bookingDate,
        startTime: data.startTime,
        endTime: data.endTime,
        branchId: court.branchId,
        transaction,
      });
      if (!availability.available) {
        const error = new Error(availability.message);
        // Trùng lịch là xung đột tài nguyên (409); sân ngưng/bảo trì là yêu cầu
        // không hợp lệ ngay từ đầu (400)
        error.statusCode = availability.reason === "ALREADY_BOOKED" ? 409 : 400;
        error.conflictBookingId = availability.conflictBookingId;
        throw error;
      }
      const booking = await Booking.create(
        {
          courtId: data.courtId,
          branchId: court.branchId,
          customerId,
          bookingDate: data.bookingDate,
          startTime: data.startTime,
          endTime: data.endTime,
          status: "pending",
          createdBy: context.actor.id,
        },
        { transaction },
      );
      await AuditService.record({
        actor: context.actor,
        branchId: court.branchId,
        action: "booking.created",
        targetType: "booking",
        targetId: booking.id,
        newValues: booking.toJSON(),
        requestId: context.requestId,
        transaction,
      });
      await transaction.commit();
      BookingService.notifyChanged(booking);
      // Chỉ nhân viên đi nhánh này (khách luôn có customerId từ hồ sơ của chính họ): cho nhân viên biết lịch vừa gắn
      // vào hồ sơ có sẵn theo SĐT, và tên nhập có khác không (F5). Không lưu DB.
      if (customerMatch) booking.dataValues.customerMatch = customerMatch;
      return booking;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Báo các màn hình nhân viên đang mở rằng danh sách đặt sân vừa đổi (F6). Gọi SAU KHI commit. Payload chỉ có
   * id/trạng thái — không tên, không SĐT — vì SSE là tín hiệu "tải lại đi", không phải kênh dữ liệu.
   */
  static notifyChanged(booking) {
    if (!booking) return;
    realtimeBus.emit("booking:changed", { branchId: booking.branchId, bookingId: booking.id, status: booking.status });
  }

  /**
   * Tự huỷ lịch `pending` do KHÁCH tự đặt mà quá hạn chờ duyệt (F3b). Lịch do nhân viên tạo không bao giờ bị huỷ ở
   * đây. Chạy trong vòng quét 5 phút của server.js. Mỗi lịch được khoá + đọc lại trong transaction riêng nên không
   * đè lên một lần duyệt/huỷ tay vừa xảy ra. Trả về số lịch đã huỷ.
   */
  static async expireStalePendingBookings({ now = new Date(), batch = 200 } = {}) {
    const policy = await SettingService.getBookingPolicy();
    if (!(policy.pendingExpiryHours > 0)) return 0;

    const candidates = await Booking.findAll({
      where: { status: "pending" },
      include: [{
        model: User, as: "creator", attributes: ["id"], required: true,
        include: [{ model: Role, as: "role", attributes: ["name"], where: { name: "customer" }, required: true }],
      }],
      order: [["createdAt", "ASC"]],
      limit: batch,
    });
    if (!candidates.length) return 0;

    const branches = await Branch.findAll({ attributes: ["id", "timezone"] });
    const timezoneOf = new Map(branches.map((b) => [b.id, b.timezone || DEFAULT_TIMEZONE]));
    let expired = 0;

    for (const candidate of candidates) {
      const [year, month, day] = String(candidate.bookingDate).slice(0, 10).split("-").map(Number);
      const [hour, minute] = String(candidate.startTime).split(":").map(Number);
      const startAt = zonedTimeToUtc(year, month, day, hour, minute, 0, timezoneOf.get(candidate.branchId) || DEFAULT_TIMEZONE);
      const expireAt = pendingExpiryAt({ createdAt: candidate.createdAt, startAt, policy });
      if (!expireAt || expireAt.getTime() > now.getTime()) continue;

      const transaction = await sequelize.transaction();
      try {
        const booking = await Booking.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!booking || booking.status !== "pending") {
          await transaction.rollback();
          continue;
        }
        const oldValues = booking.toJSON();
        await booking.update({ status: "cancelled" }, { transaction });
        await AuditService.record({
          actor: null,
          branchId: booking.branchId,
          action: "booking.expired",
          targetType: "booking",
          targetId: booking.id,
          oldValues,
          newValues: { ...booking.toJSON(), expiredAt: expireAt.toISOString(), reason: "pending_not_confirmed_in_time" },
          transaction,
        });
        await transaction.commit();
        BookingService.notifyChanged(booking);
        expired += 1;
      } catch (error) {
        await transaction.rollback();
        console.error("❌ Không huỷ được lịch quá hạn chờ duyệt #" + candidate.id + ":", error.message);
      }
    }
    return expired;
  }

  static async updateBooking(id, data, context) {
    const changes = BookingService.pickEditableFields(data);
    const transaction = await sequelize.transaction({ isolationLevel: "SERIALIZABLE" });
    try {
      const booking = await Booking.findOne({
        where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!booking) {
        const error = new Error("Booking not found");
        error.statusCode = 404;
        throw error;
      }
      BookingService.assertOwnership(booking, context.actor, context.branchId);
      if (!["pending", "confirmed"].includes(booking.status)) {
        const error = new Error("Booking ở trạng thái hiện tại không thể chỉnh sửa");
        error.statusCode = 400;
        throw error;
      }
      const courtId = changes.courtId || booking.courtId;
      const bookingDate = changes.bookingDate || booking.bookingDate;
      const startTime = changes.startTime || booking.startTime;
      const endTime = changes.endTime || booking.endTime;
      if (toMinutes(startTime) >= toMinutes(endTime)) {
        const error = new Error("Giờ kết thúc phải sau giờ bắt đầu");
        error.statusCode = 400;
        throw error;
      }
      const court = await Court.findOne({
        where: { id: courtId, branchId: booking.branchId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!court) {
        const error = new Error("Không tìm thấy sân trong chi nhánh đang chọn — hãy đổi chi nhánh rồi thử lại.");
        error.statusCode = 404;
        throw error;
      }
      const availability = await BookingService.checkAvailability({
        courtId,
        bookingDate,
        startTime,
        endTime,
        excludeBookingId: id,
        branchId: booking.branchId,
        transaction,
      });
      if (!availability.available) {
        const error = new Error(availability.message);
        error.statusCode = availability.reason === "ALREADY_BOOKED" ? 409 : 400;
        error.conflictBookingId = availability.conflictBookingId;
        throw error;
      }
      const oldValues = booking.toJSON();
      const updated = await booking.update(changes, { transaction });
      await AuditService.record({
        actor: context.actor,
        branchId: booking.branchId,
        action: "booking.updated",
        targetType: "booking",
        targetId: booking.id,
        oldValues,
        newValues: updated.toJSON(),
        requestId: context.requestId,
        transaction,
      });
      await transaction.commit();
      BookingService.notifyChanged(updated);
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async cancelBooking(id, context) {
    const transaction = await sequelize.transaction();
    try {
      const booking = await Booking.findOne({
        where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!booking) {
        const error = new Error("Booking not found");
        error.statusCode = 404;
        throw error;
      }
      BookingService.assertOwnership(booking, context.actor, context.branchId);
      if (!["pending", "confirmed"].includes(booking.status)) {
        const error = new Error("Booking ở trạng thái hiện tại không thể hủy");
        error.statusCode = 400;
        throw error;
      }
      const oldValues = booking.toJSON();
      const updated = await booking.update({ status: "cancelled" }, { transaction });
      await AuditService.record({
        actor: context.actor,
        branchId: booking.branchId,
        action: "booking.cancelled",
        targetType: "booking",
        targetId: booking.id,
        oldValues,
        newValues: updated.toJSON(),
        requestId: context.requestId,
        transaction,
      });
      await transaction.commit();
      BookingService.notifyChanged(updated);
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async confirmBooking(id, context) {
    const transaction = await sequelize.transaction();
    try {
      const booking = await Booking.findOne({
        where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!booking) {
        const error = new Error("Booking not found");
        error.statusCode = 404;
        throw error;
      }
      if (booking.status !== "pending") {
        const error = new Error("Chỉ có thể xác nhận booking đang chờ");
        error.statusCode = 400;
        throw error;
      }
      const oldValues = booking.toJSON();
      const updated = await booking.update({ status: "confirmed" }, { transaction });
      await AuditService.record({
        actor: context.actor,
        branchId: booking.branchId,
        action: "booking.confirmed",
        targetType: "booking",
        targetId: booking.id,
        oldValues,
        newValues: updated.toJSON(),
        requestId: context.requestId,
        transaction,
      });
      await transaction.commit();
      BookingService.notifyChanged(updated);
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static assertOwnership(booking, actor, branchId) {
    if (branchId && booking.branchId !== branchId) {
      const error = new Error("Booking thuộc chi nhánh khác — hãy đổi chi nhánh đang chọn rồi thử lại.");
      error.statusCode = 403;
      throw error;
    }
    if (actor?.role?.name === "customer" && booking.customerId !== actor.customer?.id) {
      const error = new Error("Bạn không có quyền truy cập booking này");
      error.statusCode = 403;
      throw error;
    }
  }
}

module.exports = BookingService;
