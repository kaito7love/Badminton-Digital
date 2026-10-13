const express = require('express');
const asyncHandler = require('../../../../platform/http/asyncHandler');
const { requireScope } = require('../../../../platform/http/auth');
const { ok, paged } = require('../../../../platform/http/envelope');
const { parsePagination } = require('../../../../platform/http/pagination');
const { advise } = require('../../domain/formatAdvisor');
const { expectedTime } = require('../../domain/operations');

// Route của module tournament (docs/02 mục 2.6). Route kiểm scope tối thiểu; quyền
// theo chi nhánh + hành động kiểm ở tournamentContext.authorize.

const READ = ['tournament:read', 'tournament:operate', 'tournament:manage'];
const OPERATE = ['tournament:operate', 'tournament:manage'];
const MANAGE = ['tournament:manage'];

const createTournamentRouter = ({ service, finalizer, queries, ctx, players, matches, idempotency, stream, selfRegistration }) => {
  const router = express.Router();
  const base = (req) => ({ auth: req.auth, id: req.params.id, requestId: req.requestId });
  const detail = async (t) => ctx.view(t, { progress: await queries.progress(t) });

  router.post('/tournaments/advice', requireScope(...READ), (req, res, next) => {
    try {
      return ok(res, advise(req.body));
    } catch (err) {
      return next(err);
    }
  });

  router.post(
    '/tournaments',
    requireScope(...MANAGE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const t = await service.create({ auth: req.auth, body: req.body, requestId: req.requestId });
      return ok(res, await detail(t), { status: 201, etag: t.version, message: 'Đã tạo giải (nháp)' });
    })
  );

  router.get(
    '/tournaments',
    requireScope(...READ),
    asyncHandler(async (req, res) => {
      const { page, limit } = parsePagination(req.query);
      const { rows, count } = await queries.list({ auth: req.auth, ...req.query, page, limit });
      return ok(res, paged(rows.map((t) => ctx.view(t)), count, page, limit));
    })
  );

  router.get(
    '/tournaments/:id',
    requireScope(...READ),
    asyncHandler(async (req, res) => {
      const t = await ctx.load(null, req.auth.tenant, req.params.id);
      ctx.authorize(req.auth, t, 'read');
      return ok(res, await detail(t), { etag: t.version });
    })
  );

  router.patch(
    '/tournaments/:id',
    requireScope(...MANAGE),
    asyncHandler(async (req, res) => {
      const t = await service.update({ ...base(req), body: req.body, ifMatch: req.get('If-Match') });
      return ok(res, await detail(t), { etag: t.version, message: 'Đã cập nhật giải' });
    })
  );

  const action = (path, fn, message, status = 200) =>
    router.post(
      `/tournaments/:id/${path}`,
      requireScope(...MANAGE),
      idempotency.middleware,
      asyncHandler(async (req, res) => {
        const t = await fn(req);
        return ok(res, await detail(t), { status, etag: t.version, message });
      })
    );
  action('open', (req) => service.open(base(req)), 'Đã mở đăng ký');
  action('cancel', (req) => service.cancel(base(req)), 'Đã huỷ giải');
  action('reopen', (req) => service.reopen(base(req)), 'Đã huỷ bốc thăm, mở lại đăng ký');
  action('draw', (req) => service.confirmDraw({ ...base(req), body: req.body }), 'Đã xác nhận bốc thăm');
  action('knockout', (req) => service.confirmKnockout({ ...base(req), positions: req.body.positions }), 'Đã khoá sơ đồ loại trực tiếp');

  router.get(
    '/tournaments/:id/entries',
    requireScope(...READ),
    asyncHandler(async (req, res) => ok(res, { items: await queries.entries(base(req)) }))
  );

  router.post(
    '/tournaments/:id/entries',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      await service.register({ ...base(req), playerId: req.body.playerId, partnerPlayerId: req.body.partnerPlayerId });
      return ok(res, { items: await queries.entries(base(req)) }, { status: 201, message: 'Đã đăng ký' });
    })
  );

  router.delete(
    '/tournaments/:id/entries/:entryId',
    requireScope(...OPERATE),
    asyncHandler(async (req, res) => {
      await service.withdraw({ ...base(req), entryId: req.params.entryId });
      return ok(res, { items: await queries.entries(base(req)) }, { message: 'Đã rút khỏi giải' });
    })
  );

  // --- Vận hành ngày thi đấu (plan 20) ---
  router.put(
    '/tournaments/:id/courts',
    requireScope(...MANAGE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const t = await service.setCourts({ ...base(req), courtRefs: req.body.courtRefs });
      return ok(res, await detail(t), { etag: t.version, message: 'Đã cập nhật sân của giải' });
    })
  );

  const entriesAfter = (fn, message) =>
    asyncHandler(async (req, res) => {
      await fn(req);
      return ok(res, { items: await queries.entries(base(req)) }, { message });
    });
  router.post(
    '/tournaments/:id/entries/:entryId/check-in',
    requireScope(...OPERATE),
    idempotency.middleware,
    entriesAfter((req) => service.checkIn({ ...base(req), entryId: req.params.entryId, present: true }), 'Đã điểm danh')
  );
  router.delete(
    '/tournaments/:id/entries/:entryId/check-in',
    requireScope(...OPERATE),
    entriesAfter((req) => service.checkIn({ ...base(req), entryId: req.params.entryId, present: false }), 'Đã bỏ điểm danh')
  );
  router.put(
    '/tournaments/:id/entries/:entryId/partner',
    requireScope(...OPERATE),
    idempotency.middleware,
    entriesAfter((req) => service.changePartner({ ...base(req), entryId: req.params.entryId, partnerPlayerId: req.body.partnerPlayerId }), 'Đã đổi đồng đội')
  );

  // Đội vắng: xem trước (đội chưa đánh trận nào, chưa đủ người điểm danh) → xử W.O.
  router.get(
    '/tournaments/:id/no-shows',
    requireScope(...OPERATE),
    asyncHandler(async (req, res) => {
      const t = await ctx.load(null, req.auth.tenant, req.params.id);
      ctx.authorize(req.auth, t, 'operate');
      const teams = await service.absentTeams(t);
      const people = new Map((await players.findByIds(req.auth.tenant, teams.flatMap((x) => [x.player1Id, x.player2Id]).filter(Boolean))).map((p) => [p.id, p]));
      return ok(res, { items: teams.map((x) => ctx.teamView(x, people)) });
    })
  );
  router.post(
    '/tournaments/:id/no-shows',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const { tournament, teamIds } = await service.noShows({ ...base(req), teamIds: req.body.teamIds });
      return ok(res, { tournament: await detail(tournament), teamIds }, { message: `Đã xử W.O. ${teamIds.length} đội vắng` });
    })
  );

  // Trận kế tiếp cho sân vừa trống: lượt sớm nhất mà mọi người đều rảnh, đội nghỉ lâu hơn trước.
  router.get(
    '/tournaments/:id/next-matches',
    requireScope(...READ),
    asyncHandler(async (req, res) => {
      const { tournament: t, freeCourts, candidates, blocked, byId } = await service.nextMatches(base(req));
      const top = candidates.slice(0, Math.min(Number(req.query.limit) || 5, 20));
      const views = await matches.views(req.auth.tenant, top.map((c) => byId.get(c.id)));
      return ok(res, {
        freeCourts,
        blocked,
        items: top.map((c, i) => ({
          match: { ...views[i], expectedTime: expectedTime(t.startTime, views[i].slotNo, t.matchMinutes) },
          restMinutes: Number.isFinite(c.restMs) ? Math.floor(c.restMs / 60000) : null,
          rested: c.rested
        }))
      });
    })
  );
  router.post(
    '/tournaments/:id/call-next',
    requireScope(...OPERATE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const match = await service.callNext({ ...base(req), courtRef: req.body.courtRef });
      const [view] = await matches.views(req.auth.tenant, [match]);
      return ok(res, view, { etag: match.version, message: 'Đã gọi trận kế tiếp ra sân' });
    })
  );

  router.post(
    '/tournaments/:id/draw/preview',
    requireScope(...MANAGE),
    asyncHandler(async (req, res) => ok(res, (await service.previewDraw({ ...base(req), seed: req.body.seed })).proposal))
  );

  router.get('/tournaments/:id/teams', requireScope(...READ), asyncHandler(async (req, res) => ok(res, { items: await queries.teams(base(req)) })));
  router.get('/tournaments/:id/matches', requireScope(...READ), asyncHandler(async (req, res) => ok(res, { items: await queries.matchList(base(req)) })));
  router.get('/tournaments/:id/standings', requireScope(...READ), asyncHandler(async (req, res) => ok(res, { groups: await queries.standings(base(req)) })));
  router.get('/tournaments/:id/bracket', requireScope(...READ), asyncHandler(async (req, res) => ok(res, { rounds: await queries.bracket(base(req)) })));
  router.get('/tournaments/:id/placements', requireScope(...READ), asyncHandler(async (req, res) => ok(res, { items: await queries.placements(base(req)) })));

  // Luồng SSE (plan 19): tỉ số trực tiếp các trận đang đánh + báo lịch / bảng đấu đổi.
  router.get(
    '/tournaments/:id/stream',
    requireScope(...READ),
    asyncHandler(async (req, res) => {
      const t = await ctx.load(null, req.auth.tenant, req.params.id);
      ctx.authorize(req.auth, t, 'read');
      await stream(req, res, { contextType: 'tournament', contextId: t.id });
    })
  );

  router.post(
    '/tournaments/:id/matches',
    requireScope(...MANAGE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const matchId = await service.addMatch({ ...base(req), body: req.body });
      const items = await queries.matchList(base(req));
      return ok(res, items.find((m) => m.id === matchId), { status: 201, message: 'Đã thêm trận' });
    })
  );

  router.post(
    '/tournaments/:id/knockout/preview',
    requireScope(...MANAGE),
    asyncHandler(async (req, res) => {
      const { teams, entrants, bracket } = await service.previewKnockout(base(req));
      const people = new Map((await players.findByIds(req.auth.tenant, teams.flatMap((x) => [x.player1Id, x.player2Id]).filter(Boolean))).map((p) => [p.id, p]));
      const teamById = new Map(teams.map((x) => [x.id, x]));
      return ok(res, {
        size: bracket.size,
        positions: bracket.positions,
        teams: Object.fromEntries(entrants.map((e) => [e.id, { ...ctx.teamView(teamById.get(e.id), people), groupNo: Number(e.group), groupRank: e.groupRank }])),
        firstRound: bracket.firstRound,
        constraintLevel: bracket.constraintLevel
      });
    })
  );

  router.get(
    '/tournaments/:id/finalize-preview',
    requireScope(...READ),
    asyncHandler(async (req, res) => ok(res, (await finalizer.preview(base(req))).result))
  );

  router.post(
    '/tournaments/:id/finalize',
    requireScope(...MANAGE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const { tournament, result } = await finalizer.finalize(base(req));
      return ok(res, { tournament: await detail(tournament), ...result }, { message: 'Đã chốt giải' });
    })
  );

  router.post(
    '/tournaments/:id/unfinalize',
    requireScope(...MANAGE),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const { tournament, rolledBack } = await finalizer.unfinalize(base(req));
      return ok(res, { tournament: await detail(tournament), rolledBack }, { message: 'Đã huỷ chốt giải' });
    })
  );

  router.get(
    '/me/tournaments',
    requireScope('rating:self'),
    asyncHandler(async (req, res) => {
      const self = await players.ensureSelf(req.auth, { requestId: req.requestId });
      return ok(res, { items: await queries.mine({ tenant: req.auth.tenant, playerId: self.id }) });
    })
  );

  // Khách tự đăng ký / rút trên trang công khai (plan 27). Trả về chi tiết giải công khai kèm `me` (đăng ký của chính mình).
  router.post(
    '/me/tournaments/:id/entries',
    requireScope('entry:self'),
    idempotency.middleware,
    asyncHandler(async (req, res) => {
      const data = await selfRegistration.register({ auth: req.auth, id: req.params.id, partner: req.body.partner, requestId: req.requestId });
      return ok(res, data, { status: 201, message: 'Đã đăng ký' });
    })
  );

  router.delete(
    '/me/tournaments/:id/entries',
    requireScope('entry:self'),
    asyncHandler(async (req, res) => ok(res, await selfRegistration.withdraw({ auth: req.auth, id: req.params.id, requestId: req.requestId }), { message: 'Đã rút khỏi giải' }))
  );

  return router;
};

module.exports = { createTournamentRouter };
