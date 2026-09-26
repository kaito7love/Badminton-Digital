// Thống kê từ trận đã chốt (docs/05 mục 2). Trận W.O. không vào thống kê (không
// đánh); bỏ cuộc giữa trận thì tính game / điểm đã đánh.

const sideTotals = (games, side) => {
  let gamesWon = 0;
  let gamesLost = 0;
  let pointsWon = 0;
  let pointsLost = 0;
  for (const [a, b] of games || []) {
    const mine = side === 'A' ? a : b;
    const theirs = side === 'A' ? b : a;
    if (mine > theirs) gamesWon += 1;
    else gamesLost += 1;
    pointsWon += mine;
    pointsLost += theirs;
  }
  return { gamesWon, gamesLost, pointsWon, pointsLost };
};

// Một dòng cho mỗi người chơi trong một trận.
const linesForMatch = (match, participants) => {
  if (match.status !== 'completed' || match.outcome === 'walkover') return [];
  return participants.map((p) => ({
    playerId: p.playerId,
    matchId: match.id,
    discipline: match.discipline,
    context: match.contextType,
    won: match.winnerSide === p.side,
    completedAt: match.completedAt,
    ...sideTotals(match.games, p.side)
  }));
};

const accumulate = (lines) => {
  const sorted = [...lines].sort(
    (x, y) => new Date(x.completedAt) - new Date(y.completedAt) || String(x.matchId).localeCompare(String(y.matchId))
  );
  const out = { matches: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, streak: 0, last5: [] };
  for (const l of sorted) {
    out.matches += 1;
    if (l.won) out.wins += 1;
    else out.losses += 1;
    out.gamesWon += l.gamesWon;
    out.gamesLost += l.gamesLost;
    out.pointsWon += l.pointsWon;
    out.pointsLost += l.pointsLost;
    // Chuỗi: dương = thắng liền, âm = thua liền.
    if (l.won) out.streak = out.streak > 0 ? out.streak + 1 : 1;
    else out.streak = out.streak < 0 ? out.streak - 1 : -1;
  }
  out.last5 = sorted.slice(-5).map((l) => (l.won ? 'W' : 'L'));
  return out;
};

module.exports = { linesForMatch, accumulate, sideTotals };
