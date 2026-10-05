// Định dạng dùng chung cho các màn hình thi đấu — hàm thuần, có test.

// Tên sân thật của chi nhánh (nhân viên tải được từ /courts): `bd:court:3` → "Sân số 3 (Thường)". Chưa biết thì "Sân 3" (khách / màn hình TV không tải được danh sách sân).
const courtLabels = new Map();
export const registerCourtNames = (courts) => { for (const c of courts || []) if (c && c.id != null && c.name) courtLabels.set(`bd:court:${c.id}`, c.name); };
export const courtName = (ref) => courtLabels.get(ref) || String(ref ?? '').replace(/^bd:court:/, 'Sân ');

// Tên chi nhánh thật (từ /public/branches của app chính): `bd:branch:2` → "Chi nhánh Quận 3". Chưa biết thì "Chi nhánh 2".
const branchLabels = new Map();
export const registerBranchNames = (branches) => { for (const b of branches || []) if (b && b.id != null && b.name) branchLabels.set(`bd:branch:${b.id}`, b.name); };
export const orgName = (ref) => (ref === '*' ? 'Mọi chi nhánh' : branchLabels.get(ref) || String(ref ?? '').replace(/^bd:branch:/, 'Chi nhánh '));

/** Bỏ dấu + chữ thường để tìm "nguyen" ra "Nguyễn" (đ / Đ cũng đổi). */
export const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

/** Mọi từ gõ vào đều phải có trong một trong các chuỗi (không phân biệt dấu / hoa thường). */
export const matchesQuery = (query, ...haystacks) => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(haystacks.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
};

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');

export const fmtNumber = (value, digits = 2) => (value === null || value === undefined || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits));

/** Số có dấu: +0.15 / −0.07 (dùng cho điểm trình đổi sau giải). */
export const fmtDelta = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (Math.abs(n) < 10 ** -digits / 2) return (0).toFixed(digits);
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;
};

/** ms → `m:ss` hoặc `h:mm:ss` (đồng hồ sân đang đánh). */
export const fmtDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${Math.floor((total % 3600) / 60)}:${ss}`;
};

/** `HH:mm` + số phút → `HH:mm` (giờ dự kiến của lượt). */
export const addMinutes = (hhmm, minutes) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Tên đội: "A + B" (đôi) hoặc "A" (đơn); null → '' (giao diện tự hiện "chờ xác định"). */
export const teamText = (team) => (team && team.players ? team.players.map((p) => p.name).join(' + ') : '');

/** { bestOf: 3, points: 21 } → "3 game × 21". */
export const rulesText = (scoring) => (scoring ? `${scoring.bestOf} game × ${scoring.points}` : '');

/** Chuỗi tỉ số các game: [[21,15],[18,21]] → "21–15, 18–21". */
export const gamesText = (games) => (games || []).map((g) => g.join('–')).join(', ');
