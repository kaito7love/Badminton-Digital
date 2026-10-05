import { fmtNumber } from './format';

// Chấm trình (docs/03 mục 2, 07): hàm thuần cho form chấm trình (dùng chung nhân viên + khách), hồ sơ người chơi, sổ điểm.
// Bộ tiêu chí (12 tiêu chí, 4 trang, mỗi tiêu chí 5 mức) do service trả về — frontend không chép lại.

export const DISCIPLINE_LABEL = { singles: 'Đơn', doubles: 'Đôi' };
export const FLAG_LABELS = { unverified: 'Chưa xác thực', needs_verification: 'Cần xác nhận', quick: 'Chấm nhanh' };
export const FLAG_FILTERS = [['', 'Tất cả'], ['unverified', 'Chưa xác thực'], ['needs_verification', 'Cần xác nhận'], ['quick', 'Chấm nhanh']];
export const REASON_LABEL = {
  assessment: 'Chấm trình', tournament: 'Giải đấu', session: 'Buổi giao lưu', adjustment: 'Quản lý chỉnh tay', unfinalize: 'Huỷ chốt giải', merge: 'Gộp hồ sơ'
};
export const SOURCE_LABEL = { self: 'Tự chấm', staff: 'Nhân viên chấm', staff_quick: 'Chấm nhanh', video_ai: 'AI từ video' };
export const ASSESSMENT_STATUS = { applied: 'Đã áp dụng', recorded: 'Đã ghi (điểm không đổi)', pending_review: 'Chờ duyệt', rejected: 'Đã từ chối', superseded: 'Đã bị thay thế' };

export const MIN_RATING = 1;
export const MAX_RATING = 7;
export const MIN_REASON = 10;

// ---- Các bước của form ----

/** [{ key, title }]: thông tin chơi → các trang tiêu chí → xem lại → kết quả. */
export const stepsOf = (rubric) => [
  { key: 'profile', title: 'Thông tin chơi' },
  ...rubric.pages.filter((p) => p.page > 0).map((p) => ({ key: `page:${p.page}`, title: p.title, page: p.page })),
  { key: 'review', title: 'Xem lại' },
  { key: 'result', title: 'Kết quả' }
];

export const criteriaOnPage = (rubric, page) => rubric.criteria.filter((c) => c.page === page);

/** Đã chọn đủ mọi tiêu chí của trang chưa. */
export const pageComplete = (rubric, page, answers) => criteriaOnPage(rubric, page).every((c) => Number.isInteger(answers[c.code]));

/** Tiêu chí đầu tiên chưa chọn (để nhảy tới sửa): { page, code } hoặc null. */
export const firstIncomplete = (rubric, answers) => {
  const c = rubric.criteria.find((x) => !Number.isInteger(answers[x.code]));
  return c ? { page: c.page, code: c.code } : null;
};

export const answeredCount = (rubric, answers) => rubric.criteria.filter((c) => Number.isInteger(answers[c.code])).length;

/** Thông tin chơi hợp lệ để sang bước sau: giới tính bắt buộc khi hồ sơ chưa có. */
export const profileError = (profile, { hasGender = false } = {}) => {
  if (!profile.gender && !hasGender) return 'Chọn giới tính để tiếp tục.';
  const year = profile.birthYear;
  if (year !== '' && year !== undefined && year !== null) {
    const n = Number(year);
    if (!Number.isInteger(n) || n < 1930 || n > new Date().getFullYear()) return 'Năm sinh không hợp lệ.';
  }
  return '';
};

const NUMERIC = new Set(['birthYear', 'playingSinceYear', 'sessionsPerWeek']);

/** Ô nhập → `profile` gửi service: bỏ ô trống, ép số. */
export const cleanProfile = (profile) => {
  const out = {};
  for (const [key, value] of Object.entries(profile || {})) {
    if (value === '' || value === null || value === undefined) continue;
    out[key] = NUMERIC.has(key) ? Number(value) : value;
  }
  return out;
};

