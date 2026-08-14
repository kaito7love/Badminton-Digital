const { Op } = require('sequelize');
const { Court, CourtSession, Customer, Booking, Employee, sequelize } = require('../models');
const { calculateCourtFee } = require('../utils/priceCalculator');
const AuditService = require('./AuditService');
const SettingService = require('./SettingService');
const CustomerService = require('./CustomerService');
const { localDateString, localTimeString } = require('../utils/dateTime');

const COURT_STATUSES = ['active', 'maintenance', 'inactive'];

/**
 * Bảng chuyển đổi trạng thái hợp lệ, khai báo tường minh thay vì rải kiểm tra
 * khắp nơi. Mỗi ô là một **hành động nghiệp vụ có tên** — tên này đi thẳng vào
 * nhật ký kiểm toán, nên đọc log biết ngay việc gì đã xảy ra chứ không chỉ là
 * "status đổi từ A sang B".
 *
 * Cặp bị chặn có chủ đích: inactive -> maintenance. Sân đã ngưng khai thác thì
 * không có gì để bảo trì; muốn sửa thì đưa về active trước, để trạng thái luôn
 * phản ánh đúng ý định vận hành.
 */
const COURT_STATUS_TRANSITIONS = {
  active: {
    maintenance: 'court.maintenance_started',
    inactive: 'court.retired'
  },
  maintenance: {
    active: 'court.maintenance_completed',
    inactive: 'court.retired'
  },
  inactive: {
    active: 'court.reactivated'
  }
};

const TRANSITION_HINTS = {
  'inactive->maintenance': 'Sân đã ngưng khai thác. Hãy khai thác trở lại trước khi chuyển sang bảo trì.'
};

class CourtService {
  /**
   * `state` là góc nhìn gộp dành cho giao diện: trộn vòng đời sân (status) với
   * việc sân có phiên chơi đang mở hay không. Chỉ tính toán lúc đọc, không lưu —
   * nhờ vậy không bao giờ có chuyện DB nói một đằng, phiên chơi nói một nẻo.
   */
  static formatCourt(court) {
    const plain = court.toJSON ? court.toJSON() : court;
    let state = 'AVAILABLE';
    if (plain.status === 'maintenance') {
      state = 'MAINTENANCE';
    } else if (plain.status === 'inactive') {
      state = 'INACTIVE';
    } else if (plain.sessions && plain.sessions.length > 0) {
      state = 'PLAYING';
    }
    return {
      ...plain,
      state,
    };
  }

  /**
   * Các trường được phép sửa qua PUT /courts/:id.
   *
   * `status` cố tình nằm ngoài danh sách: đổi trạng thái là một hành động nghiệp
   * vụ có tiền điều kiện riêng, phải đi qua updateCourtStatus. `branchId` cũng vậy
   * — sân không được chuyển chi nhánh bằng một lệnh sửa thông tin.
   */
  static pickEditableFields(data = {}) {
    const editable = ['name', 'peakPricePerHour', 'offpeakPricePerHour', 'note'];
    return editable.reduce((payload, key) => {
      if (data[key] !== undefined) payload[key] = data[key];
      return payload;
    }, {});
  }

  static unavailableReason(status) {
    if (status === 'maintenance') return 'Sân đang bảo trì';
    if (status === 'inactive') return 'Sân đã ngưng khai thác';
    return 'Sân không sẵn sàng';
  }

  static async getAllCourts(branchId = null) {
    const courts = await Court.findAll({
      where: branchId ? { branchId } : undefined,
      order: [['id', 'ASC']],
      include: [
        {
          model: CourtSession,
          as: 'sessions',
          where: { status: 'playing' },
          required: false,
          include: [
            { model: Customer, as: 'customer', attributes: ['id', 'fullName', 'phone'] }
          ]
        }
      ]
    });
    return courts.map(c => CourtService.formatCourt(c));
  }

  static async getCourtById(id, branchId = null) {
    const court = await Court.findOne({
      where: { id, ...(branchId ? { branchId } : {}) },
      include: [
        {
          model: CourtSession,
          as: 'sessions',
          where: { status: 'playing' },
          required: false,
          include: [
            { model: Customer, as: 'customer', attributes: ['id', 'fullName', 'phone'] }
          ]
        }
      ]
    });
    if (!court) {
      const error = new Error('Court not found');
      error.statusCode = 404;
      throw error;
    }
    return CourtService.formatCourt(court);
  }

