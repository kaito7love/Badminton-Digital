// Chính sách giữ chỗ (báo cáo 40, F3; kế hoạch 42). Hàm thuần, không đọc DB: nơi gọi tự nạp setting
// `booking_policy` (SettingService.getBookingPolicy) nên test được không cần DB.
//
//  - maxActivePerCustomer: số lịch pending/confirmed chưa qua giờ kết thúc mà một KHÁCH được giữ cùng lúc
//    (nhân viên không bị trần). 0 = không giới hạn.
//  - pendingExpiryHours: lịch do khách tự đặt mà chưa được duyệt sau chừng này giờ thì tự huỷ. 0 = tắt tự huỷ.
//  - pendingExpireBeforeStartMinutes: hoặc khi còn chừng này phút tới giờ bắt đầu mà vẫn chưa duyệt.
//  - luôn được giữ ít nhất MIN_HOLD_MINUTES kể từ lúc đặt, để khách đặt gấp không bị huỷ ngay.

const DEFAULT_BOOKING_POLICY = Object.freeze({
  maxActivePerCustomer: 5,
  pendingExpiryHours: 24,
  pendingExpireBeforeStartMinutes: 60
});
const MIN_HOLD_MINUTES = 15;
const LIMITS = { maxActivePerCustomer: 1000, pendingExpiryHours: 24 * 60, pendingExpireBeforeStartMinutes: 24 * 60 };

const pick = (value, key) => {
  const raw = value?.[key];
  const n = Number(raw);
  const valid = raw !== null && raw !== '' && raw !== undefined && Number.isInteger(n) && n >= 0 && n <= LIMITS[key];
  return valid ? n : DEFAULT_BOOKING_POLICY[key];
};

/** Setting thiếu hoặc lưu sai kiểu/ngoài miền thì dùng mặc định từng trường — không để trần thành NaN (= không chặn gì). */
const normalizeBookingPolicy = (value) => ({
  maxActivePerCustomer: pick(value, 'maxActivePerCustomer'),
  pendingExpiryHours: pick(value, 'pendingExpiryHours'),
  pendingExpireBeforeStartMinutes: pick(value, 'pendingExpireBeforeStartMinutes')
});

/** Khách đã giữ đủ trần chưa. Trả `null` nếu còn đặt được, hoặc câu thông báo. */
const activeBookingLimitViolation = ({ activeCount, limit }) => {
  if (!(limit > 0) || activeCount < limit) return null;
  return `Bạn đang giữ ${activeCount} lịch chưa chơi (tối đa ${limit}). Hãy huỷ bớt hoặc chơi xong rồi đặt thêm.`;
};

/**
 * Thời điểm lịch `pending` của khách hết hạn chờ duyệt: max(đặt + 15 phút, min(đặt + N giờ, bắt đầu − M phút)).
 * Trả `null` khi tắt tự huỷ (pendingExpiryHours = 0).
 */
const pendingExpiryAt = ({ createdAt, startAt, policy = DEFAULT_BOOKING_POLICY }) => {
  if (!(policy.pendingExpiryHours > 0)) return null;
  const created = new Date(createdAt).getTime();
  const start = new Date(startAt).getTime();
  const holdUntil = created + MIN_HOLD_MINUTES * 60000;
  const byAge = created + policy.pendingExpiryHours * 3600000;
  const byStart = start - policy.pendingExpireBeforeStartMinutes * 60000;
  return new Date(Math.max(holdUntil, Math.min(byAge, byStart)));
};

module.exports = {
  DEFAULT_BOOKING_POLICY,
  MIN_HOLD_MINUTES,
  normalizeBookingPolicy,
  activeBookingLimitViolation,
  pendingExpiryAt
};
