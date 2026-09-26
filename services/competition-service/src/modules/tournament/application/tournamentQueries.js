const { Op } = require('sequelize');
const { canAccessOrganizer } = require('../../../platform/http/auth');
const { round2 } = require('../../../shared/numbers');
const { computeStandings } = require('../domain/standings');

// Đọc dữ liệu giải — không ghi gì.

const createTournamentQueries = ({ models, players, matches, ctx }) => {
  const { Tournament, TournamentEntry, TournamentTeam, TournamentPlacement } = models;

  const progress = async (t) => {
    const entries = await TournamentEntry.findAll({ where: { tournamentId: t.id }, attributes: ['status'] });
    const list = await matches.listForContext(t.tenantId, 'tournament', t.id);
    const count = (s) => entries.filter((e) => e.status === s).length;
    return {
      entries: { registered: count('registered'), waitlisted: count('waitlisted'), withdrawn: count('withdrawn') },
      matches: { total: list.filter((m) => m.status !== 'cancelled').length, completed: list.filter((m) => m.status === 'completed').length }
    };
  };

  const list = async ({ auth, status, discipline, organizerRef, from, to, page, limit }) => {
    const where = { tenantId: auth.tenant };
    if (status) where.status = status;
    if (discipline) where.discipline = discipline;
    if (organizerRef) where.organizerRef = organizerRef;
    else if (!auth.allOrgs) where.organizerRef = auth.org.length ? auth.org : '__none__';
    if (from || to) where.startsOn = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
    if (organizerRef && !canAccessOrganizer(auth, organizerRef)) return { rows: [], count: 0 };
    return Tournament.findAndCountAll({ where, order: [['startsOn', 'DESC'], ['createdAt', 'DESC']], offset: (page - 1) * limit, limit });
  };

  const entries = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'read');
    const rows = await TournamentEntry.findAll({ where: { tournamentId: t.id }, order: [['registeredAt', 'ASC'], ['id', 'ASC']] });
    const people = await players.findByIds(auth.tenant, rows.map((e) => e.playerId));
    const views = new Map((await players.enrich(auth.tenant, people, { auth })).map((v) => [v.id, v]));
    return rows.map((e) => {
      const v = views.get(e.playerId);
      const r = v && v.ratings ? v.ratings[t.discipline] : null;
      return {
        id: e.id,
        playerId: e.playerId,
        name: v ? v.displayName : null,
        gender: v ? v.gender : null,
        partnerPlayerId: e.partnerPlayerId ?? null,
        status: e.status,
        waitlistReason: e.waitlistReason ?? null,
        rating: r ? r.rating : e.ratingSnapshot === null ? null : round2(Number(e.ratingSnapshot)),
        pairingRating: r ? r.pairingRating : e.pairingRatingSnapshot === null ? null : round2(Number(e.pairingRatingSnapshot)),
        flags: v ? v.flags || [] : [],
        registeredAt: new Date(e.registeredAt).toISOString()
      };
    });
  };

  const teamsWithPeople = async (tenant, t) => {
    const teams = await TournamentTeam.findAll({ where: { tournamentId: t.id }, order: [['seed', 'ASC']] });
    const people = new Map((await players.findByIds(tenant, teams.flatMap((x) => [x.player1Id, x.player2Id]).filter(Boolean))).map((p) => [p.id, p]));
    return { teams, people };
  };

  const matchList = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'read');
    const rows = await matches.listForContext(auth.tenant, 'tournament', t.id);
    return matches.views(auth.tenant, rows);
  };

  const standings = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'read');
    const { teams, people } = await teamsWithPeople(auth.tenant, t);
    const rows = (await matches.listForContext(auth.tenant, 'tournament', t.id)).filter((m) => m.stage === 'group');
    const groupNos = [...new Set(teams.map((x) => x.groupNo).filter((g) => g !== null))].sort((a, b) => a - b);
    return groupNos.map((g) => ({
      groupNo: g,
      rows: computeStandings({
        teamIds: teams.filter((x) => x.groupNo === g).map((x) => x.id),
        matches: rows.filter((m) => m.groupNo === g),
        bestOf: t.scoring.bestOf,
        seed: t.drawSeed
      }).map((r) => ({ ...r, team: ctx.teamView(teams.find((x) => x.id === r.teamId), people) }))
    }));
  };

  const bracket = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'read');
    const rows = (await matches.listForContext(auth.tenant, 'tournament', t.id)).filter((m) => m.stage === 'knockout');
    const views = await matches.views(auth.tenant, rows);
    const rounds = [...new Set(views.map((v) => v.roundNo))].sort((a, b) => a - b);
    return rounds.map((r) => ({
      roundNo: r,
      matches: views.filter((v) => v.roundNo === r).sort((a, b) => (a.label === 'Tranh hạng 3') - (b.label === 'Tranh hạng 3') || a.bracketPos - b.bracketPos)
    }));
  };

  const teams = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'read');
    const { teams: rows, people } = await teamsWithPeople(auth.tenant, t);
    return rows.map((x) => ctx.teamView(x, people));
  };

  const placements = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'read');
    const rows = await TournamentPlacement.findAll({ where: { tournamentId: t.id }, order: [['positionFrom', 'ASC']] });
    const { teams: all, people } = await teamsWithPeople(auth.tenant, t);
    const byId = new Map(all.map((x) => [x.id, x]));
    return rows.map((p) => ({
      teamId: p.teamId,
      from: p.positionFrom,
      to: p.positionTo,
      label: p.label,
      reachedKnockout: p.reachedKnockout,
      wins: p.wins,
      players: ctx.teamView(byId.get(p.teamId), people).players.map((x) => ({ id: x.id, name: x.name }))
    }));
  };

  // Giải của tôi (khách hàng): giải có tên mình, kèm đội + số trận sắp tới.
  const mine = async ({ tenant, playerId }) => {
    const myEntries = await TournamentEntry.findAll({ where: { tenantId: tenant, playerId, status: { [Op.ne]: 'withdrawn' } } });
    const ids = myEntries.map((e) => e.tournamentId);
    if (!ids.length) return [];
    const list = await Tournament.findAll({ where: { id: ids, status: { [Op.ne]: 'cancelled' } }, order: [['startsOn', 'DESC']] });
    const out = [];
    for (const t of list) {
      const entry = myEntries.find((e) => e.tournamentId === t.id);
      const team = await TournamentTeam.findOne({ where: { tournamentId: t.id, [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }] } });
      const place = team ? await TournamentPlacement.findOne({ where: { tournamentId: t.id, teamId: team.id } }) : null;
      const ms = team ? (await matches.listForContext(tenant, 'tournament', t.id)).filter((m) => m.teamAId === team.id || m.teamBId === team.id) : [];
      out.push({
        tournament: ctx.view(t),
        entryStatus: entry.status,
        teamId: team ? team.id : null,
        partnerPlayerId: team ? [team.player1Id, team.player2Id].find((x) => x && x !== playerId) || null : null,
        upcomingMatches: ms.filter((m) => m.status === 'scheduled' || m.status === 'in_play').length,
        playedMatches: ms.filter((m) => m.status === 'completed').length,
        placement: place ? { from: place.positionFrom, to: place.positionTo, label: place.label } : null
      });
    }
    return out;
  };

  return { progress, list, entries, matchList, standings, bracket, teams, placements, mine };
};

module.exports = { createTournamentQueries };
