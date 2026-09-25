const express = require('express');
const asyncHandler = require('../../../../platform/http/asyncHandler');
const { requireScope } = require('../../../../platform/http/auth');
const { ok, paged } = require('../../../../platform/http/envelope');
const { notFound, badRequest } = require('../../../../platform/http/errors');
const { parsePagination } = require('../../../../platform/http/pagination');
const { viewerKind, canViewProfile } = require('../../domain/profile');
const { publicView } = require('../../application/views');

// Route của module player (docs/02 mục 2.1). Thống kê / lịch sử trận / đồng đội /
// đối đầu có ở bước 2 khi đã có bảng `matches`.

const createPlayerRouter = ({ players, idempotency }) => {
  const router = express.Router();
  const actor = (req) => ({ actorRef: req.auth.sub, requestId: req.requestId });

  router.get(
    '/me',
    requireScope('rating:self'),
    asyncHandler(async (req, res) => {
      const player = await players.ensureSelf(req.auth, actor(req));
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth, detail: true });
      return ok(res, view, { etag: player.version });
    })
  );

  router.patch(
    '/me',
    requireScope('rating:self'),
    asyncHandler(async (req, res) => {
      const self = await players.ensureSelf(req.auth, actor(req));
      const player = await players.updateProfile({
        tenant: req.auth.tenant, playerId: self.id, patch: req.body, isStaff: false, ...actor(req)
      });
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
      return ok(res, view, { etag: player.version, message: 'Đã cập nhật hồ sơ' });
    })
  );

  router.put(
    '/players/by-ref/:externalRef',
    requireScope('player:write'),
    asyncHandler(async (req, res) => {
      const { player, created } = await players.upsertByRef({
        tenant: req.auth.tenant, externalRef: req.params.externalRef, displayName: req.body.displayName, ...actor(req)
      });
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
      return ok(res, view, { status: created ? 201 : 200, etag: player.version });
    })
  );

  router.get(
    '/players/by-ref/:externalRef',
    requireScope('rating:read'),
    asyncHandler(async (req, res) => {
      const player = await players.findByRef(req.auth.tenant, req.params.externalRef);
      if (!player) throw notFound('Chưa có hồ sơ người chơi cho mã này');
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
      return ok(res, view, { etag: player.version });
    })
  );

  router.post(
    '/players/lookup',
    requireScope('rating:read'),
    asyncHandler(async (req, res) => {
      const refs = [...new Set(req.body.externalRefs)];
      const found = [];
      for (const ref of refs) {
        const player = await players.findByRef(req.auth.tenant, ref);
        if (player) found.push({ ref, player });
      }
      const views = await players.enrich(req.auth.tenant, found.map((f) => f.player), { auth: req.auth });
      const items = found.map((f, i) => ({ externalRef: f.ref, player: views[i] }));
      return ok(res, { items, missing: refs.filter((r) => !found.some((f) => f.ref === r)) });
    })
  );

  router.get(
    '/players',
    requireScope('rating:read'),
    asyncHandler(async (req, res) => {
      const { page, limit } = parsePagination(req.query);
      const { rows, count } = await players.list({
        tenant: req.auth.tenant,
        search: req.query.search,
        gender: req.query.gender,
        status: req.query.status || 'active',
        query: req.query,
        page,
        limit
      });
      const views = await players.enrich(req.auth.tenant, rows, { auth: req.auth });
      return ok(res, paged(views, count, page, limit));
    })
  );

  router.get(
    '/players/:id',
    requireScope('rating:read'),
    asyncHandler(async (req, res) => {
      const player = await players.requirePlayer(req.auth.tenant, req.params.id);
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth, detail: true });
      return ok(res, view, { etag: player.version });
    })
  );

  router.get(
    '/players/:id/public',
    requireScope('ranking:read', 'rating:read'),
    asyncHandler(async (req, res) => {
      const player = await players.findById(req.auth.tenant, req.params.id);
      const viewer = viewerKind(req.auth);
      const isSelf = Boolean(player && req.auth.player && player.externalRef === req.auth.player);
      // Không có quyền xem = không tồn tại (không lộ là hồ sơ ẩn có tồn tại).
      if (!player || !canViewProfile(player, viewer, isSelf)) throw notFound('Không tìm thấy người chơi');
      const view = publicView(player, viewer);
      const [enriched] = await players.enrich(req.auth.tenant, [player], { auth: req.auth, publicOnly: true });
      return ok(res, { ...view, ratings: enriched.ratings || null, ranking: enriched.ranking || null });
    })
  );

  router.patch(
    '/players/:id',
    requireScope('player:write'),
    asyncHandler(async (req, res) => {
      const player = await players.updateProfile({
        tenant: req.auth.tenant, playerId: req.params.id, patch: req.body, isStaff: true, ...actor(req)
      });
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
      return ok(res, view, { etag: player.version, message: 'Đã cập nhật hồ sơ' });
    })
  );

  router.post(
    '/players/:id/merge',
    requireScope('player:write'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      if (!req.body.sourcePlayerId) throw badRequest('Thiếu sourcePlayerId', [{ field: 'sourcePlayerId', message: 'Bắt buộc' }]);
      const { target, details } = await players.merge({
        tenant: req.auth.tenant, targetId: req.params.id, sourceId: req.body.sourcePlayerId, ...actor(req)
      });
      const [view] = await players.enrich(req.auth.tenant, [target], { auth: req.auth });
      return ok(res, { player: view, merged: details }, { message: 'Đã gộp hồ sơ' });
    })
  );

  router.post(
    '/players/:id/anonymize',
    requireScope('player:write'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const player = await players.anonymize({ tenant: req.auth.tenant, playerId: req.params.id, ...actor(req) });
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
      return ok(res, view, { message: 'Đã ẩn danh hoá hồ sơ' });
    })
  );

  return router;
};

module.exports = { createPlayerRouter };
