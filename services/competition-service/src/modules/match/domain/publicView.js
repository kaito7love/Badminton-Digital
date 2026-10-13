// Dạng một trận trên MÀN CÔNG KHAI (plan 27): liệt kê từng trường được lộ và đổi tên người chơi theo quyền riêng tư
// (`label` = hàm id → { id, name, masked } từ player.domain.profile.publicRef). Dùng chung cho giải và buổi giao lưu.
// Cố tình không có: version, contextType / contextId, mã đội nội bộ ngoài `teamId`.

const shapeTeam = (team, label) => (team ? { teamId: team.teamId ?? null, players: team.players.map((p) => label(p.id)) } : null);

const publicMatchView = (m, label) => ({
  id: m.id,
  discipline: m.discipline,
  stage: m.stage,
  label: m.label ?? null,
  groupNo: m.groupNo ?? null,
  roundNo: m.roundNo ?? null,
  slotNo: m.slotNo ?? null,
  bracketPos: m.bracketPos ?? null,
  nextMatchId: m.nextMatchId ?? null,
  teamA: shapeTeam(m.teamA, label),
  teamB: shapeTeam(m.teamB, label),
  scoring: m.scoring,
  games: m.games,
  outcome: m.outcome ?? null,
  winnerSide: m.winnerSide ?? null,
  status: m.status,
  courtRef: m.courtRef ?? null,
  calledAt: m.calledAt ?? null,
  completedAt: m.completedAt ?? null,
  live: m.live ?? null,
  expectedTime: m.expectedTime ?? null
});

// Mọi id người chơi xuất hiện trong một trận — để tra tên một lần cho cả danh sách.
const playerIdsOf = (m) => [...(m.teamA ? m.teamA.players : []), ...(m.teamB ? m.teamB.players : [])].map((p) => p.id);

module.exports = { publicMatchView, playerIdsOf };
