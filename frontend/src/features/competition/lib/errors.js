import { courtName } from './format';

// Dịch lỗi của cổng thi đấu / competition-service sang câu tiếng Việt dễ hiểu (07 mục 3: "Lỗi nói bằng câu dễ hiểu, mã lỗi
// để nhỏ phía sau; lỗi do máy khác vừa đổi thì nói rõ và tải lại").

/** Mã lỗi nghĩa là "dữ liệu vừa đổi ở máy khác" — giao diện nên tải lại thay vì để người dùng thử lại mù. */
export const RELOAD_CODES = new Set([
  'INVALID_STATE', 'VERSION_CONFLICT', 'LIVE_CONFLICT', 'FILL_STALE', 'NEXT_MATCH_STARTED', 'MATCH_DECIDED', 'COURT_BUSY', 'NOT_READY'
]);

const BY_CODE = {
  COMPETITION_DISABLED: 'Tính năng thi đấu chưa được bật trên hệ thống này.',
  COMPETITION_UNAVAILABLE: 'Dịch vụ thi đấu đang tạm ngưng hoặc phản hồi quá chậm. Thử lại sau ít phút.',
  COMPETITION_AUTH_FAILED: 'Hệ thống không xác thực được với dịch vụ thi đấu (lỗi cấu hình). Báo quản trị viên.',
  FORBIDDEN_SCOPE: 'Tài khoản của bạn không có quyền thực hiện thao tác này.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
  INVALID_STATE: 'Mục này vừa được đổi ở máy khác (đã gọi ra sân, đã có kết quả…). Đã tải lại — kiểm tra rồi thử lại.',
  VERSION_CONFLICT: 'Dữ liệu vừa được sửa ở máy khác. Đã tải lại — kiểm tra rồi thử lại.',
  LIVE_CONFLICT: 'Máy khác vừa bấm điểm trận này. Đã tải lại tỉ số.',
  IDEMPOTENCY_IN_PROGRESS: 'Thao tác này đang được xử lý, đợi một chút.',
  PRECONDITION_REQUIRED: 'Dữ liệu đã cũ. Tải lại trang rồi thử lại.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh, thử lại sau ít phút.',
  NOT_FOUND: 'Không tìm thấy — có thể đã bị xoá hoặc bạn không có quyền xem.',
  PLAYER_ON_COURT: 'Người này đang thi đấu ở sân khác.',
  PRESENT_ELSEWHERE: 'Người này đang có mặt ở một buổi giao lưu khác.',
  INTERNAL_ERROR: 'Dịch vụ thi đấu gặp lỗi. Thử lại sau; nếu còn lỗi, báo quản trị viên.'
};

/** `bd:court:5` → `Sân 5` (service chỉ biết mã sân). */
export const courtText = (text) => String(text ?? '').replace(/(?:sân )?(bd:court:\d+)/gi, (_, ref) => courtName(ref));

const statusFallback = (status) => {
  if (status === 401) return BY_CODE.UNAUTHENTICATED;
  if (status === 403) return BY_CODE.FORBIDDEN_SCOPE;
  if (status === 404) return BY_CODE.NOT_FOUND;
  if (status === 429) return BY_CODE.RATE_LIMITED;
  if (status >= 500) return status === 503 || status === 504 ? BY_CODE.COMPETITION_UNAVAILABLE : BY_CODE.INTERNAL_ERROR;
  return null;
};

/**
 * Lỗi của axios / cổng → mô tả thống nhất.
 * `message`: câu hiển thị; `code`: mã máy đọc (hiển thị nhỏ); `fields`: lỗi theo ô khi validate;
 * `reload`: nên tải lại dữ liệu; `unavailable`: dịch vụ không dùng được (hiện thông báo thay vì trang lỗi).
 */
export const describeError = (err) => {
  if (!err) return { status: 0, code: null, message: 'Có lỗi xảy ra.', fields: [], reload: false, unavailable: false };
  const response = err.response;
  if (!response) {
    // Không có phản hồi: mất mạng, server tắt, bị huỷ.
    if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return { status: 0, code: 'CANCELED', message: '', fields: [], reload: false, unavailable: false, canceled: true };
    return { status: 0, code: 'NETWORK', message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', fields: [], reload: false, unavailable: true };
  }
  const { status, data } = response;
  const code = data?.code || null;
  const fields = Array.isArray(data?.errors)
    ? data.errors.filter((e) => e && (e.message || e.field)).map((e) => ({ field: e.field || null, message: courtText(e.message || '') }))
    : [];
  const unavailable = code === 'COMPETITION_UNAVAILABLE' || code === 'COMPETITION_DISABLED' || code === 'COMPETITION_AUTH_FAILED' || status === 502 || status === 503 || status === 504;

  let message;
  if (code && BY_CODE[code]) message = BY_CODE[code];
  else if (status === 400 && fields.length) message = `Dữ liệu chưa hợp lệ: ${fields.map((f) => (f.field ? `${f.field} — ${f.message}` : f.message)).join('; ')}`;
  else if (data?.message && status < 500) message = courtText(data.message);
  else message = statusFallback(status) || courtText(data?.message) || 'Có lỗi xảy ra.';

  return { status, code, message, fields, reload: RELOAD_CODES.has(code), unavailable };
};

/** Lỗi ném ra từ `competitionRequest` — mang sẵn mô tả để giao diện không phải tự dịch lại. */
export class CompetitionError extends Error {
  constructor(description, cause) {
    super(description.message || 'Có lỗi xảy ra.');
    this.name = 'CompetitionError';
    Object.assign(this, description);
    this.cause = cause;
  }
}

export const toCompetitionError = (err) => (err instanceof CompetitionError ? err : new CompetitionError(describeError(err), err));
