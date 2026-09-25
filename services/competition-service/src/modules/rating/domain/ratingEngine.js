const { round3, clamp, mean } = require('../../../shared/numbers');
const config = require('./ratingConfig');

// Engine điểm trình (docs/03 mục 3): Elo biến thể, K theo độ tin cậy. Một kỳ tính
// điểm (một giải / một buổi giao lưu) dùng điểm và K LÚC CHỐT cho mọi trận, cộng
// dồn Δ rồi áp một lần → không phụ thuộc thứ tự nhập tỉ số.

const DAY_MS = 24 * 60 * 60 * 1000;

const expectedScore = (ratingA, ratingB) => 1 / (1 + 10 ** ((ratingB - ratingA) / config.ELO_D));

const effectiveMatches = (ratedMatches, lastMatchAt, now = new Date()) => {
  if (!lastMatchAt) return ratedMatches;
  const idle = now.getTime() - new Date(lastMatchAt).getTime();
  return idle > config.INACTIVE_AFTER_DAYS * DAY_MS ? Math.floor(ratedMatches / 2) : ratedMatches;
};

const kFactor = (nEff) =>
  config.K_MIN + (config.K_MAX - config.K_MIN) * Math.max(0, 1 - nEff / config.K_FULL_AFTER);

const reliability = (nEff) => Math.min(100, nEff * config.RELIABILITY_PER_MATCH);
const isProvisional = (nEff) => nEff < config.PROVISIONAL_BELOW;

// p = tỉ lệ điểm đội thắng giành được trên tổng điểm các game đã xong.
const marginMultiplier = (games, winnerSide) => {
  let won = 0;
  let total = 0;
  for (const [a, b] of games || []) {
    won += winnerSide === 'A' ? a : b;
    total += a + b;
  }
  if (total === 0) return 1;
  const p = won / total;
  return clamp(config.MARGIN_MIN + config.MARGIN_SLOPE * (p - 0.5), config.MARGIN_MIN, config.MARGIN_MAX);
};

// Trận có được tính điểm không (docs/03 mục 3.4). Trả về lý do nếu không.
const ratedMatchSkipReason = (match) => {
  if (match.outcome === 'walkover') return 'WALKOVER';
  if (match.outcome === 'retired' && (!match.games || match.games.length === 0)) return 'RETIRED_NO_COMPLETED_GAME';
  if (!match.winnerSide) return 'NO_RESULT';
  return null;
};

/**
 * @param {object} input
 * @param {Array<{playerId, rating, ratedMatches, lastMatchAt}>} input.players  điểm hiện tại lúc chốt
 * @param {Array<{matchId, sideA: string[], sideB: string[], games: number[][], outcome, winnerSide, weight?, completedAt?}>} input.matches
 * @param {Date} [input.now]
 */
const computePeriodRatings = ({ players, matches, now = new Date() }) => {
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const k = new Map(
    players.map((p) => [p.playerId, kFactor(effectiveMatches(p.ratedMatches, p.lastMatchAt, now))])
  );
  const acc = new Map();
  const skipped = [];

  // Sắp theo matchId để tổng số thực luôn cộng theo cùng một thứ tự.
  const ordered = [...matches].sort((a, b) => String(a.matchId).localeCompare(String(b.matchId)));
  for (const match of ordered) {
    const reason = ratedMatchSkipReason(match);
    if (reason) {
      skipped.push({ matchId: match.matchId, reason });
      continue;
    }
    for (const id of [...match.sideA, ...match.sideB]) {
      if (!byId.has(id)) throw new Error(`computePeriodRatings: thiếu điểm của người chơi ${id}`);
    }
    const ratingA = mean(match.sideA.map((id) => byId.get(id).rating));
    const ratingB = mean(match.sideB.map((id) => byId.get(id).rating));
    const eA = expectedScore(ratingA, ratingB);
    const m = marginMultiplier(match.games, match.winnerSide);
    const w = match.weight === undefined ? 1 : match.weight;

    for (const [side, ids, expected] of [['A', match.sideA, eA], ['B', match.sideB, 1 - eA]]) {
      const s = match.winnerSide === side ? 1 : 0;
      for (const id of ids) {
        const kp = k.get(id);
        const delta = w * kp * (s - expected) * m;
        const entry = acc.get(id) || { total: 0, count: 0, lastAt: null, matches: [] };
        entry.total += delta;
        entry.count += 1;
        if (match.completedAt && (!entry.lastAt || new Date(match.completedAt) > new Date(entry.lastAt))) {
          entry.lastAt = match.completedAt;
        }
        entry.matches.push({
          matchId: match.matchId,
          E: round3(expected),
          S: s,
          m: round3(m),
          K: round3(kp),
          w,
          delta: round3(delta)
        });
        acc.set(id, entry);
      }
    }
  }

  const changes = [];
  for (const [playerId, entry] of acc) {
    const before = byId.get(playerId);
    const after = round3(clamp(before.rating + entry.total, config.SCALE_MIN, config.SCALE_MAX));
    changes.push({
      playerId,
      before: before.rating,
      after,
      delta: round3(after - before.rating),
      ratedMatchesAdded: entry.count,
      lastMatchAt: entry.lastAt,
      calc: {
        matches: entry.matches,
        prevRatedMatches: before.ratedMatches,
        prevLastMatchAt: before.lastMatchAt || null
      }
    });
  }
  changes.sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));
  return { changes, skipped };
};

module.exports = {
  expectedScore,
  effectiveMatches,
  kFactor,
  reliability,
  isProvisional,
  marginMultiplier,
  ratedMatchSkipReason,
  computePeriodRatings
};
