// Màn hình bấm điểm trực tiếp (07 mục 1.2, 06 mục 1.5): hàm thuần — bên sân, "hết game", nhắc đổi sân, dòng trạng thái.

/**
 * Thứ tự hai nửa màn hình [trái, phải]. `endsSwapped` (service tính từ chuỗi pha cầu) đổi bên theo đúng luật; `flip` là nút
 * "⇆ Đổi bên" riêng của máy đang bấm (người bấm đứng phía bên kia sân) — hai cái chồng lên nhau (đổi hai lần = về chỗ cũ).
 */
export const sidesOf = (live, flip = false) => (Boolean(live && live.endsSwapped) !== Boolean(flip) ? ['B', 'A'] : ['A', 'B']);

const INDEX = { A: 0, B: 1 };
export const pointsOf = (pair, side) => pair[INDEX[side]];

/** "21–18, 21–15" — các game đã xong. */
export const gamesLine = (live) => (live ? live.games.map((g) => `${g[0]}–${g[1]}`).join(', ') : '');

/** Dòng trạng thái to: "Trận 3 game × 21 · Game 2/3 · Ván 1–0" (Ván và game xếp theo trái – phải của `sides`). */
export const statusLine = (match, live, sides = ['A', 'B']) => {
  const { bestOf = 1, points } = match.scoring || {};
  const head = bestOf > 1 ? `Trận ${bestOf} game × ${points}` : `Trận 1 game × ${points}`;
  if (!live) return head;
  const parts = [head];
  if (live.decided) parts.push('Đủ điểm thắng');
  else parts.push(`Game ${live.gameNo}${bestOf > 1 ? `/${bestOf}` : ''}`);
  if (bestOf > 1) parts.push(`Ván ${pointsOf(live.gamesWon, sides[0])}–${pointsOf(live.gamesWon, sides[1])}`);
  return parts.join(' · ');
};

/**
 * Hết một game mà trận còn đánh tiếp: game mới chưa có điểm nào và đã có game xong. Hai nửa khoá cho tới khi bấm "Tiếp tục"
 * (`acked` = số game xong mà người bấm đã xác nhận). Hoàn tác điểm cuối game thì game quay lại đang đánh → hết khung.
 */
export const gameBreakOf = (live, acked = 0) => {
  if (!live || live.decided || !live.current || live.games.length === 0) return null;
  if (live.current[0] !== 0 || live.current[1] !== 0) return null;
  if (live.games.length <= acked) return null;
  const last = live.games[live.games.length - 1];
  return { endedNo: live.games.length, nextNo: live.games.length + 1, score: last, winnerSide: last[0] > last[1] ? 'A' : 'B' };
};

/** Game quyết định của trận nhiều game: một đội chạm nửa số điểm (11 với game 21, 8 với game 15) → đổi sân (06 mục 1.5). */
export const midChangeHalf = (match, live) => {
  const { bestOf = 1, points = 21 } = match.scoring || {};
  if (bestOf < 2 || !live || live.decided || live.gameNo !== bestOf || !live.current) return null;
  const half = Math.ceil(points / 2);
  return Math.max(live.current[0], live.current[1]) >= half ? half : null;
};

/** Trận đang trong trận nhiều game, đã có game xong nhưng chưa phân thắng bại → khi nghỉ giữa game vẫn "chưa nhả sân". */
export const holdsCourt = (match, live) => Boolean(live && !live.decided && (match.scoring?.bestOf || 1) > 1 && (live.gamesWon[0] > 0 || live.gamesWon[1] > 0));

/** Nút "Xác nhận kết quả" của người chơi: trận tính điểm → chỉ nhân viên xác nhận (06 mục 1.5). */
export const confirmMode = ({ isStaff, rated }) => (isStaff ? 'confirm' : rated ? 'wait-staff' : 'confirm');

const FLIP_KEY = (matchId) => `cs-flip-${matchId}`;
export const loadFlip = (matchId) => {
  try { return localStorage.getItem(FLIP_KEY(matchId)) === '1'; } catch { return false; }
};
export const saveFlip = (matchId, value) => {
  try { if (value) localStorage.setItem(FLIP_KEY(matchId), '1'); else localStorage.removeItem(FLIP_KEY(matchId)); } catch { /* chế độ riêng tư: không nhớ */ }
};

/** Trận không còn bấm điểm được → lý do hiển thị. */
export const notScorable = (match) => {
  if (match.status === 'in_play') return null;
  if (match.status === 'completed') return 'Trận đã có kết quả.';
  if (match.status === 'cancelled') return 'Trận đã huỷ.';
  if (match.status === 'ended') return 'Trận đã kết thúc (không tỉ số).';
  return 'Trận chưa được gọi ra sân — chưa bấm điểm được.';
};

/** Nơi quay về: giải hay buổi giao lưu của trận. */
export const backTarget = (match) => (match.contextType === 'session'
  ? { to: `/competition/sessions/${match.contextId}`, label: '← Về buổi giao lưu' }
  : { to: `/competition/tournaments/${match.contextId}`, label: '← Về giải đấu' });