  static async createCourt(data, context) {
    if (!context.branchId) {
      const error = new Error('Không xác định được chi nhánh cho sân mới');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.create({
        branchId: context.branchId,
        name: data.name,
        peakPricePerHour: data.peakPricePerHour,
        offpeakPricePerHour: data.offpeakPricePerHour,
        note: data.note || null,
        status: 'active'
      }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'court.created', targetType: 'court', targetId: court.id, newValues: court.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return CourtService.formatCourt(court);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async updateCourt(id, data, context) {
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      const oldValues = court.toJSON();
      // Chỉ nhận đúng các trường mô tả sân. Đổ thẳng `data` vào update() sẽ cho
      // phép sửa cả `status` (đi vòng qua mọi kiểm tra của updateCourtStatus) lẫn
      // `branchId` (chuyển sân sang chi nhánh khác, thủng cách ly dữ liệu).
      const updated = await court.update(CourtService.pickEditableFields(data), { transaction });
      await AuditService.record({ actor: context.actor, branchId: court.branchId, action: 'court.updated', targetType: 'court', targetId: court.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return CourtService.formatCourt(updated);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async deleteCourt(id, context) {
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      const activeSession = await CourtSession.findOne({ where: { courtId: id, status: 'playing' }, transaction, lock: transaction.LOCK.UPDATE });
      if (activeSession) {
        const error = new Error('Cannot delete court that is currently in use');
        error.statusCode = 400;
        throw error;
      }
      const oldValues = court.toJSON();
      await court.destroy({ transaction });
      await AuditService.record({ actor: context.actor, branchId: court.branchId, action: 'court.deleted', targetType: 'court', targetId: court.id, oldValues, requestId: context.requestId, transaction });
      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async openCourt(courtId, customerId = null, bookingId = null, guestName = null, guestPhone = null, context) {
    if (!context.branchId || !context.employeeId) {
      const error = new Error('Không xác định được nhân viên hoặc chi nhánh vận hành');
      error.statusCode = 403;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id: courtId, branchId: context.branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      if (court.status !== 'active') {
        const error = new Error(CourtService.unavailableReason(court.status));
        error.statusCode = 400;
        throw error;
      }
      const activeSession = await CourtSession.findOne({ where: { courtId, status: 'playing' }, transaction, lock: transaction.LOCK.UPDATE });
      if (activeSession) {
        const error = new Error('Court is already in use');
        error.statusCode = 400;
        throw error;
      }
      let booking = null;
      if (bookingId) {
        booking = await Booking.findOne({ where: { id: bookingId, courtId, branchId: context.branchId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!booking || !['pending', 'confirmed'].includes(booking.status)) {
          const error = new Error('Booking không hợp lệ để mở sân');
          error.statusCode = 400;
          throw error;
        }
      }
      let resolvedCustomerId = booking?.customerId || customerId || null;
      if (booking?.customerId && customerId && booking.customerId !== customerId) {
        const error = new Error('Khách hàng không khớp với booking');
        error.statusCode = 400;
        throw error;
      }
      if (resolvedCustomerId) {
        const customer = await Customer.findOne({ where: { id: resolvedCustomerId, branchId: context.branchId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!customer) {
          const error = new Error('Khách hàng không thuộc chi nhánh hiện tại');
          error.statusCode = 400;
          throw error;
        }
      } else {
        // Khách vãng lai: tạo hồ sơ khách hàng thay vì nhét tên vào bảng phiên chơi.
        // SĐT là thứ duy nhất gộp được hai lần ghé của cùng một người — thiếu nó
        // thì mỗi lần mở sân lại đẻ thêm một hồ sơ trùng tên, và lịch sử chi tiêu
        // của khách bị chẻ nhỏ ra không dùng được.
        const walkIn = await CustomerService.resolveWalkIn({
          branchId: context.branchId,
          fullName: guestName,
          phone: guestPhone,
          transaction
        });
        resolvedCustomerId = walkIn ? walkIn.id : null;
      }
      const session = await CourtSession.create({
        branchId: context.branchId,
        courtId,
        customerId: resolvedCustomerId,
        bookingId: booking?.id || null,
        employeeId: context.employeeId,
        startTime: new Date(),
        status: 'playing'
      }, { transaction });

      if (booking) await booking.update({ status: 'completed' }, { transaction });

      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'court.session_opened', targetType: 'court_session', targetId: session.id, newValues: session.toJSON(), requestId: context.requestId, transaction });

      await transaction.commit();
      return session;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async closeCourt(courtId, context) {
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id: courtId, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      const activeSession = await CourtSession.findOne({ where: { courtId, branchId: court.branchId, status: 'playing' }, transaction, lock: transaction.LOCK.UPDATE });
      if (!activeSession) {
        const error = new Error('Court is not currently open/playing');
        error.statusCode = 400;
        throw error;
      }
      const oldValues = activeSession.toJSON();
      const endTime = new Date();
      const { peakStartHour, peakEndHour } = await SettingService.getPeakHours();
      const { durationSeconds, courtFee } = calculateCourtFee(
        activeSession.startTime,
        endTime,
        court.peakPricePerHour,
        court.offpeakPricePerHour,
        peakStartHour,
        peakEndHour
      );

      await activeSession.update({
        endTime,
        durationSeconds,
        courtFee,
        status: 'closed'
      }, { transaction });

      await AuditService.record({ actor: context.actor, branchId: court.branchId, action: 'court.session_closed', targetType: 'court_session', targetId: activeSession.id, oldValues, newValues: activeSession.toJSON(), requestId: context.requestId, transaction });

      await transaction.commit();

      return {
        sessionId: activeSession.id,
        courtId: court.id,
        startTime: activeSession.startTime,
        endTime,
        durationSeconds,
        courtFee
      };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async transferCourt(sourceCourtId, targetCourtId, context) {
    if (Number(sourceCourtId) === Number(targetCourtId)) {
      const error = new Error('Source and target court cannot be the same');
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const courts = await Court.findAll({ where: { id: [sourceCourtId, targetCourtId], ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
      const sourceCourt = courts.find((court) => court.id === Number(sourceCourtId));
      const targetCourt = courts.find((court) => court.id === Number(targetCourtId));
      if (!sourceCourt || !targetCourt || sourceCourt.status !== 'active' || targetCourt.status !== 'active') {
        const error = new Error('Trạng thái hoặc chi nhánh sân không hợp lệ để chuyển sân');
        error.statusCode = 400;
        throw error;
      }
      const activeSession = await CourtSession.findOne({
        where: { courtId: sourceCourtId, branchId: sourceCourt.branchId, status: 'playing' },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!activeSession) {
        const error = new Error('Active session not found');
        error.statusCode = 404;
        throw error;
      }

      const targetActiveSession = await CourtSession.findOne({
        where: { courtId: targetCourtId, branchId: targetCourt.branchId, status: 'playing' },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (targetActiveSession) {
        const error = new Error('Target court is already in use');
        error.statusCode = 400;
        throw error;
      }

      const oldValues = activeSession.toJSON();
      await activeSession.update({ courtId: targetCourtId }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: sourceCourt.branchId, action: 'court.session_transferred', targetType: 'court_session', targetId: activeSession.id, oldValues, newValues: activeSession.toJSON(), requestId: context.requestId, transaction });

      await transaction.commit();
      return activeSession;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  /** Tra bảng chuyển đổi: trả về tên hành động nghiệp vụ, hoặc null nếu không hợp lệ */
  static resolveStatusTransition(from, to) {
    return COURT_STATUS_TRANSITIONS[from]?.[to] || null;
  }

  /**
   * Đổi vòng đời khai thác của sân.
   *
   * Đây là đường ghi DUY NHẤT vào courts.status — PUT /courts/:id chỉ nhận các
   * trường mô tả sân (xem pickEditableFields). Một bất biến chỉ nên có một đường
   * ghi được canh gác, có hai đường thì kiểu gì cũng có đường bị quên.
   */
  static async updateCourtStatus(courtId, status, context) {
    if (!COURT_STATUSES.includes(status)) {
      const error = new Error(`Trạng thái sân không hợp lệ. Chỉ nhận: ${COURT_STATUSES.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id: courtId, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }

      if (court.status === status) {
        const error = new Error(`Sân đang ở trạng thái '${status}' rồi`);
        error.statusCode = 400;
        throw error;
      }

      const action = CourtService.resolveStatusTransition(court.status, status);
      if (!action) {
        const hint = TRANSITION_HINTS[`${court.status}->${status}`];
        const error = new Error(hint || `Không thể chuyển sân từ '${court.status}' sang '${status}'`);
        error.statusCode = 400;
        throw error;
      }

      // Rời khỏi 'active' nghĩa là ngừng tiếp nhận khách — phải chắc không bỏ rơi
      // ai đang chơi dở, và không để lại lịch đã hứa mà sân không còn phục vụ được.
      if (status !== 'active') {
        const activeSession = await CourtSession.findOne({ where: { courtId, status: 'playing' }, transaction, lock: transaction.LOCK.UPDATE });
        if (activeSession) {
          const error = new Error('Không thể đổi trạng thái sân khi đang có phiên chơi');
          error.statusCode = 400;
          throw error;
        }

        // "Sắp tới" phải tính theo mốc thời gian thật, không chỉ theo ngày: một
        // lịch 08:00 sáng nay đã chơi xong lúc 4 giờ chiều thì không còn là lời
        // hứa nào cả. Nếu chỉ so ngày, sân sẽ bị khoá tới tận nửa đêm.
        const now = new Date();
        const upcoming = await Booking.count({
          where: {
            courtId,
            branchId: court.branchId,
            status: { [Op.in]: ['pending', 'confirmed'] },
            [Op.or]: [
              { bookingDate: { [Op.gt]: localDateString(now) } },
              {
                bookingDate: localDateString(now),
                endTime: { [Op.gt]: localTimeString(now) }
              }
            ]
          },
          transaction
        });
        if (upcoming > 0) {
          const error = new Error(
            `Sân còn ${upcoming} lịch đặt sắp tới. Hãy huỷ hoặc chuyển các lịch đó sang sân khác trước.`
          );
          error.statusCode = 409;
          throw error;
        }
      }

      const oldValues = court.toJSON();
      const updated = await court.update({ status }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: court.branchId, action, targetType: 'court', targetId: court.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return CourtService.formatCourt(updated);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = CourtService;
