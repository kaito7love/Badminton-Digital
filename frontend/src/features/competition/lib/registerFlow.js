import { QUICK_LEVELS } from './labels';
import { FEE_PER_PERSON_VND, formatVnd } from './publicHub';

// Logic thuần của hộp thoại "Đăng ký giải" trên trang công khai (plan 27, p4): kiểm thông tin đồng đội chưa có tài khoản, dựng body gửi lên,
// đọc lỗi theo ô, câu tiền. Luật khớp service (`player/domain/guest.js`) — service vẫn là nơi quyết định, đây chỉ để báo lỗi sớm, không chờ một vòng gọi mạng.

export const GUEST_LEVELS = QUICK_LEVELS;
export const GUEST_GENDERS = [['male', 'Nam'], ['female', 'Nữ']];
export const emptyGuest = () => ({ name: '', phone: '', gender: '', level: '' });

const NAME_PATTERN = /^[\p{L}][\p{L} .'’-]{0,98}[\p{L}.]$/u;

/** Gom khoảng trắng, bỏ khoảng trắng đầu / cuối. */
export const cleanName = (raw) => String(raw ?? '').trim().replace(/\s+/g, ' ');

/** SĐT di động Việt Nam → dạng chuẩn 0xxxxxxxxx; chấp nhận +84…, 84…, khoảng trắng, dấu chấm / gạch. Sai → null. */
export const normalizePhone = (raw) => {
  let digits = String(raw ?? '').replace(/[\s.()-]/g, '');
  if (/^\+84\d{9}$/.test(digits)) digits = `0${digits.slice(3)}`;
  else if (/^84\d{9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^0\d{9}$/.test(digits) ? digits : null;
};

/** 0912345678 → "0912 345 678" cho dễ đọc. */
export const phoneText = (phone) => {
  const p = normalizePhone(phone);
  return p ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : String(phone ?? '');
};

/** Lỗi theo ô của form đồng đội chưa có tài khoản: `{ name?, phone?, gender?, level? }` — rỗng = hợp lệ. */
export const validateGuestForm = (guest) => {
  const g = guest || {};
  const errors = {};
  if (!NAME_PATTERN.test(cleanName(g.name))) errors.name = 'Nhập họ tên đồng đội (chữ, 2–100 ký tự)';
  if (!normalizePhone(g.phone)) errors.phone = 'Số điện thoại di động gồm 10 số (vd 0912 345 678)';
  if (!['male', 'female'].includes(g.gender)) errors.gender = 'Chọn giới tính';
  if (!GUEST_LEVELS.some(([v]) => v === g.level)) errors.level = 'Chọn mức trình gần đúng';
  return errors;
};

/**
 * Chọn đồng đội theo hai cách: `mode` = 'existing' (người đã có trong hệ thống, `picked` = kết quả tìm) hoặc 'guest' (chưa có tài khoản, `guest` = form).
 * Người chọn từ tìm kiếm mà chưa có điểm thì chưa đăng ký được (service sẽ từ chối NEEDS_ASSESSMENT) — chặn sớm.
 */
export const partnerProblem = ({ mode, picked, guest }) => {
  if (mode === 'guest') {
    const errors = validateGuestForm(guest);
    return Object.keys(errors).length ? { kind: 'form', errors } : null;
  }
  if (!picked) return { kind: 'missing', message: 'Chọn đồng đội của bạn' };
  if (!picked.rated) return { kind: 'unrated', message: `${picked.name} chưa có điểm trình nên chưa đăng ký giải được — hãy nhờ họ tự chấm trình, hoặc nhập họ như người chưa có tài khoản.` };
  return null;
};

/** Sẵn sàng gửi chưa: giải đơn → luôn; giải đôi cặp cố định → đồng đội phải hợp lệ. */
export const registerReady = ({ needsPartner, mode, picked, guest }) => !needsPartner || partnerProblem({ mode, picked, guest }) === null;

/** Body gửi `POST /me/tournaments/:id/entries`: `{}` (giải đơn) hoặc `{ partner: { playerId } | { guest } }`. Họ tên + SĐT được chuẩn hoá. */
export const buildRegisterBody = ({ needsPartner, mode, picked, guest }) => {
  if (!needsPartner) return {};
  if (mode === 'guest') {
    const g = guest || {};
    return { partner: { guest: { name: cleanName(g.name), phone: normalizePhone(g.phone) || String(g.phone ?? '').trim(), gender: g.gender, level: g.level } } };
  }
  return { partner: { playerId: picked.id } };
};

/** Lệ phí dự kiến của lần đăng ký: số người × 200.000đ — chỉ hiển thị, thanh toán tại quầy. */
export const feeSummary = (needsPartner) => {
  const people = needsPartner ? 2 : 1;
  return { people, total: people * FEE_PER_PERSON_VND, text: people === 1 ? `${formatVnd(FEE_PER_PERSON_VND)}` : `${people} × ${formatVnd(FEE_PER_PERSON_VND)} = ${formatVnd(people * FEE_PER_PERSON_VND)}` };
};

/** Người này đã có điểm cho nội dung của giải chưa? `me` = hồ sơ `/me` (`ratings.singles|doubles`). */
export const hasRatingFor = (me, discipline) => Boolean(me && me.ratings && me.ratings[discipline === 'doubles' ? 'doubles' : 'singles']);

/** Lỗi theo ô từ phản hồi 422 INVALID_GUEST (`fields: [{ field: 'guest.phone', message }]`) → `{ phone: '…' }`. */
export const guestFieldErrors = (err) => {
  const out = {};
  for (const f of (err && err.fields) || []) {
    const m = /^guest\.(name|phone|gender|level)$/.exec(f.field || '');
    if (m && !out[m[1]]) out[m[1]] = f.message;
  }
  return out;
};

/** Mã lỗi → gợi ý hành động cho khách (thêm vào dưới câu lỗi của service). null = không có gợi ý. */
export const registerErrorHint = (err) => {
  switch (err && err.code) {
    case 'NEEDS_ASSESSMENT': return { kind: 'assess', text: 'Người chưa có điểm trình cần được chấm trước. Nếu là bạn — tự chấm trình chỉ mất vài phút.' };
    case 'GUEST_LIMIT': return { kind: 'staff', text: 'Hãy nhờ nhân viên thêm đồng đội ở quầy.' };
    case 'WITHDRAW_LOCKED': return { kind: 'staff', text: 'Liên hệ nhân viên nếu bạn không thể tham gia nữa.' };
    case 'NOT_ELIGIBLE': return { kind: 'staff', text: 'Điều kiện của giải ghi ở phần thông tin phía trên. Cần xét lại điểm thì hỏi nhân viên ở quầy.' };
    default: return null;
  }
};

/** Câu kết quả sau khi đăng ký (toast): vào danh sách chính thức hay danh sách chờ. `me` = `me` của chi tiết giải trả về. */
export const registerToast = (me, needsPartner) => {
  const e = me && me.entry;
  if (e && e.status === 'waitlisted') return `Đã vào danh sách chờ${e.waitlistPosition ? ` (thứ ${e.waitlistPosition})` : ''}`;
  return needsPartner ? 'Đã đăng ký cả cặp' : 'Đã đăng ký';
};

/** Câu kết quả sau khi tham gia buổi giao lưu. */
export const signupToast = (me) => (me && me.status === 'waitlisted'
  ? `Đã vào danh sách chờ${me.waitlistPosition ? ` (thứ ${me.waitlistPosition})` : ''}`
  : 'Đã đăng ký giữ chỗ');

/** Câu xác nhận trước khi rút khỏi giải. `me` = `me` của chi tiết giải. */
export const withdrawText = (me, needsPartner) => {
  const e = me && me.entry;
  const pair = needsPartner && e && e.players && e.players.length > 1 ? ` Cả cặp (${e.players.map((p) => p.name).join(' & ')}) sẽ cùng rút.` : '';
  return `Bạn sẽ rút khỏi giải; người đầu danh sách chờ (nếu có) được lên thay.${pair}`;
};

/** Gợi ý tìm đồng đội: cần ≥ 2 ký tự có nghĩa. */
export const canSearchPartners = (text) => String(text ?? '').trim().length >= 2;
