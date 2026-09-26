const { Op } = require('sequelize');
const { round2, mean } = require('../../../shared/numbers');
const { conflict } = require('../../../platform/http/errors');
const { assertAction } = require('../domain/stateMachine');
const { computeStandings } = require('../domain/standings');
const { computePlacements } = require('../domain/placements');

// Chốt / huỷ chốt giải (docs/06 mục 7). Chốt ghi NGUYÊN TỬ trong một transaction:
// điểm trình (module rating), thứ hạng, điểm BXH thành tích (module ranking),
// thống kê (module match + player), trạng thái, sự kiện.

const THIRD_PLACE_LABEL = 'Tranh hạng 3';

const createFinalizeService = ({ models, sequelize, players, ratings, ratingQueries, points, matches, platform, ctx }) => {
  const { Tournament, TournamentEntry, TournamentTeam, TournamentPlacement } = models;
  const { outbox, audit } = platform;

  // Kết quả giải từ dữ liệu hiện có (không ghi gì).
  const outcome = async (tenant, t, transaction) => {
    const list = await matches.listForContext(tenant, 'tournament', t.id, { transaction });
    const plain = list.map((m) => ({
      id: m.id, stage: m.stage, groupNo: m.groupNo, roundNo: m.roundNo, status: m.status, outcome: m.outcome,
      winnerSide: m.winnerSide, games: m.games, teamAId: m.teamAId, teamBId: m.teamBId, thirdPlace: m.label === THIRD_PLACE_LABEL
    }));
    const pending = plain.filter((m) => m.status !== 'completed' && m.status !== 'cancelled');
    const needsKnockout = t.format === 'groups_knockout' && t.stage !== 'knockout';
    const ready = plain.length > 0 && pending.length === 0 && !needsKnockout;

    const teams = await TournamentTeam.findAll({ where: { tournamentId: t.id }, order: [['seed', 'ASC']], transaction });
    const groupNos = [...new Set(teams.map((x) => x.groupNo).filter((g) => g !== null))].sort((a, b) => a - b);
    const groupStandings = groupNos.map((g) =>
      computeStandings({
        teamIds: teams.filter((x) => x.groupNo === g).map((x) => x.id),
        matches: plain.filter((m) => m.stage === 'group' && m.groupNo === g),
        bestOf: t.scoring.bestOf,
        seed: t.drawSeed
      })
    );
    const knockoutMatches = plain.filter((m) => m.stage === 'knockout');
    const knockoutRounds = Math.max(0, ...knockoutMatches.filter((m) => !m.thirdPlace).map((m) => m.roundNo || 0));
    const placements = ready
      ? computePlacements({ format: t.format, teamIds: teams.map((x) => x.id), groupStandings, knockoutMatches, allMatches: plain, knockoutRounds })
      : [];

    const playerIds = [...new Set(teams.flatMap((x) => [x.player1Id, x.player2Id]).filter(Boolean))];
    const entries = await TournamentEntry.findAll({ where: { tournamentId: t.id, playerId: playerIds }, transaction });
    const avgRating = mean(entries.map((e) => Number(e.pairingRatingSnapshot)));
    return { ready, pending: pending.length, needsKnockout, teams, placements, playerIds, avgRating, groupStandings };
  };

  const teamsForPoints = async (tenant, teams, placements, transaction) => {
    const people = new Map((await players.findByIds(tenant, teams.flatMap((x) => [x.player1Id, x.player2Id]).filter(Boolean), { transaction })).map((p) => [p.id, p]));
    const byTeam = new Map(placements.map((p) => [p.teamId, p]));
    return teams.map((team) => ({
      teamId: team.id,
      players: [team.player1Id, team.player2Id].filter(Boolean).map((id) => ({ id, gender: people.get(id) ? people.get(id).gender : null })),
      placement: byTeam.get(team.id)
    }));
  };

  const placementView = (placements, teams, people) => {
    const byId = new Map(teams.map((x) => [x.id, x]));
    return placements.map((p) => ({
      teamId: p.teamId,
      from: p.from,
      to: p.to,
      label: p.label,
      reachedKnockout: p.reachedKnockout,
      wins: p.wins,
      players: [byId.get(p.teamId).player1Id, byId.get(p.teamId).player2Id].filter(Boolean).map((id) => ({ id, name: people.get(id) ? people.get(id).displayName : null }))
    }));
  };

  const preview = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'read');
    const o = await outcome(auth.tenant, t);
    const people = new Map((await players.findByIds(auth.tenant, o.playerIds)).map((p) => [p.id, p]));
    const result = {
      ready: o.ready, pendingMatches: o.pending, needsKnockout: o.needsKnockout,
      placements: [], ratingChanges: [], rankingPoints: [], rankingEligible: false, rankingReason: null
    };
    if (!o.ready) return { tournament: t, result };
    result.placements = placementView(o.placements, o.teams, people);
    if (t.rated) {
      const engine = await matches.periodMatches(auth.tenant, 'tournament', t.id);
      const { changes } = await ratings.previewPeriod({ tenant: auth.tenant, discipline: t.discipline, matches: engine });
      result.ratingChanges = changes.map((c) => ({ playerId: c.playerId, name: people.get(c.playerId) ? people.get(c.playerId).displayName : null, before: round2(c.before), after: round2(c.after), delta: c.delta, matches: c.ratedMatchesAdded }));
    }
    const award = points.previewAward({ tournament: t, teams: await teamsForPoints(auth.tenant, o.teams, o.placements), avgRating: o.avgRating });
    result.rankingEligible = award.eligible;
    result.rankingReason = award.reason;
    result.rankingPoints = award.results.map((r) => ({ playerId: r.playerId, name: people.get(r.playerId) ? people.get(r.playerId).displayName : null, category: r.category, placement: r.placement.label, points: r.points }));
    return { tournament: t, result };
  };

  // Cột thống kê thuộc về giải: số giải, vô địch / á quân / bán kết, điểm cao nhất.
  const rebuildTournamentStats = async (transaction, tenant, playerIds, discipline) => {
    const finalized = await Tournament.findAll({ where: { tenantId: tenant, discipline, status: 'finalized' }, attributes: ['id'], transaction });
    const tIds = finalized.map((x) => x.id);
    const teams = tIds.length
      ? await TournamentTeam.findAll({ where: { tournamentId: tIds, [Op.or]: [{ player1Id: playerIds }, { player2Id: playerIds }] }, transaction })
      : [];
    const places = teams.length ? await TournamentPlacement.findAll({ where: { teamId: teams.map((x) => x.id) }, transaction }) : [];
    const placeOf = new Map(places.map((p) => [p.teamId, p]));
    const peaks = await ratingQueries.peakAllTime(tenant, playerIds, discipline, { transaction });
    for (const pid of playerIds) {
      const mine = teams.filter((x) => x.player1Id === pid || x.player2Id === pid);
      const pos = mine.map((x) => placeOf.get(x.id)).filter(Boolean);
      const peak = peaks.get(pid);
      await players.upsertStats(transaction, {
        tenant,
        playerId: pid,
        discipline,
        context: 'tournament',
        patch: {
          tournaments: mine.length,
          titles: pos.filter((p) => p.positionFrom === 1).length,
          runnerUps: pos.filter((p) => p.positionFrom === 2).length,
          semis: pos.filter((p) => p.positionFrom === 3 || p.positionFrom === 4).length,
          bestRating: peak ? peak.peak : null,
          bestRatingAt: peak ? peak.at : null
        }
      });
    }
  };

  const finalize = async ({ auth, id, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, 'finalize');
      const o = await outcome(auth.tenant, t, transaction);
      if (!o.ready) {
        throw conflict('NOT_READY', o.needsKnockout ? 'Chưa khoá sơ đồ loại trực tiếp' : `Còn ${o.pending} trận chưa xong`);
      }
      const people = new Map((await players.findByIds(auth.tenant, o.playerIds, { transaction })).map((p) => [p.id, p]));

      let ratingChanges = [];
      if (t.rated) {
        const engine = await matches.periodMatches(auth.tenant, 'tournament', t.id, { transaction });
        const applied = await ratings.applyPeriod(transaction, {
          tenant: auth.tenant, discipline: t.discipline, contextType: 'tournament', contextId: t.id, matches: engine, actorRef: auth.sub
        });
        ratingChanges = applied.changes;
      }
      await TournamentPlacement.bulkCreate(
        o.placements.map((p) => ({
          tenantId: auth.tenant, tournamentId: t.id, teamId: p.teamId, positionFrom: p.from, positionTo: p.to,
          label: p.label, reachedKnockout: p.reachedKnockout, wins: p.wins
        })),
        { transaction }
      );
      const pointTeams = await teamsForPoints(auth.tenant, o.teams, o.placements, transaction);
      const eligibility = points.previewAward({ tournament: t, teams: pointTeams, avgRating: o.avgRating });
      const awarded = await points.awardTournament(transaction, { tenant: auth.tenant, tournament: t, teams: pointTeams, avgRating: o.avgRating });
      await matches.markCounted(transaction, { tenant: auth.tenant, contextType: 'tournament', contextId: t.id, counted: true });
      await t.update({ status: 'finalized', finalizedAt: new Date() }, { transaction });
      await matches.rebuildStats(transaction, { tenant: auth.tenant, playerIds: o.playerIds, discipline: t.discipline, context: 'tournament' });
      await rebuildTournamentStats(transaction, auth.tenant, o.playerIds, t.discipline);

      const placements = placementView(o.placements, o.teams, people);
      await outbox.add(transaction, {
        type: 'competition.tournament.finalized',
        tenant: auth.tenant,
        aggregateType: 'tournament',
        aggregateId: t.id,
        data: {
          tournamentId: t.id,
          organizerRef: t.organizerRef,
          placements: placements.map((p) => ({ teamId: p.teamId, from: p.from, to: p.to, label: p.label, players: p.players.map((x) => x.id) })),
          ratingChanges: ratingChanges.map((c) => ({ playerId: c.playerId, discipline: t.discipline, before: c.before, after: c.after })),
          rankingPoints: awarded.map((r) => ({ playerId: r.playerId, category: r.category, points: r.points }))
        }
      });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.finalized', targetType: 'tournament', targetId: t.id,
        after: { placements: placements.length, ratingChanges: ratingChanges.length, rankingPoints: awarded.length }, requestId
      });
      return {
        tournament: t,
        result: {
          placements,
          ratingChanges: ratingChanges.map((c) => ({ playerId: c.playerId, name: people.get(c.playerId) ? people.get(c.playerId).displayName : null, before: round2(c.before), after: round2(c.after), delta: c.delta, matches: c.ratedMatchesAdded })),
          rankingEligible: eligibility.eligible,
          rankingReason: eligibility.reason,
          rankingPoints: awarded.map((r) => ({ playerId: r.playerId, name: people.get(r.playerId) ? people.get(r.playerId).displayName : null, category: r.category, placement: r.placement.label, points: r.points }))
        }
      };
    });

  const unfinalize = async ({ auth, id, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, 'unfinalize');
      const { rolledBack } = await ratings.rollbackPeriod(transaction, {
        tenant: auth.tenant, discipline: t.discipline, contextType: 'tournament', contextId: t.id, actorRef: auth.sub
      });
      await points.revokeTournament(transaction, { tenant: auth.tenant, tournamentId: t.id });
      await TournamentPlacement.destroy({ where: { tournamentId: t.id }, transaction });
      await matches.markCounted(transaction, { tenant: auth.tenant, contextType: 'tournament', contextId: t.id, counted: false });
      await t.update({ status: 'in_progress', finalizedAt: null }, { transaction });
      const teams = await TournamentTeam.findAll({ where: { tournamentId: t.id }, transaction });
      const playerIds = [...new Set(teams.flatMap((x) => [x.player1Id, x.player2Id]).filter(Boolean))];
      await matches.rebuildStats(transaction, { tenant: auth.tenant, playerIds, discipline: t.discipline, context: 'tournament' });
      await rebuildTournamentStats(transaction, auth.tenant, playerIds, t.discipline);
      await outbox.add(transaction, {
        type: 'competition.tournament.unfinalized',
        tenant: auth.tenant,
        aggregateType: 'tournament',
        aggregateId: t.id,
        data: { tournamentId: t.id, organizerRef: t.organizerRef, reason: 'Huỷ chốt' }
      });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.unfinalized', targetType: 'tournament', targetId: t.id,
        after: { rolledBack: rolledBack.length }, requestId
      });
      return { tournament: t, rolledBack };
    });

  return { outcome, preview, finalize, unfinalize, placementView, rebuildTournamentStats };
};

module.exports = { createFinalizeService, THIRD_PLACE_LABEL };
