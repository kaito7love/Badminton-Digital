const { DomainError } = require('../../../shared/domainError');

// Luật tỉ số cầu lông (docs/06 mục 1.4). points = P, cap = C (null = không trần).
//   w = P          → hợp lệ khi l ≤ P − 2
//   P < w < C      → hợp lệ khi w − l = 2
//   w = C          → hợp lệ khi l ≥ C − 2
// 21/30: 21-19, 22-20, 29-27, 30-28, 30-29 hợp lệ; 21-20, 23-20, 31-29 không.

const PRESETS = Object.freeze({
  '3x21': { bestOf: 3, points: 21, cap: 30 },
  '1x21': { bestOf: 1, points: 21, cap: 30 },
  '3x15': { bestOf: 3, points: 15, cap: 21 },
  '1x31': { bestOf: 1, points: 31, cap: 40 }
});

const validateScoring = (scoring) => {
  const s = scoring || {};
  const errors = [];
  if (![1, 3, 5].includes(s.bestOf)) errors.push({ field: 'scoring.bestOf', message: 'Số game phải là 1, 3 hoặc 5' });
  if (!Number.isInteger(s.points) || s.points < 5 || s.points > 50) errors.push({ field: 'scoring.points', message: 'Điểm mỗi game từ 5 đến 50' });
  if (s.cap !== null && s.cap !== undefined && (!Number.isInteger(s.cap) || s.cap < s.points + 2)) {
    errors.push({ field: 'scoring.cap', message: 'Trần phải ≥ điểm mỗi game + 2' });
  }
  if (errors.length) throw new DomainError('INVALID_SCORING', 'Luật tỉ số không hợp lệ', errors);
  return { bestOf: s.bestOf, points: s.points, cap: s.cap === undefined ? null : s.cap };
};

const gameError = (pair, { points: P, cap: C }) => {
  if (!Array.isArray(pair) || pair.length !== 2) return 'phải là [điểm A, điểm B]';
  const [a, b] = pair;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'điểm phải là số nguyên ≥ 0';
  if (a === b) return `${a}-${b} không thể hoà`;
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  const rule = C ? `phải thắng cách 2 điểm (tối đa ${C})` : 'phải thắng cách 2 điểm';
  if (w < P) return `${a}-${b} chưa đủ ${P} điểm`;
  if (w === P) return l <= P - 2 ? null : `${a}-${b} không hợp lệ — ${rule}`;
  if (C && w > C) return `${a}-${b} vượt trần ${C} điểm`;
  if (C && w === C) return l >= C - 2 ? null : `${a}-${b} không hợp lệ — ${rule}`;
  return w - l === 2 ? null : `${a}-${b} không hợp lệ — ${rule}`;
};

// Kiểm cả trận. body: { games, outcome = 'normal' | 'walkover' | 'retired', winnerSide }.
// Trả về kết quả đã chuẩn hoá + tổng game / điểm từng bên.
const validateResult = (body, scoring) => {
  const outcome = body.outcome || 'normal';
  const games = body.games || [];
  const needed = Math.ceil(scoring.bestOf / 2);
  const errors = [];

  if (outcome === 'walkover') {
    if (games.length) errors.push({ field: 'games', message: 'Trận W.O. không có tỉ số' });
    if (!['A', 'B'].includes(body.winnerSide)) errors.push({ field: 'winnerSide', message: 'Cần bên thắng (A hoặc B)' });
    if (errors.length) throw new DomainError('SCORE_INVALID', 'Kết quả W.O. không hợp lệ', errors);
    return { games: [], outcome, winnerSide: body.winnerSide, summary: { gamesA: 0, gamesB: 0, pointsA: 0, pointsB: 0 } };
  }

  if (games.length > scoring.bestOf) errors.push({ field: 'games', message: `Tối đa ${scoring.bestOf} game` });
  let gamesA = 0;
  let gamesB = 0;
  let pointsA = 0;
  let pointsB = 0;
  let decidedAt = null;
  games.forEach((pair, i) => {
    const err = gameError(pair, scoring);
    if (err) {
      errors.push({ field: `games[${i}]`, message: `Game ${i + 1}: ${err}` });
      return;
    }
    if (decidedAt !== null) {
      errors.push({ field: `games[${i}]`, message: `Game ${i + 1}: trận đã phân thắng bại sau game ${decidedAt + 1}` });
      return;
    }
    if (pair[0] > pair[1]) gamesA += 1;
    else gamesB += 1;
    pointsA += pair[0];
    pointsB += pair[1];
    if (gamesA === needed || gamesB === needed) decidedAt = i;
  });
  if (errors.length) throw new DomainError('SCORE_INVALID', errors[0].message, errors);

  if (outcome === 'normal') {
    if (decidedAt === null) {
      throw new DomainError('SCORE_INVALID', `Trận chưa kết thúc — cần thắng ${needed} game`, [{ field: 'games', message: 'Chưa đủ game' }]);
    }
    const winnerSide = gamesA === needed ? 'A' : 'B';
    if (body.winnerSide && body.winnerSide !== winnerSide) {
      throw new DomainError('SCORE_INVALID', 'Bên thắng không khớp tỉ số', [{ field: 'winnerSide', message: `Theo tỉ số là ${winnerSide}` }]);
    }
    return { games, outcome, winnerSide, summary: { gamesA, gamesB, pointsA, pointsB } };
  }

  if (outcome === 'retired') {
    if (decidedAt !== null) {
      throw new DomainError('SCORE_INVALID', 'Trận đã phân thắng bại — không phải bỏ cuộc giữa trận', [{ field: 'outcome', message: 'Dùng outcome normal' }]);
    }
    if (!['A', 'B'].includes(body.winnerSide)) {
      throw new DomainError('SCORE_INVALID', 'Cần bên thắng (bên không bỏ cuộc)', [{ field: 'winnerSide', message: 'A hoặc B' }]);
    }
    return { games, outcome, winnerSide: body.winnerSide, summary: { gamesA, gamesB, pointsA, pointsB } };
  }
  throw new DomainError('SCORE_INVALID', 'outcome phải là normal, walkover hoặc retired', [{ field: 'outcome', message: 'Không hợp lệ' }]);
};

module.exports = { PRESETS, validateScoring, validateResult, gameError };
