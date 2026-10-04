const express = require('express');
const request = require('supertest');
const { UniqueConstraintError } = require('sequelize');
const { createCompetitionWebhookRouter } = require('../src/routes/competitionWebhookRoutes');
const { handleEvent, branchIdOf } = require('../src/integrations/competition/webhookHandlers');
const { sign } = require('../src/integrations/competition/signature');
const { enabledConfig, WEBHOOK_SECRET } = require('./competitionTestKit');

const config = enabledConfig();

const makeApp = ({ cfg = config, inbox = [] } = {}) => {
  const record = jest.fn(async () => ({}));
  const IntegrationInbox = {
    findOne: jest.fn(async ({ where }) => inbox.find((r) => r.eventId === where.eventId) || null),
    create: jest.fn(async (row) => { inbox.push(row); return row; })
  };
  const sequelize = { transaction: async (fn) => fn({ id: 'tx' }) };
  const app = express();
  const passLimiter = (req, res, next) => next();
  app.use('/hook', createCompetitionWebhookRouter({ config: cfg, sequelize, models: { IntegrationInbox }, record, limiter: passLimiter }));
  app.use(express.json()); // như server.js: webhook đứng trước parser toàn cục
  return { app, record, IntegrationInbox, inbox };
};

const post = (app, event, { secret = WEBHOOK_SECRET, source = 'competition-service', timestamp = Math.floor(Date.now() / 1000), signature } = {}) => {
  const body = JSON.stringify(event);
  return request(app).post('/hook/events')
    .set('Content-Type', 'application/json')
    .set('X-Event-Source', source)
    .set('X-Timestamp', String(timestamp))
    .set('X-Signature', signature || sign(secret, timestamp, body))
    .send(body);
};

const finalized = {
  specversion: '1.0',
  id: '0198-evt-1',
  type: 'competition.tournament.finalized',
  source: 'competition-service',
  tenant: 'badminton-digital',
  data: { tournamentId: 't-1', organizerRef: 'bd:branch:2', placements: [{}, {}, {}], ratingChanges: [{}, {}], rankingPoints: [{}] }
};

