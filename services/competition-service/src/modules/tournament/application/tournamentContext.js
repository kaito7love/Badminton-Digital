const { notFound, forbiddenScope } = require('../../../platform/http/errors');
const { canAccessOrganizer } = require('../../../platform/http/auth');
const { round2 } = require('../../../shared/numbers');

// Phần dùng chung của module tournament: tải giải, phân quyền, dựng view.

const SCOPES = {
  read: ['tournament:read', 'tournament:operate', 'tournament:manage'],
  operate: ['tournament:operate', 'tournament:manage'],
  manage: ['tournament:manage']
};

const iso = (d) => (d ? new Date(d).toISOString() : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));

const createTournamentContext = ({ models }) => {
  const { Tournament, TournamentTeam } = models;

  const load = async (transaction, tenant, id, { lock = false } = {}) => {
    const t = await Tournament.findOne({
      where: { id, tenantId: tenant },
      transaction,
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
    });
    if (!t) throw notFound('Không tìm thấy giải');
    return t;
  };

  // Giải thuộc organizer (chi nhánh) ngoài claim `org` → coi như không tồn tại.
  const authorize = (auth, tournament, action) => {
    if (!canAccessOrganizer(auth, tournament.organizerRef)) throw notFound('Không tìm thấy giải');
    const need = SCOPES[action];
    if (!need.some((s) => auth.scopes.has(s))) throw forbiddenScope(need);
  };

  const withdrawnTeamIds = async (transaction, tournament) =>
    new Set(
      (await TournamentTeam.findAll({ where: { tournamentId: tournament.id }, transaction }))
        .filter((t) => t.withdrawnAt)
        .map((t) => t.id)
    );

  const view = (t, extra = {}) => ({
    id: t.id,
    organizerRef: t.organizerRef,
    name: t.name,
    description: t.description ?? null,
    startsOn: t.startsOn,
    startTime: t.startTime ?? null,
    tier: t.tier,
    discipline: t.discipline,
    genderRule: t.genderRule,
    pairingMode: t.pairingMode,
    maxPartnerGap: num(t.maxPartnerGap),
    maxEntries: t.maxEntries ?? null,
    checkInRequired: Boolean(t.checkInRequired),
    ratingRule: t.ratingRule ?? null,
    format: t.format,
    groupCount: t.groupCount ?? null,
    groupMode: t.groupMode,
    advancePerGroup: t.advancePerGroup ?? null,
    thirdPlaceMatch: t.thirdPlaceMatch,
    scoring: t.scoring,
    courtCount: t.courtCount,
    courtRefs: t.courtRefs ?? null,
    matchMinutes: t.matchMinutes,
    rated: t.rated,
    ranked: t.ranked,
    drawSeed: t.drawSeed ?? null,
    status: t.status,
    stage: t.stage ?? null,
    finalizedAt: iso(t.finalizedAt),
    createdByRef: t.createdByRef,
    version: t.version,
    createdAt: iso(t.createdAt),
    ...extra
  });

  const teamView = (team, people) => ({
    id: team.id,
    players: [team.player1Id, team.player2Id].filter(Boolean).map((pid) => {
      const p = people.get(pid);
      return { id: pid, name: p ? p.displayName : null, gender: p ? p.gender ?? null : null };
    }),
    teamRating: round2(Number(team.teamRating)),
    groupNo: team.groupNo ?? null,
    seed: team.seed ?? null,
    withdrawn: Boolean(team.withdrawnAt)
  });

  return { load, authorize, withdrawnTeamIds, view, teamView, SCOPES };
};

module.exports = { createTournamentContext };
