const express = require('express');
const asyncHandler = require('../../../../platform/http/asyncHandler');
const { requireScope } = require('../../../../platform/http/auth');
const { ok, paged } = require('../../../../platform/http/envelope');
const { parsePagination } = require('../../../../platform/http/pagination');

// Route của module session (docs/02 mục 2.7). Route kiểm scope tối thiểu; quyền theo
// chi nhánh kiểm ở sessionContext.authorize.

const READ = ['session:read', 'session:operate'];
const OPERATE = ['session:operate'];

const createSessionRouter = ({ service, queries, ctx, idempotency, stream, signups, pub }) => {
  const router = express.Router();
  const base = (req) => ({ auth: req.auth, id: req.params.id, requestId: req.requestId });
  const detail = async (s) => ctx.view(s, { progress: await queries.progress(s) });
  const rosterOf = (req) => queries.roster(base(req));

  router.post(
    '/sessions',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const s = await service.create({ auth: req.auth, body: req.body, requestId: req.requestId });
      return ok(res, await detail(s), { status: 201, etag: s.version, message: 'Đã tạo buổi giao lưu' });
    })
  );

  router.get(
    '/sessions',
    requireScope(...READ),
    asyncHandler(async (req, res) => {
      const { page, limit } = parsePagination(req.query);
      const { rows, count } = await queries.list({ auth: req.auth, ...req.query, page, limit });
      return ok(res, paged(rows.map((s) => ctx.view(s)), count, page, limit));
    })
  );

  router.get(
    '/sessions/:id',
    requireScope(...READ),
    asyncHandler(async (req, res) => {
      const s = await ctx.load(null, req.auth.tenant, req.params.id);
      ctx.authorize(req.auth, s, 'read');
      return ok(res, await detail(s), { etag: s.version });
    })
  );

  router.patch(
    '/sessions/:id',
    requireScope(...OPERATE),
    asyncHandler(async (req, res) => {
      const s = await service.update({ ...base(req), body: req.body, ifMatch: req.get('If-Match') });
      return ok(res, await detail(s), { etag: s.version, message: 'Đã cập nhật buổi giao lưu' });
    })
  );

  router.get('/sessions/:id/players', requireScope(...READ), asyncHandler(async (req, res) => ok(res, { items: await rosterOf(req) })));

  router.post(
    '/sessions/:id/players',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const { quickAssessed } = await service.checkIn({ ...base(req), playerId: req.body.playerId, quickLevel: req.body.quickLevel });
      return ok(res, { items: await rosterOf(req) }, { status: 201, message: quickAssessed ? 'Đã chấm nhanh và điểm danh' : 'Đã điểm danh' });
    })
  );

  router.delete(
    '/sessions/:id/players/:playerId',
    requireScope(...OPERATE),
    asyncHandler(async (req, res) => {
      await service.leave({ ...base(req), playerId: req.params.playerId });
      return ok(res, { items: await rosterOf(req) }, { message: 'Đã rời buổi' });
    })
  );

  router.post(
    '/sessions/:id/fill-courts/preview',
    requireScope(...OPERATE),
    asyncHandler(async (req, res) => {
      const preview = await service.previewFill({ ...base(req), seed: req.body.seed });
      return ok(res, await queries.proposalView({ auth: req.auth, ...preview }));
    })
  );

  router.post(
    '/sessions/:id/fill-courts',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const { round, seed, manualEdits, matchIds } = await service.confirmFill({ ...base(req), body: req.body });
      const all = await queries.sessionMatches(base(req));
      const created = new Set(matchIds);
      return ok(res, { round, seed, manualEdits, matches: all.filter((m) => created.has(m.id)) }, { status: 201, message: `Đã xếp lượt ${round}` });
    })
  );

  // Đăng ký online (plan 27): nhân viên xem ai đã báo trước, gỡ đăng ký; điểm danh vẫn là POST …/players như cũ.
  router.get('/sessions/:id/signups', requireScope(...READ), asyncHandler(async (req, res) => ok(res, { items: await queries.signups(base(req)) })));

  router.delete(
    '/sessions/:id/signups/:signupId',
    requireScope(...OPERATE),
    asyncHandler(async (req, res) => {
      await signups.cancelByStaff({ ...base(req), signupId: req.params.signupId });
      return ok(res, { items: await queries.signups(base(req)) }, { message: 'Đã gỡ đăng ký' });
    })
  );

  // Khách tự đăng ký / huỷ buổi giao lưu trên trang công khai (scope entry:self, như đăng ký giải).
  router.post(
    '/me/sessions/:id/signup',
    requireScope('entry:self'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      await signups.signUp({ auth: req.auth, id: req.params.id, requestId: req.requestId });
      return ok(res, await pub.detail({ auth: req.auth, id: req.params.id }), { status: 201, message: 'Đã đăng ký' });
    })
  );

  router.delete(
    '/me/sessions/:id/signup',
    requireScope('entry:self'),
    asyncHandler(async (req, res) => {
      await signups.cancel({ auth: req.auth, id: req.params.id, requestId: req.requestId });
      return ok(res, await pub.detail({ auth: req.auth, id: req.params.id }), { message: 'Đã huỷ đăng ký' });
    })
  );

  router.get('/me/sessions', requireScope('entry:self'), asyncHandler(async (req, res) => ok(res, { items: await pub.mine({ auth: req.auth }) })));

  router.get('/sessions/:id/matches', requireScope(...READ), asyncHandler(async (req, res) => ok(res, { items: await queries.sessionMatches(base(req)) })));
  router.get('/sessions/:id/board', requireScope(...READ), asyncHandler(async (req, res) => ok(res, await queries.board(base(req)))));

  // Luồng SSE cho màn hình TV (plan 19): snapshot → score / board → ping; đóng khi token hết hạn.
  router.get(
    '/sessions/:id/stream',
    requireScope(...READ),
    asyncHandler(async (req, res) => {
      const s = await ctx.load(null, req.auth.tenant, req.params.id);
      ctx.authorize(req.auth, s, 'read');
      await stream(req, res, { contextType: 'session', contextId: s.id });
    })
  );
  router.get('/sessions/:id/close-preview', requireScope(...READ), asyncHandler(async (req, res) => ok(res, (await service.previewClose(base(req))).result)));

  router.post(
    '/sessions/:id/close',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const { session, result } = await service.close(base(req));
      return ok(res, { session: await detail(session), ...result }, { message: 'Đã đóng buổi giao lưu' });
    })
  );

  router.post(
    '/sessions/:id/cancel',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const s = await service.cancel(base(req));
      return ok(res, await detail(s), { etag: s.version, message: 'Đã huỷ buổi giao lưu' });
    })
  );

  return router;
};

module.exports = { createSessionRouter };
