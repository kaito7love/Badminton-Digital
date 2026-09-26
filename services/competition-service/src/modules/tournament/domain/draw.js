const { DomainError } = require('../../../shared/domainError');
const { round2, round3, mean, stdDev } = require('../../../shared/numbers');
const { formBalancedTeams, drawGroups, roundRobin, scheduleSlots, buildBracket } = require('../../matchmaking').domain;
const { suggestGroups } = require('./formatAdvisor');
const { planBracket } = require('./bracketPlan');

// Bốc thăm (docs/06 mục 4.3–4.6) — hàm thuần: danh sách đăng ký + seed → đề xuất
// đội / bảng / lịch. Xác nhận thì kiểm lại bản BTC đã đổi tay.

const teamSize = (tournament) => (tournament.discipline === 'singles' ? 1 : 2);

// entries: [{ playerId, partnerPlayerId, gender, position, pairingRating, registeredAt }]
const buildTeams = ({ tournament, entries, seed }) => {
  if (tournament.discipline === 'singles') {
    return { teams: entries.map((e) => ({ players: [e.playerId], teamRating: round2(e.pairingRating) })), waitlist: [], stats: null };
  }
  if (tournament.pairingMode === 'fixed') {
    const byId = new Map(entries.map((e) => [e.playerId, e]));
    const seen = new Set();
    const teams = [];
    for (const e of entries) {
      if (seen.has(e.playerId)) continue;
      const partner = byId.get(e.partnerPlayerId);
      if (!partner) continue;
      seen.add(e.playerId);
      seen.add(partner.playerId);
      teams.push({ players: [e.playerId, partner.playerId], teamRating: round2(mean([e.pairingRating, partner.pairingRating])) });
    }
    return { teams, waitlist: [], stats: null };
  }
  const result = formBalancedTeams({
    players: entries.map((e) => ({ id: e.playerId, rating: e.pairingRating, gender: e.gender, registeredAt: e.registeredAt, position: e.position })),
    mode: tournament.genderRule === 'mixed' ? 'mixed' : 'doubles',
    seed,
    maxPartnerGap: tournament.maxPartnerGap
  });
  return { teams: result.teams, waitlist: result.waitlist, stats: result.stats };
};

const expectedWaitlist = (tournament, entries) => {
  if (tournament.discipline === 'singles' || tournament.pairingMode === 'fixed') return 0;
  if (tournament.genderRule === 'mixed') {
    const males = entries.filter((e) => e.gender === 'male').length;
    return Math.abs(males - (entries.length - males));
  }
  return entries.length % 2;
};

// teams: [{ players, teamRating }] → bảng + lịch (+ sơ đồ nếu thể thức loại trực tiếp).
const buildStructure = ({ tournament, teams, seed }) => {
  const refs = teams.map((t, i) => ({ index: i, id: `T${i + 1}`, rating: t.teamRating }));
  let groups = [];
  let bracket = null;
  const matches = [];

  if (tournament.format === 'knockout') {
    const ordered = [...refs].sort((a, b) => b.rating - a.rating || a.index - b.index);
    const built = buildBracket({ entrants: ordered.map((r) => ({ id: r.id })), mode: 'seeded', seed });
    bracket = built.positions.map((id) => (id ? refs.find((r) => r.id === id).index : null));
    const plan = planBracket({ positions: built.positions, thirdPlace: tournament.thirdPlaceMatch });
    plan.matches.filter((m) => m.roundNo === 1).forEach((m) => matches.push({ key: m.key, stage: 'knockout', round: 1, teams: [m.teamA, m.teamB] }));
  } else {
    const groupCount = tournament.format === 'round_robin' ? 1 : tournament.groupCount || suggestGroups(teams.length);
    const drawn =
      groupCount === 1
        ? { groups: [{ groupNo: 1, teams: refs.map((r) => ({ id: r.id, pot: null })) }] }
        : drawGroups({ teams: refs.map((r) => ({ id: r.id, rating: r.rating })), groupCount, mode: tournament.groupMode, seed });
    groups = drawn.groups.map((g) => ({ groupNo: g.groupNo, teams: g.teams.map((t) => refs.find((r) => r.id === t.id).index), pots: g.teams.map((t) => t.pot) }));
    for (const g of drawn.groups) {
      roundRobin(g.teams.map((t) => t.id)).rounds.forEach((r) =>
        r.matches.forEach(([a, b], k) => matches.push({ key: `G${g.groupNo}R${r.round}M${k + 1}`, stage: 'group', groupNo: g.groupNo, round: r.round, teams: [a, b] }))
      );
    }
  }
  const schedule = matches.length
    ? scheduleSlots({ matches: matches.map((m) => ({ id: m.key, teams: m.teams, groupNo: m.groupNo, round: m.round })), courts: tournament.courtCount, matchMinutes: tournament.matchMinutes })
    : { slots: [], estimate: { matches: 0, slots: 0, minutes: 0 } };
  const slotOf = new Map();
  schedule.slots.forEach((s) => s.matches.forEach((key) => slotOf.set(key, s.slotNo)));
  const indexOf = new Map(refs.map((r) => [r.id, r.index]));
  return {
    groups,
    bracket,
    matches: matches.map((m) => ({ ...m, teams: m.teams.map((id) => indexOf.get(id)), slotNo: slotOf.get(m.key) })),
    estimate: schedule.estimate
  };
};

