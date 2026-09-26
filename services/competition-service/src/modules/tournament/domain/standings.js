const { createRng } = require('../../matchmaking').domain;

// Bảng xếp hạng trong bảng (docs/06 mục 6):
//  1. số trận thắng
//  2. hai đội bằng nhau → đối đầu trực tiếp
//  3. từ ba đội bằng nhau → hiệu số game, rồi hiệu số điểm (mọi trận của bảng);
//     còn đúng hai đội bằng nhau → đối đầu; vẫn bằng → bốc thăm bằng seed của giải
// Cách tính trận không trọn vẹn:
//  - W.O.: đội thắng được tính thắng đủ số game cần (2–0 / 1–0), không có điểm số
//  - bỏ cuộc giữa trận: game theo thực tế, đội thắng được cộng số game còn thiếu;
//    điểm số chỉ tính các game đã xong

const creditFor = (match, needed) => {
  let gamesA = 0;
  let gamesB = 0;
  let pointsA = 0;
  let pointsB = 0;
  for (const [a, b] of match.games || []) {
    if (a > b) gamesA += 1;
    else gamesB += 1;
    pointsA += a;
    pointsB += b;
  }
  if (match.outcome === 'walkover' || match.outcome === 'retired') {
    if (match.winnerSide === 'A') gamesA = needed > gamesA ? needed : gamesA;
    else gamesB = needed > gamesB ? needed : gamesB;
  }
  return { gamesA, gamesB, pointsA, pointsB };
};

const computeStandings = ({ teamIds, matches, bestOf, seed }) => {
  const needed = Math.ceil(bestOf / 2);
  const rows = new Map(
    teamIds.map((id) => [id, { teamId: id, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0 }])
  );
  const h2h = new Map(); // "a|b" → đội thắng
  for (const m of matches) {
    if (m.status !== 'completed' || !m.teamAId || !m.teamBId) continue;
    const a = rows.get(m.teamAId);
    const b = rows.get(m.teamBId);
    if (!a || !b) continue;
    const c = creditFor(m, needed);
    a.played += 1;
    b.played += 1;
    const winner = m.winnerSide === 'A' ? a : b;
    const loser = m.winnerSide === 'A' ? b : a;
    winner.wins += 1;
    loser.losses += 1;
    a.gamesWon += c.gamesA;
    a.gamesLost += c.gamesB;
    b.gamesWon += c.gamesB;
    b.gamesLost += c.gamesA;
    a.pointsWon += c.pointsA;
    a.pointsLost += c.pointsB;
    b.pointsWon += c.pointsB;
    b.pointsLost += c.pointsA;
    h2h.set([m.teamAId, m.teamBId].sort().join('|'), winner.teamId);
  }
  for (const r of rows.values()) {
    r.gameDiff = r.gamesWon - r.gamesLost;
    r.pointDiff = r.pointsWon - r.pointsLost;
  }

  const lot = new Map(createRng(`${seed || 'standings'}:lot`).shuffle(teamIds).map((id, i) => [id, i]));
  const headToHead = (x, y) => {
    const w = h2h.get([x.teamId, y.teamId].sort().join('|'));
    if (w === x.teamId) return -1;
    if (w === y.teamId) return 1;
    return 0;
  };
  const byLot = (x, y) => lot.get(x.teamId) - lot.get(y.teamId);

  const resolveTie = (tie) => {
    if (tie.length === 1) return tie;
    if (tie.length === 2) {
      const [x, y] = tie;
      const h = headToHead(x, y);
      if (h !== 0) return h < 0 ? [x, y] : [y, x];
      return [...tie].sort((p, q) => q.gameDiff - p.gameDiff || q.pointDiff - p.pointDiff || byLot(p, q));
    }
    const sorted = [...tie].sort((p, q) => q.gameDiff - p.gameDiff || q.pointDiff - p.pointDiff);
    const out = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i + 1;
      while (j < sorted.length && sorted[j].gameDiff === sorted[i].gameDiff && sorted[j].pointDiff === sorted[i].pointDiff) j += 1;
      const sub = sorted.slice(i, j);
      if (sub.length === 2 && headToHead(sub[0], sub[1]) !== 0) out.push(...(headToHead(sub[0], sub[1]) < 0 ? sub : [sub[1], sub[0]]));
      else out.push(...sub.sort(byLot));
      i = j;
    }
    return out;
  };

  const byWins = [...rows.values()].sort((p, q) => q.wins - p.wins);
  const ordered = [];
  for (let i = 0; i < byWins.length; ) {
    let j = i + 1;
    while (j < byWins.length && byWins[j].wins === byWins[i].wins) j += 1;
    ordered.push(...resolveTie(byWins.slice(i, j)));
    i = j;
  }
  return ordered.map((r, i) => ({ ...r, rank: i + 1 }));
};

module.exports = { computeStandings, creditFor };
