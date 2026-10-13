import { courtName, fmtNumber } from './format';
import { MODE, presetOf } from './labels';

// Buổi giao lưu (07 mục 1.2, 06 mục 3): mô hình dẫn xuất cho trang buổi + đổi chỗ khi xem trước "Xếp sân trống". Hàm thuần, có test.

export const SESSION_FORMAT = { singles: 'Đơn', doubles: 'Đôi' };
export const perCourt = (format) => (format === 'singles' ? 2 : 4);

/** Dòng mô tả: "Đôi · cân bằng · 1 game × 21 · không tính điểm trình · Sân 1, Sân 2". */
export const sessionInfo = (s) => [
  SESSION_FORMAT[s.format] || s.format,
  MODE[s.mode] || s.mode,
  s.scoring ? `${s.scoring.bestOf} game × ${s.scoring.points}` : '',
  s.rated ? 'tính điểm trình khi đóng buổi' : 'không tính điểm trình',
  s.maxPlayers ? `tối đa ${s.maxPlayers} người` : '',
  (s.courtRefs || []).map(courtName).join(', ')
].filter(Boolean).join(' · ');

/** Ô "Sức chứa" của form buổi → số nguyên 2–200, hoặc null (để trống = không giới hạn); sai → { error }. */
export const parseMaxPlayers = (raw) => {
  const text = String(raw ?? '').trim();
  if (text === '') return { value: null };
  if (!/^\d+$/.test(text) || Number(text) < 2 || Number(text) > 200) return { error: 'Sức chứa là số nguyên từ 2 đến 200 (để trống = không giới hạn).' };
  return { value: Number(text) };
};

/** Tóm tắt đăng ký online của buổi cho tiêu đề thẻ: "3 giữ chỗ · 2 chờ · tối đa 12". */
export const signupSummary = (signups, maxPlayers) => {
  const list = signups || [];
  const registered = list.filter((r) => r.status === 'registered').length;
  const waitlisted = list.filter((r) => r.status === 'waitlisted').length;
  const attended = list.filter((r) => r.status === 'attended').length;
  return [`${registered} giữ chỗ`, waitlisted ? `${waitlisted} chờ` : '', attended ? `${attended} đã đến` : '', maxPlayers ? `tối đa ${maxPlayers}` : ''].filter(Boolean).join(' · ');
};

/** Phân nhóm danh sách điểm danh: đang trên sân / đang chờ (có mặt chưa ra sân) / đã rời. */
export const rosterGroups = (roster) => {
  const present = roster.filter((r) => r.status === 'present');
  return {
    present,
    onCourt: present.filter((r) => r.onCourt),
    waiting: present.filter((r) => !r.onCourt),
    left: roster.filter((r) => r.status === 'left')
  };
};

/** Ghi chú ngắn cho một người trong danh sách: "đang ở Sân 2" / "chờ 12 phút" / "đã rời". */
export const rosterNote = (r, now = Date.now()) => {
  if (r.status === 'left') return 'đã rời buổi';
  if (r.onCourt) return `đang ở ${courtName(r.onCourt)}`;
  if (r.waitingSince) {
    const minutes = Math.max(0, Math.round((now - Date.parse(r.waitingSince)) / 60000));
    return minutes < 1 ? 'vừa vào hàng chờ' : `chờ ${minutes} phút`;
  }
  return 'đang chờ';
};

/** Lỗi điểm danh → bước tiếp theo của giao diện. */
export const checkInPlan = (error) => {
  if (!error) return { kind: 'none' };
  if (error.code === 'NEEDS_ASSESSMENT') return { kind: 'quick' };
  if (error.code === 'PRESENT_ELSEWHERE') {
    const other = (error.fields || [])[0];
    return { kind: 'elsewhere', sessionId: other ? other.field : null, sessionName: other ? other.message : '' };
  }
  return { kind: 'error' };
};

// ---- Xếp sân trống: bản xem trước + đổi chỗ ----

/** Trạng thái chỉnh sửa từ `POST …/fill-courts/preview`. */
export const initFill = (p) => ({
  assignments: p.assignments.map((a) => ({ court: a.court, sideA: [...a.sideA], sideB: [...a.sideB], repeatPartners: a.repeatPartners || 0 })),
  waiting: [...p.waiting],
  moved: false
});

const parseLoc = (loc) => {
  const [kind, a, b, c] = loc.split(':');
  return kind === 'a' ? { kind, i: Number(a), side: b === 'B' ? 'sideB' : 'sideA', j: Number(c) } : { kind, k: Number(a) };
};

/** Đổi chỗ hai người: loc = `a:<sân>:<A|B>:<vị trí>` (đang xếp vào sân) hoặc `w:<thứ tự chờ>`. Không sửa trạng thái cũ. */
export const swapFill = (st, locA, locB) => {
  const A = parseLoc(locA);
  const B = parseLoc(locB);
  const assignments = st.assignments.map((a) => ({ ...a, sideA: [...a.sideA], sideB: [...a.sideB] }));
  const waiting = [...st.waiting];
  const get = (L) => (L.kind === 'a' ? assignments[L.i][L.side][L.j] : waiting[L.k]);
  const put = (L, value) => { if (L.kind === 'a') assignments[L.i][L.side][L.j] = value; else waiting[L.k] = value; };
  const x = get(A);
  const y = get(B);
  put(A, y);
  put(B, x);
  return { ...st, assignments, waiting, moved: true };
};

/** Body `POST …/fill-courts`: không sửa gì → chỉ gửi seed (service tự xếp lại y như bản xem trước); có sửa → gửi nguyên văn bản đã sửa. */
export const buildFillBody = (p, st) => (st.moved
  ? { seed: p.seed, assignments: st.assignments.map(({ court, sideA, sideB }) => ({ court, sideA, sideB })) }
  : { seed: p.seed });

/** Tên + điểm một người trong bản xem trước: "An · 3.25". */
export const personLabel = (p, id) => {
  const x = p.players && p.players[id];
  return x ? `${x.name || '?'}${x.pairingRating != null ? ` · ${fmtNumber(x.pairingRating)}` : ''}` : id;
};

/** Cảnh báo cặp đồng đội đã chung đội ở các lượt trước (chỉ tính cho bản gốc — sửa tay thì không còn đúng). */
export const repeatWarning = (st, a) => (!st.moved && a.repeatPartners > 0 ? `${a.repeatPartners} cặp đã chung đội ở lượt trước` : '');

/** Gợi ý số liệu trên danh sách trận của buổi: "Lượt 2". */
export const roundLabel = (m) => m.label || `Lượt ${m.roundNo}`;

export const scoringPreset = (s) => presetOf(s.scoring);
