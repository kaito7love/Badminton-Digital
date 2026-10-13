const express = require('express');
const asyncHandler = require('../../../../platform/http/asyncHandler');
const { requireScope } = require('../../../../platform/http/auth');
const { ok, paged } = require('../../../../platform/http/envelope');
const { parsePagination } = require('../../../../platform/http/pagination');

// Route CÔNG KHAI của buổi giao lưu (plan 27): `/public/sessions/*`, scope `public:read`.

const createSessionPublicRouter = ({ pub, stream }) => {
  const router = express.Router();
  const readable = requireScope('public:read');
  const base = (req) => ({ auth: req.auth, id: req.params.id });

  router.get(
    '/public/sessions',
    readable,
    asyncHandler(async (req, res) => {
      const { page, limit } = parsePagination(req.query);
      const { rows, count } = await pub.list({ auth: req.auth, ...req.query, page, limit });
      return ok(res, paged(rows, count, page, limit));
    })
  );

  router.get('/public/sessions/:id', readable, asyncHandler(async (req, res) => ok(res, await pub.detail(base(req)))));
  router.get('/public/sessions/:id/board', readable, asyncHandler(async (req, res) => ok(res, await pub.board(base(req)))));
  router.get('/public/sessions/:id/signups', readable, asyncHandler(async (req, res) => ok(res, { items: await pub.signups(base(req)) })));

  router.get(
    '/public/sessions/:id/stream',
    readable,
    asyncHandler(async (req, res) => {
      const s = await pub.load(req.auth.tenant, req.params.id);
      await stream(req, res, { contextType: 'session', contextId: s.id });
    })
  );

  return router;
};

module.exports = { createSessionPublicRouter };
