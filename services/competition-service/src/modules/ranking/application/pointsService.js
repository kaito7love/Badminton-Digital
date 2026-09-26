const { Op } = require('sequelize');
const { round2 } = require('../../../shared/numbers');
const points = require('../domain/rankingPoints');

// BXH thành tích (docs/05 mục 3.2): trao điểm khi chốt giải, thu hồi khi huỷ
// chốt, bảng = tổng 6 kết quả tốt nhất còn hiệu lực (52 tuần) mỗi hạng mục.

const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_LABEL = { MS: 'Đơn nam', WS: 'Đơn nữ', MD: 'Đôi nam', WD: 'Đôi nữ', XD: 'Đôi nam nữ' };

// Xếp hạng kiểu thi đấu: điểm → nhiều kết quả được tính hơn → điểm trình cao hơn → đồng hạng.
const rankList = (list) => {
  const sorted = [...list].sort(
    (a, b) => b.points - a.points || b.countedResults - a.countedResults || b.rating - a.rating || (a.playerId < b.playerId ? -1 : 1)
  );
  let prev = null;
  return sorted.map((row, i) => {
    const key = `${row.points}|${row.countedResults}|${row.rating}`;
    const rank = prev && prev.key === key ? prev.rank : i + 1;
    prev = { key, rank };
    return { ...row, rank };
  });
};

const createPointsService = ({ models, players, ratingQueries, profile, levelFor }) => {
  const { RankingResult } = models;

  // teams: [{ teamId, players: [{ id, gender }], placement: { from, to, label, reachedKnockout, wins } }]
  const previewAward = ({ tournament, teams, avgRating }) => {
    if (!tournament.ranked) return { eligible: false, reason: 'Giải tắt "tính điểm BXH"', results: [] };
    if (teams.length < points.MIN_TEAMS) return { eligible: false, reason: `Giải dưới ${points.MIN_TEAMS} đội — không trao điểm BXH`, results: [] };
    const results = [];
    for (const team of teams) {
      const category = points.categoryFor({
        discipline: tournament.discipline,
        genderRule: tournament.genderRule,
        genders: team.players.map((p) => p.gender)
      });
      if (!category) continue;
      const calc = points.pointsFor({ placement: team.placement, format: tournament.format, tier: tournament.tier, teams: teams.length, avgRating });
      for (const p of team.players) {
        results.push({ playerId: p.id, teamId: team.teamId, category, placement: team.placement, ...calc });
      }
    }
    return { eligible: true, reason: null, results };
  };

  const awardTournament = async (transaction, { tenant, tournament, teams, avgRating, now = new Date() }) => {
    const { eligible, results } = previewAward({ tournament, teams, avgRating });
    if (!eligible) return [];
    await RankingResult.bulkCreate(
      results.map((r) => ({
        tenantId: tenant,
        playerId: r.playerId,
        category: r.category,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        placementFrom: r.placement.from,
        placementTo: r.placement.to,
        placementLabel: r.placement.label,
        basePoints: r.base,
        tierFactor: r.tierFactor,
        sizeFactor: r.sizeFactor,
        strengthFactor: r.strengthFactor,
        points: r.points,
        awardedAt: now,
        expiresAt: new Date(now.getTime() + points.WINDOW_DAYS * DAY_MS)
      })),
      { transaction }
    );
    return results;
  };

  const revokeTournament = (transaction, { tenant, tournamentId, now = new Date() }) =>
    RankingResult.update({ revokedAt: now }, { where: { tenantId: tenant, tournamentId, revokedAt: null }, transaction });

  // Tổng 6 kết quả tốt nhất còn hiệu lực của từng người trong một hạng mục.
  const board = async (tenant, category, now = new Date()) => {
    const rows = await RankingResult.findAll({
      where: { tenantId: tenant, category, revokedAt: null, expiresAt: { [Op.gt]: now } },
      order: [['points', 'DESC'], ['awardedAt', 'DESC']]
    });
    const byPlayer = new Map();
    for (const r of rows) {
      if (!byPlayer.has(r.playerId)) byPlayer.set(r.playerId, []);
      byPlayer.get(r.playerId).push(r);
    }
    const discipline = category.endsWith('S') ? 'singles' : 'doubles';
    const ids = [...byPlayer.keys()];
    const ratings = await ratingQueries.disciplineRatings(tenant, ids, discipline, now);
    const people = new Map((await players.findByIds(tenant, ids)).map((p) => [p.id, p]));
    const list = [];
    for (const [playerId, results] of byPlayer) {
      const player = people.get(playerId);
      if (!player || player.status !== 'active' || player.visibility === 'hidden') continue;
      const counted = results.slice(0, points.BEST_RESULTS);
      list.push({
        playerId,
        player,
        points: counted.reduce((s, r) => s + r.points, 0),
        countedResults: counted.length,
        rating: ratings.get(playerId) ? ratings.get(playerId).rating : 0,
        results: counted
      });
    }
    return rankList(list);
  };

  const pointsLeaderboard = async ({ auth, category, organizerRef, page, limit, now = new Date() }) => {
    let list = await board(auth.tenant, category, now);
    if (organizerRef) list = rankList(list.filter((r) => r.player.homeOrganizerRef === organizerRef));
    const viewer = profile.viewerKind(auth);
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit).map((r) => {
      const masked = viewer === 'public' && r.player.visibility !== 'public';
      const level = r.rating ? levelFor(r.rating) : null;
      return {
        rank: r.rank,
        movement: null,
        player: masked
          ? { id: null, name: 'Thành viên', masked: true }
          : { id: r.player.id, name: viewer === 'public' ? profile.publicName(r.player) : r.player.displayName, nickname: r.player.nickname ?? null, masked: false },
        points: r.points,
        countedResults: r.countedResults,
        rating: r.rating ? round2(r.rating) : null,
        level: level ? level.label : null,
        isMe: Boolean(auth.player && r.player.externalRef === auth.player),
        results: r.results.map((x) => ({
          tournamentId: x.tournamentId,
          tournament: x.tournamentName,
          placement: x.placementLabel,
          points: x.points,
          awardedAt: new Date(x.awardedAt).toISOString(),
          expiresAt: new Date(x.expiresAt).toISOString()
        }))
      };
    });
    return { category, label: CATEGORY_LABEL[category], items, total: list.length };
  };

  const pointsPositions = async (tenant, playerId, now = new Date()) => {
    const out = {};
    for (const category of Object.keys(CATEGORY_LABEL)) {
      const list = await board(tenant, category, now);
      const hit = list.find((r) => r.playerId === playerId);
      if (hit) out[category] = { rank: hit.rank, total: list.length, points: hit.points, countedResults: hit.countedResults };
    }
    return out;
  };

  return { previewAward, awardTournament, revokeTournament, pointsLeaderboard, pointsPositions, CATEGORY_LABEL };
};

module.exports = { createPointsService };
