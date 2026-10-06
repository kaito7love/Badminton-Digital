const express = require('express');
const asyncHandler = require('../../../../platform/http/asyncHandler');
const { requireScope } = require('../../../../platform/http/auth');
const { ok, paged } = require('../../../../platform/http/envelope');
const { parsePagination } = require('../../../../platform/http/pagination');

// Route CÔNG KHAI của giải (plan 27): `/public/tournaments/*`, scope `public:read` (gateway cấp cho cả người chưa đăng
// nhập). Tách tiền tố riêng thay vì mở route của nhân viên: dữ liệu đi qua bộ gọt trong publicQueries (chỉ trường được
// lộ, tên theo quyền riêng tư).

const createTournamentPublicRouter = ({ pub, stream }) => {
  const router = express.Router();
  const readable = requireScope('public:read');
  const base = (req) => ({ auth: req.auth, id: req.params.id });

  router.get(
    '/public/tournaments',
    readable,
    asyncHandler(async (req, res) => {
      const { page, limit } = parsePagination(req.query);
      const { rows, count } = await pub.list({ auth: req.auth, ...req.query, page, limit });
      return ok(res, paged(rows, count, page, limit));
    })
  );

  router.get('/public/tournaments/:id', readable, asyncHandler(async (req, res) => ok(res, await pub.detail(base(req)))));
  router.get('/public/tournaments/:id/entries', readable, asyncHandler(async (req, res) => ok(res, { items: await pub.entries(base(req)) })));
  router.get('/public/tournaments/:id/matches', readable, asyncHandler(async (req, res) => ok(res, { items: await pub.matchList(base(req)) })));
  router.get('/public/tournaments/:id/standings', readable, asyncHandler(async (req, res) => ok(res, { groups: await pub.standings(base(req)) })));
  router.get('/public/tournaments/:id/bracket', readable, asyncHandler(async (req, res) => ok(res, { rounds: await pub.bracket(base(req)) })));
  router.get('/public/tournaments/:id/placements', readable, asyncHandler(async (req, res) => ok(res, { items: await pub.placements(base(req)) })));

  // Luồng SSE như của nhân viên (tỉ số trực tiếp + báo bảng / lịch đổi), nhưng chỉ cho giải được phép xem công khai.
  router.get(
    '/public/tournaments/:id/stream',
    readable,
    asyncHandler(async (req, res) => {
      const t = await pub.load(req.auth.tenant, req.params.id);
      await stream(req, res, { contextType: 'tournament', contextId: t.id });
    })
  );

  return router;
};

module.exports = { createTournamentPublicRouter };
