const express = require('express');
const asyncHandler = require('../../../../platform/http/asyncHandler');
const { requireScope } = require('../../../../platform/http/auth');
const { ok, paged } = require('../../../../platform/http/envelope');
const { notFound } = require('../../../../platform/http/errors');
const { parsePagination } = require('../../../../platform/http/pagination');

// Route của module ranking (docs/02 mục 2.3). BXH thành tích ở bước 2.
const createRankingRouter = ({ ranking, players, profile }) => {
  const router = express.Router();

  router.get(
    '/leaderboards/rating',
    requireScope('ranking:read', 'rating:read'),
    asyncHandler(async (req, res) => {
      const { page, limit } = parsePagination(req.query, { defaultLimit: 50 });
      const result = await ranking.ratingLeaderboard({
        auth: req.auth,
        category: req.query.category,
        organizerRef: req.query.organizerRef,
        ageGroup: req.query.ageGroup,
        level: req.query.level,
        page,
        limit
      });
      return ok(res, { category: result.category, label: result.label, ...paged(result.items, result.total, page, limit) });
    })
  );

  router.get(
    '/players/:id/ranking',
    requireScope('ranking:read', 'rating:read'),
    asyncHandler(async (req, res) => {
      const player = await players.findById(req.auth.tenant, req.params.id);
      const viewer = profile.viewerKind(req.auth);
      const isSelf = Boolean(player && req.auth.player && player.externalRef === req.auth.player);
      if (!player || !profile.canViewProfile(player, viewer, isSelf)) throw notFound('Không tìm thấy người chơi');
      return ok(res, { playerId: player.id, rating: await ranking.positionsFor(req.auth.tenant, player) });
    })
  );

  return router;
};

module.exports = { createRankingRouter };
