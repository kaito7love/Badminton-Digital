const { liveState } = require('../domain/liveScore');

// Dạng trả về của tỉ số đang bấm (schema MatchLive) — dùng chung cho view trận, API bấm
// điểm và luồng TV.

const iso = (d) => (d ? new Date(d).toISOString() : null);

const liveView = (row, scoring) => ({
  matchId: row.matchId,
  revision: row.revision,
  rallies: row.rallies,
  firstServer: row.firstServer,
  ...liveState({ rallies: row.rallies, firstServer: row.firstServer, scoring }),
  updatedAt: iso(row.updatedAt)
});

// Trận chưa ai bấm điểm (chưa có dòng trong match_live_scores).
const emptyLive = (match) => liveView({ matchId: match.id, revision: 0, rallies: '', firstServer: 'A', updatedAt: null }, match.scoring);

module.exports = { liveView, emptyLive };
