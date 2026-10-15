// Nội dung thông báo cho khách (kế hoạch 43). Hàm thuần, không đọc DB — nên test được và luôn chỉ chứa tên sân,
// ngày, giờ: không tên nhân viên, không SĐT, không thông tin nào khác.

const TYPES = Object.freeze({
  CONFIRMED: 'booking.confirmed',
  EXPIRED: 'booking.expired',
  CANCELLED_BY_STAFF: 'booking.cancelled_by_staff',
  RESCHEDULED: 'booking.rescheduled'
});

const dateLabel = (value) => {
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const timeLabel = (value) => String(value).slice(0, 5);

/** "Sân số 1 · 16/10/2026 · 19:00–20:00" */
const slotLabel = ({ courtName, bookingDate, startTime, endTime }) =>
  `${courtName || 'Sân'} · ${dateLabel(bookingDate)} · ${timeLabel(startTime)}–${timeLabel(endTime)}`;

/**
 * @param {string} type một trong TYPES
 * @param {{ courtName, bookingDate, startTime, endTime }} booking trạng thái hiện tại của lịch
 * @param {{ previous?: object }} extra `previous` (cùng dạng `booking`) cho loại RESCHEDULED
 * @returns {{ title: string, body: string }}
 */
const buildNotification = (type, booking, extra = {}) => {
  const slot = slotLabel(booking);
  switch (type) {
    case TYPES.CONFIRMED:
      return { title: 'Lịch đặt sân đã được xác nhận', body: `${slot} đã được cửa hàng xác nhận. Hẹn gặp bạn tại sân!` };
    case TYPES.EXPIRED:
      return {
        title: 'Lịch đặt sân đã bị huỷ',
        body: `${slot} đã bị huỷ vì chưa được xác nhận kịp thời. Bạn có thể đặt lại một khung giờ khác.`
      };
    case TYPES.CANCELLED_BY_STAFF:
      return {
        title: 'Cửa hàng đã huỷ lịch đặt sân',
        body: `${slot} đã được cửa hàng huỷ. Vui lòng liên hệ quầy nếu bạn cần hỗ trợ.`
      };
    case TYPES.RESCHEDULED:
      return {
        title: 'Lịch đặt sân của bạn đã được đổi',
        body: extra.previous
          ? `Lịch ${slotLabel(extra.previous)} đã được đổi sang ${slot}.`
          : `Lịch của bạn đã được đổi sang ${slot}.`
      };
    default:
      throw new Error(`Loại thông báo không hợp lệ: ${type}`);
  }
};

/** Chính sách thông báo (`notification_policy`): hiện chỉ có công tắc email, mặc định bật. */
const normalizeNotificationPolicy = (value) => ({ email: value?.email !== false && value?.email !== 'false' });

module.exports = { TYPES, slotLabel, buildNotification, normalizeNotificationPolicy };
