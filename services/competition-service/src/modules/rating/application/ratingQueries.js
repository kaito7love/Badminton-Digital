const { Op, QueryTypes } = require('sequelize');
const { round2 } = require('../../../shared/numbers');
const config = require('../domain/ratingConfig');
const { levelFor } = require('../domain/levels');
const { effectiveMatches, reliability, isProvisional } = require('../domain/ratingEngine');
const { pairingRating } = require('../domain/pairingRating');

const DAY_MS = 24 * 60 * 60 * 1000;
const DISCIPLINES = ['singles', 'doubles'];

// Đọc điểm / cờ / sổ điểm — không ghi gì.
const createRatingQueries = ({ models, sequelize }) => {
  const { PlayerRating, Assessment, RatingChange } = models;

  // Đỉnh điểm trong cửa sổ 12 tháng (chống giấu trình).
  const peaks = async (tenant, playerIds, now) => {
    if (!playerIds.length) return new Map();
    const rows = await sequelize.query(
      `SELECT player_id AS playerId, discipline, MAX(rating_after) AS peak
         FROM rating_changes
        WHERE tenant_id = :tenant AND player_id IN (:ids) AND created_at >= :since
        GROUP BY player_id, discipline`,
      {
        replacements: { tenant, ids: playerIds, since: new Date(now.getTime() - config.ANTI_SANDBAG_WINDOW_DAYS * DAY_MS) },
        type: QueryTypes.SELECT
      }
    );
    return new Map(rows.map((r) => [`${r.playerId}|${r.discipline}`, Number(r.peak)]));
  };

  const ratingView = (row, peak, now) => {
    const nEff = effectiveMatches(row.ratedMatches, row.lastMatchAt, now);
    const level = levelFor(row.rating);
    return {
      rating: round2(row.rating),
      level: level.label,
      levelCode: level.code,
      ratedMatches: row.ratedMatches,
      reliability: reliability(nEff),
      provisional: isProvisional(nEff),
      verified: row.verified,
      pairingRating: round2(pairingRating(row.rating, peak)),
      lastMatchAt: row.lastMatchAt ? new Date(row.lastMatchAt).toISOString() : null
    };
  };

  // Điểm Đơn / Đôi cho nhiều người một lần.
  const ratingsFor = async (tenant, playerIds, now = new Date()) => {
    const result = new Map(playerIds.map((id) => [id, { singles: null, doubles: null }]));
    if (!playerIds.length) return result;
    const rows = await PlayerRating.findAll({ where: { tenantId: tenant, playerId: playerIds } });
    const peakMap = await peaks(tenant, playerIds, now);
    for (const row of rows) {
      result.get(row.playerId)[row.discipline] = ratingView(row, peakMap.get(`${row.playerId}|${row.discipline}`), now);
    }
    return result;
  };

  const latestAssessments = async (tenant, playerIds) => {
    if (!playerIds.length) return new Map();
    const rows = await Assessment.findAll({
      where: { tenantId: tenant, playerId: playerIds, status: { [Op.in]: ['applied', 'pending_review', 'recorded'] } },
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    });
    const out = new Map();
    for (const row of rows) {
      const entry = out.get(row.playerId) || { applied: null, pendingReview: false, latest: null };
      if (!entry.latest) entry.latest = row;
      if (row.status === 'applied' && !entry.applied) entry.applied = row;
      if (row.status === 'pending_review') entry.pendingReview = true;
      out.set(row.playerId, entry);
    }
    return out;
  };

  // Cờ cho BTC (docs/06 mục 4.2): chưa xác thực / cần xác nhận / chấm nhanh / chờ duyệt AI.
  const flagsOf = (ratings, assessments) => {
    const flags = [];
    const any = DISCIPLINES.map((d) => ratings[d]).filter(Boolean);
    if (any.some((r) => !r.verified && r.provisional)) flags.push('unverified');
    const applied = assessments && assessments.applied;
    if (applied && applied.needsVerification && !applied.reviewedAt) flags.push('needs_verification');
    if (applied && applied.source === 'staff_quick') flags.push('quick');
    if (assessments && assessments.pendingReview) flags.push('pending_review');
    return flags;
  };

  const assessmentSummary = (row) =>
    row
      ? {
          id: row.id,
          source: row.source,
          status: row.status,
          rubricVersion: row.rubricVersion,
          needsVerification: row.needsVerification,
          createdAt: new Date(row.createdAt).toISOString()
        }
      : null;

  // Enricher gắn vào view của module player.
  const enricher = async (tenant, players, context = {}) => {
    const ids = players.map((p) => p.id);
    const ratings = await ratingsFor(tenant, ids);
    const out = new Map();
    if (context.publicOnly) {
      for (const id of ids) out.set(id, { ratings: ratings.get(id) });
      return out;
    }
    const latest = await latestAssessments(tenant, ids);
    for (const id of ids) {
      const r = ratings.get(id);
      const a = latest.get(id);
      out.set(id, { ratings: r, flags: flagsOf(r, a), latestAssessment: assessmentSummary(a && a.latest) });
    }
    return out;
  };

  // Bộ lọc danh sách người chơi theo điểm / cờ (GET /v1/players).
  const listFilter = async (tenant, query = {}) => {
    const { discipline, minRating, maxRating, verified, flag } = query;
    let ids = null;
    const intersect = (next) => {
      ids = ids ? new Set([...ids].filter((x) => next.has(x))) : next;
    };
    if (discipline || minRating !== undefined || maxRating !== undefined || verified !== undefined) {
      const where = { tenantId: tenant };
      if (discipline) where.discipline = discipline;
      if (minRating !== undefined || maxRating !== undefined) {
        where.rating = {};
        if (minRating !== undefined) where.rating[Op.gte] = Number(minRating);
        if (maxRating !== undefined) where.rating[Op.lte] = Number(maxRating);
      }
      if (verified !== undefined) where.verified = String(verified) === 'true';
      const rows = await PlayerRating.findAll({ where, attributes: ['playerId'] });
      intersect(new Set(rows.map((r) => r.playerId)));
    }
    if (flag) {
      let rows;
      if (flag === 'unverified') {
        rows = await PlayerRating.findAll({ where: { tenantId: tenant, verified: false }, attributes: ['playerId'] });
      } else if (flag === 'needs_verification') {
        rows = await Assessment.findAll({
          where: { tenantId: tenant, status: 'applied', needsVerification: true, reviewedAt: null },
          attributes: ['playerId']
        });
      } else if (flag === 'quick') {
        rows = await Assessment.findAll({ where: { tenantId: tenant, status: 'applied', source: 'staff_quick' }, attributes: ['playerId'] });
      } else {
        rows = await Assessment.findAll({ where: { tenantId: tenant, status: 'pending_review' }, attributes: ['playerId'] });
      }
      intersect(new Set(rows.map((r) => r.playerId)));
    }
    return ids;
  };

  const hasRatedMatches = async (tenant, playerId, { transaction } = {}) =>
    (await PlayerRating.count({ where: { tenantId: tenant, playerId, ratedMatches: { [Op.gt]: 0 } }, transaction })) > 0;

  const history = async ({ tenant, playerId, discipline, page, limit }) => {
    const where = { tenantId: tenant, playerId };
    if (discipline) where.discipline = discipline;
    const { rows, count } = await RatingChange.findAndCountAll({
      where,
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      offset: (page - 1) * limit,
      limit
    });
    return {
      count,
      items: rows.map((r) => ({
        id: r.id,
        discipline: r.discipline,
        before: r.ratingBefore === null ? null : round2(r.ratingBefore),
        after: round2(r.ratingAfter),
        delta: Number(r.delta),
        reason: r.reason,
        assessmentId: r.assessmentId,
        contextType: r.contextType,
        contextId: r.contextId,
        note: r.note,
        calc: r.calc,
        createdAt: new Date(r.createdAt).toISOString()
      }))
    };
  };

  // Dữ liệu thô cho BXH trình độ (module ranking).
  const leaderboardRows = async (tenant, discipline) =>
    (await PlayerRating.findAll({ where: { tenantId: tenant, discipline } })).map((r) => ({
      playerId: r.playerId,
      rating: r.rating,
      ratedMatches: r.ratedMatches,
      verified: r.verified,
      lastMatchAt: r.lastMatchAt
    }));

  // Điểm một nội dung cho nhiều người (điều kiện giải, bốc thăm): { rating, pairingRating } hoặc không có.
  const disciplineRatings = async (tenant, playerIds, discipline, now = new Date()) => {
    const all = await ratingsFor(tenant, playerIds, now);
    const out = new Map();
    for (const [id, r] of all) if (r[discipline]) out.set(id, r[discipline]);
    return out;
  };

  // Điểm cao nhất từng có (cho thống kê "điểm cao nhất").
  const peakAllTime = async (tenant, playerIds, discipline, { transaction } = {}) => {
    if (!playerIds.length) return new Map();
    const rows = await sequelize.query(
      `SELECT r.player_id AS playerId, r.rating_after AS peak, r.created_at AS at
         FROM rating_changes r
         JOIN (SELECT player_id, MAX(rating_after) AS m FROM rating_changes
                WHERE tenant_id = :tenant AND discipline = :discipline AND player_id IN (:ids) GROUP BY player_id) x
           ON x.player_id = r.player_id AND x.m = r.rating_after
        WHERE r.tenant_id = :tenant AND r.discipline = :discipline
        ORDER BY r.created_at ASC`,
      { replacements: { tenant, discipline, ids: playerIds }, type: QueryTypes.SELECT, transaction }
    );
    const out = new Map();
    for (const r of rows) if (!out.has(r.playerId)) out.set(r.playerId, { peak: Number(r.peak), at: r.at });
    return out;
  };

  return { ratingsFor, enricher, listFilter, hasRatedMatches, history, leaderboardRows, flagsOf, disciplineRatings, peakAllTime };
};

module.exports = { createRatingQueries, DISCIPLINES };