/** Body `POST /players/:id/assessments` (nhân viên) hoặc `POST /me/assessments` (khách). */
export const buildAssessmentBody = ({ rubric, answers, profile, note }) => {
  const clean = cleanProfile(profile);
  return {
    rubricVersion: rubric.version,
    answers: Object.fromEntries(rubric.criteria.map((c) => [c.code, answers[c.code]])),
    ...(Object.keys(clean).length ? { profile: clean } : {}),
    ...(note && note.trim() ? { note: note.trim() } : {})
  };
};

/** Giải thích bằng lời khi điểm bị trần (docs/03 mục 2.4 [5]). `discipline` = một nhánh của kết quả tính thử. */
export const capExplanation = (discipline, result, rubric) => {
  if (!discipline || !discipline.cappedBy) return '';
  if (discipline.cappedBy === 'self_max') return `Điểm được giới hạn ở ${fmtNumber(discipline.rating)} vì đây là tự chấm — nhân viên chấm hoặc kết quả thi đấu sẽ điều chỉnh tiếp.`;
  if (discipline.cappedBy.startsWith('gate:') && result.gate) {
    const criterion = rubric.criteria.find((c) => c.code === result.gate.criterion);
    return `Điểm được giới hạn ở ${fmtNumber(discipline.rating)} vì ${criterion ? criterion.name : result.gate.criterion} chỉ ở mức ${result.gate.level} (tiêu chí then chốt).`;
  }
  return `Điểm bị giới hạn ở ${fmtNumber(discipline.rating)}.`;
};

// ---- Bản nháp tự lưu trên máy ----

export const draftKey = (who) => `cs-assess-draft-${who}`;
export const loadDraft = (who) => {
  try {
    const raw = localStorage.getItem(draftKey(who));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
};
export const saveDraft = (who, draft) => {
  try { localStorage.setItem(draftKey(who), JSON.stringify(draft)); } catch { /* chế độ riêng tư: không lưu */ }
};
export const clearDraft = (who) => {
  try { localStorage.removeItem(draftKey(who)); } catch { /* bỏ qua */ }
};

// ---- Chỉnh điểm tay ----

export const adjustError = (newRating, reason) => {
  const n = Number(newRating);
  if (newRating === '' || !Number.isFinite(n) || n < MIN_RATING || n > MAX_RATING) return `Điểm phải nằm trong ${MIN_RATING} – ${MAX_RATING}.`;
  if (String(reason || '').trim().length < MIN_REASON) return `Ghi lý do chỉnh điểm (tối thiểu ${MIN_REASON} ký tự).`;
  return '';
};

// ---- Hồ sơ / sổ điểm ----

/** Điểm hiển thị của một nội dung: { rating, level, reliability, ... } hoặc null nếu chưa có. */
export const ratingOf = (player, discipline) => (player && player.ratings && player.ratings[discipline]) || null;

/** "4.28 · Khá" hoặc "chưa có điểm". */
export const ratingText = (r) => (r ? `${fmtNumber(r.rating)} · ${r.level}` : 'chưa có điểm');

/** Dòng sổ điểm → câu nói được: "Giải đấu: 4.45 → 4.52 (+0.07)". */
export const changeText = (c) => {
  const reason = REASON_LABEL[c.reason] || c.reason;
  const delta = c.delta > 0 ? `+${fmtNumber(c.delta)}` : c.delta < 0 ? `−${fmtNumber(Math.abs(c.delta))}` : '±0';
  return c.before === null || c.before === undefined
    ? `${reason}: khởi tạo ${fmtNumber(c.after)}`
    : `${reason}: ${fmtNumber(c.before)} → ${fmtNumber(c.after)} (${delta})`;
};

/** "Chi tiết từng trận" của một dòng sổ điểm sau thi đấu (E, K, kết quả). Rỗng nếu không có. */
export const calcRows = (c) => (c.calc && Array.isArray(c.calc.matches) ? c.calc.matches : []);

/** Độ tin cậy 0–100 → nhãn: "mới" | "đang ổn định" | "ổn định". */
export const reliabilityText = (value) => {
  const v = Number(value) || 0;
  return v < 30 ? 'điểm còn mới' : v < 70 ? 'đang ổn định dần' : 'ổn định';
};
