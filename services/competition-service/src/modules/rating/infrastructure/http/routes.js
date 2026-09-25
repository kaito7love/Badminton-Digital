const express = require('express');
const asyncHandler = require('../../../../platform/http/asyncHandler');
const { requireScope } = require('../../../../platform/http/auth');
const { ok, paged } = require('../../../../platform/http/envelope');
const { notFound } = require('../../../../platform/http/errors');
const { parsePagination } = require('../../../../platform/http/pagination');
const { getRubric, CURRENT_VERSION } = require('../../domain/rubric');

// Route của module rating (docs/02 mục 2.2 + sổ điểm ở 2.1).

const iso = (d) => (d ? new Date(d).toISOString() : null);
const assessmentView = (a) => ({
  id: a.id,
  playerId: a.playerId,
  source: a.source,
  status: a.status,
  rubricVersion: a.rubricVersion,
  answers: a.answers,
  confidence: a.confidence,
  result: a.result,
  needsVerification: a.needsVerification,
  submittedByRef: a.submittedByRef,
  reviewedByRef: a.reviewedByRef,
  reviewedAt: iso(a.reviewedAt),
  reviewNote: a.reviewNote,
  evidenceRef: a.evidenceRef,
  matchId: a.matchId,
  note: a.note,
  createdAt: iso(a.createdAt)
});

const RUBRIC_SCOPES = ['rating:self', 'rating:read', 'rating:assess', 'rating:assess:any'];

const createRatingRouter = ({ ratings, queries, players, playerDomain, idempotency }) => {
  const router = express.Router();
  const ctx = (req) => ({ auth: req.auth, requestId: req.requestId });

  const withPlayer = async (req, result, status = 201, message = null) => {
    const player = await players.requirePlayer(req.auth.tenant, result.playerId);
    const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
    return { status, message, data: { assessment: assessmentView(result.assessment), result: result.result || null, player: view } };
  };
  const send = (res, { status, message, data }) => ok(res, data, { status, message });

  router.get('/rubrics/current', requireScope(...RUBRIC_SCOPES), (req, res) => ok(res, getRubric(CURRENT_VERSION)));
  router.get(
    '/rubrics/:version',
    requireScope(...RUBRIC_SCOPES),
    asyncHandler(async (req, res) => {
      const rubric = getRubric(req.params.version);
      if (!rubric) throw notFound('Không có bộ tiêu chí này');
      return ok(res, rubric);
    })
  );

  router.post('/assessments/preview', requireScope('rating:self', 'rating:assess', 'rating:assess:any'), (req, res, next) => {
    try {
      const source = req.auth.scopes.has('rating:self') && !req.auth.scopes.has('rating:assess') ? 'self' : req.body.source || 'self';
      return ok(res, ratings.preview({ rubricVersion: req.body.rubricVersion, answers: req.body.answers, source }));
    } catch (err) {
      return next(err);
    }
  });

  router.post(
    '/me/assessments',
    requireScope('rating:self'),
    idempotency.middleware,
    asyncHandler(async (req, res) =>
      send(res, await withPlayer(req, await ratings.submitSelf({ ...ctx(req), body: req.body }), 201, 'Đã ghi nhận bài tự chấm'))
    )
  );

  router.post(
    '/players/:id/assessments',
    requireScope('rating:assess', 'rating:assess:any'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const result = await ratings.submitStaff({ ...ctx(req), playerId: req.params.id, body: req.body });
      return send(res, await withPlayer(req, result, 201, result.assessment.status === 'applied' ? 'Đã chấm trình' : 'Đã lưu bài chấm (người chơi đã có trận — điểm không đổi)'));
    })
  );

  router.post(
    '/players/:id/assessments/quick',
    requireScope('rating:assess', 'rating:assess:any'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const result = await ratings.quickAssess({ ...ctx(req), playerId: req.params.id, level: req.body.level, note: req.body.note });
      return send(res, await withPlayer(req, result, 201, 'Đã chấm nhanh'));
    })
  );

  router.post(
    '/players/:id/assessments/ai',
    requireScope('assessment:submit-ai'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const result = await ratings.submitAi({ ...ctx(req), playerId: req.params.id, body: req.body });
      return ok(res, { assessment: assessmentView(result.assessment) }, { status: 201, message: 'Đã nhận bài chấm AI — chờ duyệt' });
    })
  );

  router.get(
    '/assessments',
    requireScope('rating:assess:any'),
    asyncHandler(async (req, res) => {
      const { page, limit } = parsePagination(req.query);
      const { rows, count } = await ratings.listAssessments({ tenant: req.auth.tenant, status: req.query.status, flag: req.query.flag, page, limit });
      const people = await players.findByIds(req.auth.tenant, [...new Set(rows.map((r) => r.playerId))]);
      const nameOf = new Map(people.map((p) => [p.id, p.displayName]));
      return ok(res, paged(rows.map((r) => ({ ...assessmentView(r), playerName: nameOf.get(r.playerId) || null })), count, page, limit));
    })
  );

  router.post(
    '/assessments/:id/review',
    requireScope('rating:assess:any'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const result = await ratings.review({ ...ctx(req), assessmentId: req.params.id, decision: req.body.decision, answers: req.body.answers, note: req.body.note });
      const player = await players.requirePlayer(req.auth.tenant, result.playerId);
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
      return ok(
        res,
        { assessment: assessmentView(result.assessment), applied: result.applied ? assessmentView(result.applied) : null, player: view },
        { message: req.body.decision === 'approve' ? 'Đã duyệt' : 'Đã từ chối' }
      );
    })
  );

  router.post(
    '/players/:id/verify',
    requireScope('rating:assess:any'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const player = await ratings.verify({ ...ctx(req), playerId: req.params.id, discipline: req.body.discipline });
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
      return ok(res, view, { message: 'Đã xác nhận trình' });
    })
  );

  router.post(
    '/players/:id/rating-adjustments',
    requireScope('rating:adjust'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const { player, change } = await ratings.adjust({
        ...ctx(req), playerId: req.params.id, discipline: req.body.discipline, newRating: req.body.newRating, reason: req.body.reason
      });
      const [view] = await players.enrich(req.auth.tenant, [player], { auth: req.auth });
      return ok(res, { player: view, change }, { status: 201, message: 'Đã chỉnh điểm' });
    })
  );

  router.get(
    '/players/:id/rating-history',
    requireScope('ranking:read', 'rating:read', 'rating:self'),
    asyncHandler(async (req, res) => {
      const player = await players.findById(req.auth.tenant, req.params.id);
      const viewer = playerDomain.viewerKind(req.auth);
      const isSelf = Boolean(player && req.auth.player && player.externalRef === req.auth.player);
      if (!player || !playerDomain.canViewProfile(player, viewer, isSelf)) throw notFound('Không tìm thấy người chơi');
      const { page, limit } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });
      const { items, count } = await queries.history({ tenant: req.auth.tenant, playerId: player.id, discipline: req.query.discipline, page, limit });
      return ok(res, paged(items, count, page, limit));
    })
  );

  return router;
};

module.exports = { createRatingRouter };
