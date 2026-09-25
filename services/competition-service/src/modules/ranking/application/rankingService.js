const { Op } = require('sequelize');
const { round2 } = require('../../../shared/numbers');
const { RATING_CATEGORIES, isEligible, rankRows, projectedRank } = require('../domain/leaderboardRules');

// BXH trình độ (docs/05 mục 3.1). BXH thành tích (điểm theo thứ hạng giải) có ở
// bước 2 cùng module tournament.
//
// Quyết định khi code: thứ hạng tính trên cùng một tập người (đủ điều kiện, trừ
// `hidden`) cho MỌI người xem → số hạng nhất quán. Người `members` vẫn có hạng;
// người xem chưa đăng nhập thấy dòng đó bị che tên ("Thành viên").

const DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_RETENTION_DAYS = 90;
const MOVEMENT_LOOKBACK_DAYS = 7;

const createRankingService = ({ models, sequelize, players, ratingQueries, levelFor, profile, utcOffsetMinutes = 420 }) => {
  const { LeaderboardSnapshot } = models;

  const localDate = (now) => new Date(now.getTime() + utcOffsetMinutes * 60000).toISOString().slice(0, 10);

  // Tập người đủ điều kiện của một hạng mục, đã xếp hạng.
  const board = async (tenant, category, now = new Date()) => {
    const def = RATING_CATEGORIES[category];
    const rows = await ratingQueries.leaderboardRows(tenant, def.discipline);
    const people = await players.findByIds(tenant, rows.map((r) => r.playerId));
    const byId = new Map(people.map((p) => [p.id, p]));
    const eligible = [];
    const all = [];
    for (const row of rows) {
      const player = byId.get(row.playerId);
      if (!player || player.status !== 'active' || player.gender !== def.gender || player.visibility === 'hidden') continue;
      const entry = { ...row, player };
      all.push(entry);
      if (isEligible(row, now)) eligible.push(entry);
    }
    return { ranked: rankRows(eligible), all };
  };

  const previousRanks = async (tenant, category, scope, now) => {
    const date = localDate(new Date(now.getTime() - MOVEMENT_LOOKBACK_DAYS * DAY_MS));
    const rows = await LeaderboardSnapshot.findAll({ where: { tenantId: tenant, kind: 'rating', category, scope, snapshotDate: date } });
    return rows.length ? new Map(rows.map((r) => [r.playerId, r.rank])) : null;
  };

  const ratingLeaderboard = async ({ auth, category, organizerRef, ageGroup, level, page, limit, now = new Date() }) => {
    const { ranked } = await board(auth.tenant, category, now);
    let list = ranked;
    const filtered = Boolean(organizerRef || ageGroup || level);
    if (filtered) {
      list = rankRows(
        ranked
          .filter((r) => !organizerRef || r.player.homeOrganizerRef === organizerRef)
          .filter((r) => !ageGroup || profile.ageGroup(r.player.birthYear, now) === ageGroup)
          .filter((r) => !level || levelFor(r.rating).code === level)
          .map(({ rank, ...rest }) => rest)
      );
    }
    // ↑↓ chỉ có nghĩa với bảng toàn chuỗi hoặc theo chi nhánh (có ảnh chụp).
    const scope = organizerRef ? `org:${organizerRef}` : 'all';
    const prev = ageGroup || level ? null : await previousRanks(auth.tenant, category, scope, now);
    const viewer = profile.viewerKind(auth);
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit).map((r) => {
      const masked = viewer === 'public' && r.player.visibility !== 'public';
      const levelInfo = levelFor(r.rating);
      return {
        rank: r.rank,
        movement: prev && prev.has(r.playerId) ? prev.get(r.playerId) - r.rank : null,
        player: masked
          ? { id: null, name: 'Thành viên', masked: true }
          : { id: r.player.id, name: viewer === 'public' ? profile.publicName(r.player) : r.player.displayName, nickname: r.player.nickname, masked: false },
        rating: round2(r.rating),
        level: levelInfo.label,
        levelCode: levelInfo.code,
        ratedMatches: r.ratedMatches,
        verified: r.verified,
        isMe: Boolean(auth.player && r.player.externalRef === auth.player)
      };
    });
    return { category, label: RATING_CATEGORIES[category].label, items, total: list.length };
  };

  // Vị trí của một người trên mọi bảng hợp với giới của họ.
  const positionsFor = async (tenant, player, now = new Date()) => {
    const out = {};
    for (const [category, def] of Object.entries(RATING_CATEGORIES)) {
      if (def.gender !== player.gender) continue;
      const { ranked, all } = await board(tenant, category, now);
      const mine = all.find((r) => r.playerId === player.id);
      if (!mine) continue;
      const hit = ranked.find((r) => r.playerId === player.id);
      const prev = hit ? await previousRanks(tenant, category, 'all', now) : null;
      out[category] = {
        eligible: Boolean(hit),
        rank: hit ? hit.rank : null,
        total: ranked.length,
        movement: hit && prev && prev.has(player.id) ? prev.get(player.id) - hit.rank : null,
        projectedRank: hit ? null : projectedRank(ranked, mine.rating)
      };
    }
    return out;
  };

  // Enricher cho view chi tiết (không chạy cho danh sách — tính BXH tốn kém).
  const enricher = async (tenant, list, context = {}) => {
    const out = new Map();
    if (!context.detail && !context.publicOnly) return out;
    for (const player of list) out.set(player.id, { ranking: { rating: await positionsFor(tenant, player) } });
    return out;
  };

  // Ảnh chụp BXH hằng ngày (toàn chuỗi + từng chi nhánh) để tính ↑↓; giữ 90 ngày.
  const dailySnapshot = async (now = new Date()) => {
    const date = localDate(now);
    const tenants = await players.distinctTenants();
    let written = 0;
    for (const tenant of tenants) {
      for (const category of Object.keys(RATING_CATEGORIES)) {
        const { ranked } = await board(tenant, category, now);
        const scopes = new Map([['all', ranked]]);
        for (const r of ranked) {
          if (!r.player.homeOrganizerRef) continue;
          const key = `org:${r.player.homeOrganizerRef}`;
          if (!scopes.has(key)) scopes.set(key, []);
          scopes.get(key).push(r);
        }
        await sequelize.transaction(async (transaction) => {
          await LeaderboardSnapshot.destroy({ where: { tenantId: tenant, kind: 'rating', category, snapshotDate: date }, transaction });
          const rowsToWrite = [];
          for (const [scope, rows] of scopes) {
            const reRanked = scope === 'all' ? rows : rankRows(rows.map(({ rank, ...rest }) => rest));
            for (const r of reRanked) {
              rowsToWrite.push({ tenantId: tenant, kind: 'rating', category, scope, snapshotDate: date, playerId: r.playerId, rank: r.rank, value: r.rating });
            }
          }
          if (rowsToWrite.length) await LeaderboardSnapshot.bulkCreate(rowsToWrite, { transaction });
          written += rowsToWrite.length;
        });
      }
    }
    const cutoff = localDate(new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * DAY_MS));
    await LeaderboardSnapshot.destroy({ where: { snapshotDate: { [Op.lt]: cutoff } } });
    return { date, rows: written };
  };

  return { ratingLeaderboard, positionsFor, enricher, dailySnapshot, board };
};

module.exports = { createRankingService };