describe('webhook competition → app chính', () => {
  test('chưa cấu hình → 503 (fail-closed)', async () => {
    const { app, record } = makeApp({ cfg: { enabled: false } });
    const res = await post(app, finalized);
    expect(res.status).toBe(503);
    expect(record).not.toHaveBeenCalled();
  });

  test.each([
    ['sai chữ ký', { signature: 'sha256=' + '0'.repeat(64) }],
    ['ký bằng secret khác', { secret: 'secret-khac-secret-khac-secret-khac-0123' }],
    ['lệch giờ quá 5 phút', { timestamp: Math.floor(Date.now() / 1000) - 400 }],
    ['sai nguồn gửi', { source: 'ke-la-mat' }]
  ])('%s → 401 và ghi nhật ký competition.webhook_rejected, không xử lý gì', async (_, options) => {
    const { app, record, inbox } = makeApp();
    const res = await post(app, finalized, options);
    expect(res.status).toBe(401);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ action: 'competition.webhook_rejected', actor: null });
    expect(inbox).toHaveLength(0);
  });

  test('thiếu header chữ ký → 401', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/hook/events').send(finalized);
    expect(res.status).toBe(401);
  });

  test('chốt giải: ghi ActivityLog ở đúng chi nhánh tổ chức, đánh dấu processed', async () => {
    const { app, record, inbox } = makeApp();
    const res = await post(app, finalized);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { eventId: '0198-evt-1', status: 'processed' } });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({
      actor: null,
      branchId: 2,
      action: 'competition.tournament_finalized',
      targetType: 'competition',
      newValues: { tournamentId: 't-1', placements: 3, ratingChanges: 2, rankingPoints: 1, organizerRef: 'bd:branch:2', eventId: '0198-evt-1' }
    });
    expect(inbox).toEqual([expect.objectContaining({ eventId: '0198-evt-1', type: 'competition.tournament.finalized', status: 'processed' })]);
  });

  test('gửi lại cùng id → duplicate, ActivityLog chỉ ghi một lần', async () => {
    const { app, record } = makeApp();
    await post(app, finalized);
    const again = await post(app, finalized);
    expect(again.body.data).toMatchObject({ eventId: '0198-evt-1', status: 'duplicate' });
    expect(record).toHaveBeenCalledTimes(1);
  });

  test('hai request trùng đua nhau (đụng khoá duy nhất khi ghi inbox) → duplicate, không lỗi 500', async () => {
    const { app, IntegrationInbox } = makeApp();
    IntegrationInbox.create.mockRejectedValueOnce(new UniqueConstraintError({ message: 'dup' }));
    const res = await post(app, finalized);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('duplicate');
  });

  test.each([
    ['competition.match.completed'],
    ['competition.player.rating_changed'],
    ['competition.tournament.drawn'],
    ['competition.assessment.submitted'],
    ['loai.la.hoan.toan']
  ])('%s → nhận 2xx và bỏ qua có chủ ý (không ActivityLog), vẫn khử trùng', async (type) => {
    const { app, record, inbox } = makeApp();
    const res = await post(app, { ...finalized, id: `evt-${type}`, type, data: {} });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ignored');
    expect(record).not.toHaveBeenCalled();
    expect(inbox[0]).toMatchObject({ status: 'ignored' });
  });

  test('thiếu id / type → 400', async () => {
    const { app } = makeApp();
    expect((await post(app, { type: 'x', data: {} })).status).toBe(400);
    expect((await post(app, { id: 'x', data: {} })).status).toBe(400);
    expect((await post(app, { id: 'x'.repeat(65), type: 'x' })).status).toBe(400);
  });

  test('handler ném lỗi → 5xx (service sẽ gửi lại), KHÔNG ghi inbox', async () => {
    const { app, record, inbox } = makeApp();
    record.mockRejectedValueOnce(new Error('db down'));
    const errApp = express();
    errApp.use(app);
    errApp.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message })); // errorHandler thật nằm ở server.js
    const res = await post(errApp, finalized);
    expect(res.status).toBe(500);
    expect(inbox).toHaveLength(0);
  });
});

describe('handler sự kiện → ActivityLog', () => {
  const recordWith = () => jest.fn(async () => ({}));

  test.each([
    ['competition.tournament.unfinalized', { tournamentId: 't', organizerRef: 'bd:branch:1', reason: 'nhập sai' }, 'competition.tournament_unfinalized', { tournamentId: 't', reason: 'nhập sai' }],
    ['competition.tournament.cancelled', { tournamentId: 't', organizerRef: 'bd:branch:1', reason: 'mưa bão' }, 'competition.tournament_cancelled', { tournamentId: 't', reason: 'mưa bão' }],
    ['competition.session.closed', { sessionId: 's', organizerRef: 'bd:branch:1', rated: true, matches: 9, ratingChanges: [{}, {}] }, 'competition.session_closed', { sessionId: 's', rated: true, matches: 9, ratingChanges: 2 }]
  ])('%s', async (type, data, action, expectedValues) => {
    const record = recordWith();
    await handleEvent({ id: 'e', type, data }, { transaction: { id: 'tx' }, record });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action, branchId: 1, transaction: { id: 'tx' }, newValues: expect.objectContaining(expectedValues) }));
  });

  test('organizerRef không phải chi nhánh (*, thiếu, lạ) → branchId null chứ không đoán', () => {
    expect(branchIdOf('bd:branch:12')).toBe(12);
    for (const value of ['*', '', null, undefined, 'bd:branch:x', 'bd:branch:1; DROP', 'org:3']) expect(branchIdOf(value)).toBeNull();
  });

  test('loại không có handler → null, không gọi record', async () => {
    const record = recordWith();
    expect(await handleEvent({ id: 'e', type: 'competition.match.completed', data: {} }, { transaction: {}, record })).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
});
