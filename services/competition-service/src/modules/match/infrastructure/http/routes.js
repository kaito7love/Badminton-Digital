const express = require('express');
const asyncHandler = require('../../../../platform/http/asyncHandler');
const { requireScope } = require('../../../../platform/http/auth');
const { ok, paged } = require('../../../../platform/http/envelope');
const { notFound } = require('../../../../platform/http/errors');
const { parsePagination } = require('../../../../platform/http/pagination');

// Route của module match (docs/02 mục 2.5 + lịch sử / đồng đội / đối đầu ở 2.1).
// Quyền trên từng trận do ngữ cảnh (giải / buổi giao lưu) quyết định. `match:score` = token
// "chỉ bấm điểm" của người chơi: chỉ trận mình đang đánh (application/liveScoring.js).

const OPERATE = ['tournament:operate', 'tournament:manage', 'session:operate'];
const READ = ['tournament:read', 'session:read', ...OPERATE];
const SCORE = [...OPERATE, 'match:score'];

const createMatchRouter = ({ matches, live, players, profile, idempotency }) => {
  const router = express.Router();

  const one = async (req, match) => {
    const [view] = await matches.views(req.auth.tenant, [match]);
    return view;
  };

  // Người xem có được xem lịch sử / đồng đội / đối đầu của người chơi này không.
  const visiblePlayer = async (req, id) => {
    const player = await players.findById(req.auth.tenant, id);
    const viewer = profile.viewerKind(req.auth);
    const isSelf = Boolean(player && req.auth.player && player.externalRef === req.auth.player);
    if (!player || !profile.canViewProfile(player, viewer, isSelf)) throw notFound('Không tìm thấy người chơi');
    return player;
  };

  router.get(
    '/matches/:id',
    requireScope(...READ, 'match:score'),
    asyncHandler(async (req, res) => {
      const match = await matches.getForRead(req.auth, req.params.id);
      return ok(res, await one(req, match), { etag: match.version });
    })
  );

  // --- Bấm điểm trực tiếp (docs/06 mục 1.5) ---
  router.get(
    '/matches/:id/live',
    requireScope(...READ, 'match:score'),
    asyncHandler(async (req, res) => ok(res, await live.get({ auth: req.auth, matchId: req.params.id })))
  );

  router.post(
    '/matches/:id/live/rallies',
    requireScope(...SCORE),
    idempotency.middleware,
    asyncHandler(async (req, res) =>
      ok(res, await live.rally({ auth: req.auth, matchId: req.params.id, side: req.body.side, revision: req.body.revision }))
    )
  );

  router.post(
    '/matches/:id/live/undo',
    requireScope(...SCORE),
    idempotency.middleware,
    asyncHandler(async (req, res) => ok(res, await live.undo({ auth: req.auth, matchId: req.params.id, revision: req.body.revision })))
  );

  router.put(
    '/matches/:id/live/server',
    requireScope(...SCORE),
    idempotency.middleware,
    asyncHandler(async (req, res) =>
      ok(res, await live.setServer({ auth: req.auth, matchId: req.params.id, firstServer: req.body.firstServer, revision: req.body.revision }))
    )
  );

  router.post(
    '/matches/:id/live/confirm',
    requireScope(...SCORE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const match = await live.confirm({ auth: req.auth, matchId: req.params.id, revision: req.body.revision, requestId: req.requestId });
      return ok(res, await one(req, match), { etag: match.version, message: 'Đã lưu kết quả từ tỉ số đã bấm' });
    })
  );

  router.post(
    '/matches/:id/call',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const match = await matches.callMatch({ auth: req.auth, matchId: req.params.id, courtRef: req.body.courtRef, requestId: req.requestId });
      return ok(res, await one(req, match), { etag: match.version, message: 'Đã gọi ra sân' });
    })
  );

  router.put(
    '/matches/:id/result',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const match = await matches.recordResult({
        auth: req.auth, matchId: req.params.id, body: req.body, ifMatch: req.get('If-Match'), requestId: req.requestId
      });
      return ok(res, await one(req, match), { etag: match.version, message: 'Đã ghi kết quả' });
    })
  );

  router.post(
    '/matches/:id/cancel',
    requireScope('tournament:manage', 'session:operate'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const match = await matches.cancelMatch({ auth: req.auth, matchId: req.params.id, requestId: req.requestId });
      return ok(res, await one(req, match), { etag: match.version, message: 'Đã huỷ trận' });
    })
  );

  router.post(
    '/matches/:id/end',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const match = await matches.endMatch({ auth: req.auth, matchId: req.params.id, requestId: req.requestId });
      return ok(res, await one(req, match), { etag: match.version, message: 'Đã kết thúc trận (không nhập tỉ số)' });
    })
  );

  const listMatches = async (req, res, playerId) => {
    const { page, limit } = parsePagination(req.query);
    const scope = req.query.scope === 'upcoming' ? 'upcoming' : 'history';
    const { rows, count } = await matches.playerMatches({ tenant: req.auth.tenant, playerId, scope, page, limit });
    return ok(res, paged(await matches.views(req.auth.tenant, rows), count, page, limit));
  };

  router.get(
    '/me/matches',
    requireScope('rating:self'),
    asyncHandler(async (req, res) => {
      const self = await players.ensureSelf(req.auth, { requestId: req.requestId });
      return listMatches(req, res, self.id);
    })
  );

  router.get(
    '/players/:id/matches',
    requireScope('ranking:read', 'rating:read', 'rating:self'),
    asyncHandler(async (req, res) => listMatches(req, res, (await visiblePlayer(req, req.params.id)).id))
  );

  router.get(
    '/players/:id/partners',
    requireScope('ranking:read', 'rating:read', 'rating:self'),
    asyncHandler(async (req, res) => {
      const player = await visiblePlayer(req, req.params.id);
      return ok(res, { playerId: player.id, items: await matches.partners({ tenant: req.auth.tenant, playerId: player.id }) });
    })
  );

  router.get(
    '/players/:id/head-to-head/:otherId',
    requireScope('ranking:read', 'rating:read', 'rating:self'),
    asyncHandler(async (req, res) => {
      const player = await visiblePlayer(req, req.params.id);
      const other = await visiblePlayer(req, req.params.otherId);
      return ok(res, await matches.headToHead({ tenant: req.auth.tenant, playerId: player.id, otherId: other.id }));
    })
  );

  return router;
};

module.exports = { createMatchRouter };
