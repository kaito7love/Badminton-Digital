const { DomainError } = require('../../../shared/domainError');

// Bấm điểm trực tiếp (docs/06 mục 1.5). Trận lưu CHUỖI PHA CẦU: mỗi ký tự là đội thắng
// pha đó ('A' / 'B'). Tỉ số luôn tính lại từ chuỗi → hoàn tác chỉ là bỏ ký tự cuối, không
// bao giờ lệch. Luật game giống hệt badmintonScore.gameError:
//   game xong khi đủ P điểm và cách ≥ 2, hoặc chạm trần C (21/30: 21-19, 22-20, 30-29);
//   trận xong khi một đội thắng ⌈bestOf / 2⌉ game.
// Đội giao = đội thắng pha trước (điểm đầu trận: đội chọn giao trước). Sang game mới, đội
// thắng game trước giao — trùng luật trên. Ô giao: điểm của đội giao chẵn → ô phải, lẻ → ô
// trái (luật BWF, đúng cho cả đơn và đôi). Không theo dõi NGƯỜI nào trong đôi giao.
// Đổi sân (plan 19 mục 11): hết một game mà trận còn đánh tiếp; game quyết định của trận nhiều
// game (game 3 của bo3) đổi thêm một lần khi đội dẫn chạm nửa số điểm game (11 với 21, 8 với 15).
// Trận 1 game không đổi sân. endsSwapped = hai đội đang ở ngược đầu sân so với lúc bắt đầu trận.

// Một trận 5 game × 50 điểm không trần vẫn dư chỗ; chặn để chuỗi không phình vô hạn.
const MAX_RALLIES = 1000;

const gameOver = (a, b, { points: P, cap: C }) => {
  const w = Math.max(a, b);
  if (C && w >= C) return true;
  return w >= P && w - Math.min(a, b) >= 2;
};

const liveState = ({ rallies = '', firstServer = 'A', scoring }) => {
  const needed = Math.ceil(scoring.bestOf / 2);
  const mid = Math.ceil(scoring.points / 2);
  const games = [];
  let a = 0;
  let b = 0;
  let wonA = 0;
  let wonB = 0;
  let winnerSide = null;
  let endChanges = 0;
  for (const side of rallies) {
    if (winnerSide) throw new Error('Chuỗi pha cầu có điểm sau khi trận đã xong');
    if (side === 'A') a += 1;
    else if (side === 'B') b += 1;
    else throw new Error(`Ký tự pha cầu lạ: ${side}`);
    // Pha làm một đội chạm `mid` khi đội kia chưa tới (lần đầu trong game — 11–9 → 11–10 không tính lại);
    // mid < P nên không trùng pha hết game.
    if (scoring.bestOf > 1 && games.length === scoring.bestOf - 1 && (side === 'A' ? a : b) === mid && Math.min(a, b) < mid) endChanges += 1;
    if (gameOver(a, b, scoring)) {
      games.push([a, b]);
      if (a > b) wonA += 1;
      else wonB += 1;
      a = 0;
      b = 0;
      if (wonA === needed) winnerSide = 'A';
      else if (wonB === needed) winnerSide = 'B';
      else endChanges += 1;
    }
  }
  const decided = winnerSide !== null;
  const server = decided ? null : rallies.length ? rallies[rallies.length - 1] : firstServer;
  const serverPoints = server === 'A' ? a : b;
  return {
    games,
    current: decided ? null : [a, b],
    gameNo: decided ? games.length : games.length + 1,
    gamesWon: [wonA, wonB],
    server,
    serveFrom: decided ? null : serverPoints % 2 === 0 ? 'right' : 'left',
    endsSwapped: endChanges % 2 === 1,
    decided,
    winnerSide
  };
};

// +1 điểm cho `side` → chuỗi mới. Đã đủ điểm thắng trận thì chỉ còn xác nhận hoặc hoàn tác.
const addRally = ({ rallies = '', firstServer = 'A', scoring }, side) => {
  if (side !== 'A' && side !== 'B') throw new DomainError('INVALID_SIDE', 'side phải là A hoặc B');
  if (liveState({ rallies, firstServer, scoring }).decided) {
    throw new DomainError('MATCH_DECIDED', 'Trận đã đủ điểm thắng — hãy xác nhận kết quả hoặc hoàn tác điểm cuối', null, 409);
  }
  if (rallies.length >= MAX_RALLIES) throw new DomainError('LIVE_TOO_LONG', `Quá ${MAX_RALLIES} pha cầu`);
  return rallies + side;
};

const undoRally = (rallies = '') => {
  if (!rallies.length) throw new DomainError('NOTHING_TO_UNDO', 'Chưa có điểm nào để hoàn tác', null, 409);
  return rallies.slice(0, -1);
};

module.exports = { MAX_RALLIES, liveState, addRally, undoRally };