const teamStats = (teams) => {
  const ratings = teams.map((t) => t.teamRating);
  return ratings.length ? { teamRatingStdDev: round3(stdDev(ratings)), teamRatingRange: round3(Math.max(...ratings) - Math.min(...ratings)) } : { teamRatingStdDev: 0, teamRatingRange: 0 };
};

// Kiểm bản bốc thăm BTC gửi lên (đã chỉnh tay).
const validateDraw = ({ tournament, entries, teams, groups, bracket }) => {
  const errors = [];
  const size = teamSize(tournament);
  const byId = new Map(entries.map((e) => [e.playerId, e]));
  const used = new Set();
  teams.forEach((team, i) => {
    const players = team.players || [];
    if (players.length !== size) errors.push({ field: `teams[${i}]`, message: `Mỗi đội ${size} người` });
    for (const id of players) {
      if (!byId.has(id)) errors.push({ field: `teams[${i}]`, message: `Người chơi ${id} không có trong danh sách đăng ký` });
      else if (used.has(id)) errors.push({ field: `teams[${i}]`, message: `Người chơi ${id} nằm ở hai đội` });
      used.add(id);
    }
    const genders = players.map((id) => byId.get(id) && byId.get(id).gender);
    if (tournament.genderRule === 'mixed' && size === 2 && genders.sort().join(',') !== 'female,male') {
      errors.push({ field: `teams[${i}]`, message: 'Đội đôi nam nữ phải gồm 1 nam + 1 nữ' });
    }
    if (tournament.genderRule === 'men' && genders.some((g) => g !== 'male')) errors.push({ field: `teams[${i}]`, message: 'Nội dung nam' });
    if (tournament.genderRule === 'women' && genders.some((g) => g !== 'female')) errors.push({ field: `teams[${i}]`, message: 'Nội dung nữ' });
    if (tournament.pairingMode === 'fixed' && size === 2 && byId.get(players[0]) && byId.get(players[0]).partnerPlayerId !== players[1]) {
      errors.push({ field: `teams[${i}]`, message: 'Giải cặp cố định — không được đổi cặp đã đăng ký' });
    }
  });
  const left = entries.filter((e) => !used.has(e.playerId)).length;
  if (left > expectedWaitlist(tournament, entries)) {
    errors.push({ field: 'teams', message: `${left} người chưa vào đội nào (tối đa ${expectedWaitlist(tournament, entries)} người vào danh sách chờ)` });
  }
  if (teams.length < 2) errors.push({ field: 'teams', message: 'Cần ít nhất 2 đội' });

  if (tournament.format === 'knockout') {
    if (!Array.isArray(bracket)) errors.push({ field: 'bracket', message: 'Thiếu sơ đồ' });
    else {
      const placed = bracket.filter((x) => x !== null);
      if (bracket.length < teams.length || (bracket.length & (bracket.length - 1)) !== 0) errors.push({ field: 'bracket', message: 'Số vị trí phải là luỹ thừa của 2, đủ cho mọi đội' });
      if (placed.length !== teams.length || new Set(placed).size !== teams.length || placed.some((x) => x < 0 || x >= teams.length)) {
        errors.push({ field: 'bracket', message: 'Mỗi đội đúng một vị trí' });
      }
      for (let m = 0; m < bracket.length / 2; m += 1) {
        if (bracket[2 * m] === null && bracket[2 * m + 1] === null) errors.push({ field: 'bracket', message: `Trận ${m + 1} vòng 1 không có đội nào` });
      }
    }
  } else {
    const expectedGroups = tournament.format === 'round_robin' ? 1 : null;
    if (!Array.isArray(groups) || !groups.length) errors.push({ field: 'groups', message: 'Thiếu bảng' });
    else {
      if (expectedGroups && groups.length !== expectedGroups) errors.push({ field: 'groups', message: 'Vòng tròn chỉ có một bảng' });
      const seen = new Set();
      for (const g of groups) {
        for (const idx of g.teams || []) {
          if (idx < 0 || idx >= teams.length || seen.has(idx)) errors.push({ field: 'groups', message: `Đội số ${idx} không hợp lệ hoặc nằm ở hai bảng` });
          seen.add(idx);
        }
        if ((g.teams || []).length < 2) errors.push({ field: 'groups', message: `Bảng ${g.groupNo} cần ít nhất 2 đội` });
      }
      if (seen.size !== teams.length) errors.push({ field: 'groups', message: 'Mọi đội phải thuộc đúng một bảng' });
      const sizes = groups.map((g) => (g.teams || []).length);
      if (Math.max(...sizes) - Math.min(...sizes) > 1) errors.push({ field: 'groups', message: 'Các bảng lệch nhau tối đa 1 đội' });
    }
  }
  if (errors.length) throw new DomainError('DRAW_INVALID', `Bốc thăm không hợp lệ: ${errors[0].message}`, errors);
};

module.exports = { buildTeams, buildStructure, validateDraw, expectedWaitlist, teamStats, teamSize };
