const { Op } = require('sequelize');
const { CustomerNotification, Customer, User, Court } = require('../models');
const SettingService = require('./SettingService');
const { buildNotification, TYPES } = require('../utils/notificationMessages');
const { isMailConfigured, sendBookingNotificationEmail } = require('../utils/mailer');

const READ_RETENTION_DAYS = 30;
const ALL_RETENTION_DAYS = 90;

/**
 * Thông báo trong ứng dụng cho khách + email cộng thêm (kế hoạch 43).
 *
 * `notifyBooking` ghi trong CÙNG transaction với thay đổi trạng thái lịch (nên trạng thái và thông báo cùng thành
 * công hoặc cùng thất bại); email chỉ gửi SAU commit, nuốt lỗi — không bao giờ làm hỏng thao tác của nhân viên.
 */
class NotificationService {
  static get TYPES() {
    return TYPES;
  }

  /** Mô tả khung của một lịch (kèm tên sân) — dùng làm "trước khi đổi" cho thông báo đổi lịch. */
  static async describeSlot(booking, { transaction = null } = {}) {
    const court = await Court.findByPk(booking.courtId, { attributes: ['id', 'name'], transaction });
    return {
      courtName: court?.name,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime
    };
  }

  /**
   * Tạo thông báo cho khách của `booking` (nếu khách có tài khoản). Trả về `{ notification, delivery }` hoặc
   * null khi không có ai để báo (khách vãng lai không tài khoản).
   */
  static async notifyBooking(type, booking, { transaction, previous = null } = {}) {
    if (!booking?.customerId) return null;
    const customer = await Customer.findByPk(booking.customerId, {
      attributes: ['id', 'userId', 'fullName', 'email'],
      transaction
    });
    if (!customer || !customer.userId) return null;

    const slot = await NotificationService.describeSlot(booking, { transaction });
    const { title, body } = buildNotification(type, slot, { previous });
    const notification = await CustomerNotification.create({
      customerId: customer.id,
      branchId: booking.branchId || null,
      type,
      title,
      body,
      bookingId: booking.id
    }, { transaction });
    return { notification, delivery: { customerId: customer.id, userId: customer.userId, fullName: customer.fullName, fallbackEmail: customer.email } };
  }

  /**
   * Email cộng thêm — gọi SAU commit. Chỉ gửi khi đã cấu hình SMTP, khách có email và `notification_policy.email`
   * không bị tắt. Không bao giờ ném lỗi ra ngoài.
   */
  static deliverEmail(result) {
    if (!result?.notification || !isMailConfigured()) return;
    Promise.resolve().then(async () => {
      const policy = await SettingService.getNotificationPolicy();
      if (!policy.email) return;
      const user = await User.findByPk(result.delivery.userId, { attributes: ['id', 'email'] });
      const to = user?.email || result.delivery.fallbackEmail;
      if (!to) return;
      await sendBookingNotificationEmail({
        to,
        fullName: result.delivery.fullName,
        title: result.notification.title,
        body: result.notification.body
      });
    }).catch((err) => {
      console.error(`[notification] Không gửi được email thông báo #${result.notification.id}:`, err.message);
    });
  }

  // ---- phía khách đọc -------------------------------------------------------------------------------------

  static async list(customerId, { limit = 20, unreadOnly = false } = {}) {
    const where = { customerId };
    if (unreadOnly) where.readAt = null;
    const [items, unreadCount] = await Promise.all([
      CustomerNotification.findAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit }),
      CustomerNotification.count({ where: { customerId, readAt: null } })
    ]);
    return { items, unreadCount };
  }

  /** Đánh dấu một thông báo của CHÍNH khách đã đọc; của người khác hoặc không có → null (route trả 404). */
  static async markRead(id, customerId) {
    const row = await CustomerNotification.findOne({ where: { id, customerId } });
    if (!row) return null;
    if (!row.readAt) await row.update({ readAt: new Date() });
    return row;
  }

  static async markAllRead(customerId) {
    const [updated] = await CustomerNotification.update(
      { readAt: new Date() },
      { where: { customerId, readAt: null } }
    );
    return updated;
  }

  /** Dọn: đã đọc > 30 ngày, mọi thông báo > 90 ngày. Gọi từ vòng quét 5 phút của server.js. */
  static async purgeOld(now = new Date()) {
    const days = (n) => new Date(now.getTime() - n * 24 * 3600 * 1000);
    return CustomerNotification.destroy({
      where: {
        [Op.or]: [
          { createdAt: { [Op.lt]: days(ALL_RETENTION_DAYS) } },
          { readAt: { [Op.ne]: null, [Op.lt]: days(READ_RETENTION_DAYS) } }
        ]
      }
    });
  }
}

module.exports = NotificationService;
