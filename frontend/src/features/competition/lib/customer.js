import { fmtDate } from './format';
import { REASON_LABEL } from './rating';

// Màn hình của khách (07 mục 1.1): trình độ của tôi, hồ sơ, bảng xếp hạng, giải của tôi — hàm thuần, có test.

export const RATING_CATEGORIES = [['MD', 'Đôi nam'], ['WD', 'Đôi nữ'], ['MS', 'Đơn nam'], ['WS', 'Đơn nữ']];
export const POINT_CATEGORIES = [...RATING_CATEGORIES, ['XD', 'Đôi nam nữ']];
export const AGE_GROUPS = [['', 'Mọi tuổi'], ['U18', 'Dưới 18'], ['18-34', '18–34'], ['35-44', '35–44'], ['45-54', '45–54'], ['55+', '55+']];
export const LEVEL_FILTERS = [
  ['', 'Mọi trình'], ['beginner', 'Mới chơi'], ['weak', 'Yếu'], ['tb_minus', 'TB-'], ['tb', 'TB'], ['tb_plus', 'TB+'], ['kha', 'Khá'],
  ['kha_gioi', 'Khá giỏi'], ['ban_chuyen', 'Bán chuyên'], ['chuyen_nghiep', 'Chuyên nghiệp']
];
export const VISIBILITY = [
  ['members', 'Thành viên', 'Người đã đăng nhập thấy tên đầy đủ; bảng xếp hạng công khai che tên bạn.'],
  ['public', 'Công khai', 'Bảng xếp hạng công khai hiện tên thi đấu của bạn (chưa đặt thì hiện họ tên rút gọn).'],
  ['hidden', 'Ẩn', 'Không lên bảng xếp hạng, không ai mở được hồ sơ của bạn. Vẫn được ghép cặp và vẫn có điểm.']
];

/** Bảng mặc định theo giới tính: nam → Đôi nam, nữ → Đôi nữ. */
export const defaultCategory = (gender) => (gender === 'female' ? 'WD' : 'MD');

/** "▲2" / "▼1" / "—" (movement so với kỳ trước; null = mới lên bảng). */
export const movementText = (m) => (m === null || m === undefined ? 'mới' : m > 0 ? `▲${m}` : m < 0 ? `▼${Math.abs(m)}` : '—');

/**
 * Tự chấm / chấm lại được không (docs/03 mục 2.4): khoá khi đã có trận tính điểm hoặc nhân viên đã chấm / xác nhận.
 * Người chưa có điểm thì luôn chấm được. Trả { can, reason }.
 */
export const selfAssessState = (player) => {
  const rows = ['singles', 'doubles'].map((d) => (player && player.ratings ? player.ratings[d] : null)).filter(Boolean);
  if (!rows.length) return { can: true, reason: '' };
  if (rows.some((r) => r.ratedMatches > 0)) return { can: false, reason: 'Bạn đã có trận tính điểm — điểm giờ do kết quả thi đấu quyết định, không tự chấm lại được.' };
  if (rows.some((r) => r.verified)) return { can: false, reason: 'Trình độ đã được nhân viên chấm / xác nhận — không tự chấm đè lên được. Cần chỉnh thì nhờ nhân viên ở quầy.' };
  return { can: true, reason: '' };
};

// ---- Biểu đồ điểm theo thời gian ----

/**
 * Sổ điểm → các dòng cho biểu đồ: { at, label, reason, singles?, doubles? } theo thứ tự thời gian. Hai nội dung đổi cùng một lúc (vd chấm trình cho cả Đơn
 * lẫn Đôi) gộp thành MỘT dòng — trục thời gian không có hai mốc trùng.
 */
export const chartRows = (history) => {
  const byTime = new Map();
  for (const c of [...(history || [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    const at = Date.parse(c.createdAt);
    const row = byTime.get(at) || { at, label: fmtDate(c.createdAt), reason: REASON_LABEL[c.reason] || c.reason };
    row[c.discipline] = Number(c.after);
    byTime.set(at, row);
  }
  return [...byTime.values()];
};

// ---- Hồ sơ của tôi ----

export const nicknameError = (value) => {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.length < 2 || v.length > 30) return 'Tên thi đấu dài 2–30 ký tự.';
  return '';
};

export const profileForm = (p) => ({
  nickname: p.nickname || '',
  birthYear: p.birthYear || '',
  dominantHand: p.dominantHand || '',
  playingSinceYear: p.playingSinceYear || '',
  sessionsPerWeek: p.sessionsPerWeek ?? '',
  preferredPlay: p.preferredPlay || '',
  doublesPosition: p.doublesPosition || '',
  homeOrganizerRef: p.homeOrganizerRef || '',
  visibility: p.visibility || 'members',
  gender: p.gender || ''
});

const NUMERIC = new Set(['birthYear', 'playingSinceYear', 'sessionsPerWeek']);
const NULLABLE = new Set(['nickname', 'dominantHand', 'preferredPlay', 'doublesPosition', 'homeOrganizerRef', 'birthYear', 'playingSinceYear', 'sessionsPerWeek']);

/** Chỉ gửi các ô đã đổi (PATCH /me); ô trống → null (xoá); giới tính chỉ gửi khi mở khoá. */
export const buildProfilePatch = (form, original, { genderLocked = true } = {}) => {
  const base = profileForm(original);
  const patch = {};
  for (const key of Object.keys(base)) {
    if (key === 'gender' && genderLocked) continue;
    const next = typeof form[key] === 'string' ? form[key].trim() : form[key];
    const prev = base[key];
    if (String(next ?? '') === String(prev ?? '')) continue;
    if (next === '' || next === null || next === undefined) { if (NULLABLE.has(key)) patch[key] = null; continue; }
    patch[key] = NUMERIC.has(key) ? Number(next) : next;
  }
  return patch;
};

// ---- Giải của tôi ----

/** Nhãn trạng thái của một dòng "giải của tôi". */
export const myTournamentState = (item) => {
  const s = item.tournament.status;
  if (s === 'finalized') return item.placement ? { label: `Đã kết thúc · ${item.placement.label || item.placement}`, tone: 'done' } : { label: 'Đã kết thúc', tone: 'done' };
  if (s === 'cancelled') return { label: 'Đã huỷ', tone: 'bad' };
  if (['drawn', 'in_progress'].includes(s)) return { label: 'Đang thi đấu', tone: 'live' };
  return { label: 'Đang mở đăng ký', tone: 'open' };
};

/** Trận đang đánh của tôi trong một giải (để hiện nút bấm điểm). `matches` = `GET /me/matches?scope=upcoming` đã lọc theo giải. */
export const myLiveMatch = (matches) => (matches || []).find((m) => m.status === 'in_play') || null;

/** Gom danh sách trận của tôi theo giải (contextId): Map<tournamentId, match[]>. */
export const groupByTournament = (matches) => {
  const out = new Map();
  for (const m of matches || []) {
    if (m.contextType !== 'tournament') continue;
    if (!out.has(m.contextId)) out.set(m.contextId, []);
    out.get(m.contextId).push(m);
  }
  return out;
};

/** "Đối đầu": "Thắng 3 – Thua 1 trong 4 trận". */
export const headToHeadText = (h) => (h && h.matches ? `Bạn thắng ${h.wins} – thua ${h.losses} trong ${h.matches} trận` : 'Chưa có trận nào với người này');
