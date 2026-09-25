// Đo thời gian ghép cặp 128 người bằng node thường (như server chạy thật).
// Trong vm của Jest cùng đoạn code chậm hơn ~10 lần nên không đo ở đó được.
const { formBalancedTeams } = require('../src/modules/matchmaking/domain/formBalancedTeams');
const { createRng } = require('../src/modules/matchmaking/domain/seededRandom');

const count = Number(process.argv[2] || 128);
const rng = createRng('big');
const players = Array.from({ length: count }, (_, i) => ({
  id: `p${String(i).padStart(3, '0')}`,
  rating: 1.5 + rng.next() * 4,
  registeredAt: new Date(Date.UTC(2026, 8, 1, 0, i))
}));

formBalancedTeams({ players, seed: 'warmup' });
const started = process.hrtime.bigint();
const result = formBalancedTeams({ players, seed: 'perf' });
const ms = Number(process.hrtime.bigint() - started) / 1e6;
process.stdout.write(JSON.stringify({ players: count, teams: result.teams.length, ms: Math.round(ms), stats: result.stats }));
