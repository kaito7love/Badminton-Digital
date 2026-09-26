// Thứ hạng chung cuộc (docs/06 mục 6) — đầu vào cho điểm BXH thành tích.
//  - có loại trực tiếp: vô địch 1 · thua chung kết 2 · tranh hạng 3: thắng 3, thua 4
//    (không tranh: cả hai 3–4) · thua ở vòng r: [2^(R−r)+1, 2^(R−r+1)]
//  - bị loại ở vòng bảng: xếp sau mọi đội vào vòng trong theo hạng trong bảng →
//    tỉ lệ thắng → hiệu số game / trận → hiệu số điểm / trận
//  - vòng tròn một bảng: đúng bằng bảng xếp hạng

const labelFor = (from, to) => {
  if (from === 1) return 'Vô địch';
  if (from === 2) return 'Á quân';
  if (from === 3 && to === 3) return 'Hạng 3';
  if (from === 4 && to === 4) return 'Hạng 4';
  if (from === 3) return 'Bán kết';
  if (from === 5) return 'Tứ kết';
  return `Vòng 1/${to / 2}`;
};

const playedWins = (teamId, matches) =>
  matches.filter((m) => m.status === 'completed' && m.outcome !== 'walkover' && ((m.winnerSide === 'A' && m.teamAId === teamId) || (m.winnerSide === 'B' && m.teamBId === teamId))).length;

const computePlacements = ({ format, teamIds, groupStandings = [], knockoutMatches = [], allMatches = [], knockoutRounds = 0 }) => {
  const out = new Map();
  const put = (teamId, from, to, label, reachedKnockout) =>
    out.set(teamId, { teamId, from, to, label, reachedKnockout, wins: playedWins(teamId, allMatches) });

  if (format === 'round_robin') {
    const [standing] = groupStandings;
    standing.forEach((row, i) => put(row.teamId, i + 1, i + 1, `Hạng ${i + 1}`, false));
    return [...out.values()];
  }

  const R = knockoutRounds;
  const inKnockout = new Set();
  for (const m of knockoutMatches) {
    if (m.teamAId) inKnockout.add(m.teamAId);
    if (m.teamBId) inKnockout.add(m.teamBId);
  }
  for (const m of knockoutMatches) {
    if (m.status !== 'completed' || !m.teamAId || !m.teamBId) continue;
    const winner = m.winnerSide === 'A' ? m.teamAId : m.teamBId;
    const loser = m.winnerSide === 'A' ? m.teamBId : m.teamAId;
    if (m.thirdPlace) {
      put(winner, 3, 3, 'Hạng 3', true);
      put(loser, 4, 4, 'Hạng 4', true);
    } else if (m.roundNo === R) {
      put(winner, 1, 1, 'Vô địch', true);
      put(loser, 2, 2, 'Á quân', true);
    } else if (!(m.roundNo === R - 1 && knockoutMatches.some((x) => x.thirdPlace))) {
      const from = 2 ** (R - m.roundNo) + 1;
      const to = 2 ** (R - m.roundNo + 1);
      if (!out.has(loser)) put(loser, from, to, labelFor(from, to), true);
    }
  }

  // Đội bị loại ở vòng bảng.
  const qualified = inKnockout.size;
  const eliminated = [];
  for (const standing of groupStandings) {
    for (const row of standing) {
      if (inKnockout.has(row.teamId)) continue;
      eliminated.push({
        ...row,
        winRate: row.played ? row.wins / row.played : 0,
        gdpm: row.played ? row.gameDiff / row.played : 0,
        pdpm: row.played ? row.pointDiff / row.played : 0
      });
    }
  }
  eliminated.sort((x, y) => x.rank - y.rank || y.winRate - x.winRate || y.gdpm - x.gdpm || y.pdpm - x.pdpm);
  eliminated.forEach((row, i) => put(row.teamId, qualified + i + 1, qualified + i + 1, 'Vòng bảng', false));

  // Đội chưa có thứ hạng (vd rút lui trước khi vào sơ đồ) → cuối bảng.
  let next = out.size + 1;
  for (const id of teamIds) if (!out.has(id)) put(id, next, next++, 'Rút lui', false);
  return [...out.values()].sort((a, b) => a.from - b.from);
};

module.exports = { computePlacements, labelFor };
