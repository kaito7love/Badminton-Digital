const http = require('http');
const { createTestContext, allAnswers, STAFF } = require('./helpers');
const { verify } = require('../../src/platform/events/signature');
const { MAX_ATTEMPTS } = require('../../src/platform/events/dispatcher');

// Outbox thật: webhook tới một receiver HTTP thật; tắt / bật receiver để kiểm
// gửi lại, không mất, không trùng, đúng thứ tự, chữ ký hợp lệ (docs/01 mục 7).
const SECRET = 'webhook-secret-for-tests-0123456789abcdef';
let ctx;
let staff;
let server;
let port;
let accept = true;
const received = [];

const startReceiver = () =>
  new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const valid = verify({
          secret: SECRET,
          signature: req.headers['x-signature'],
          timestamp: req.headers['x-timestamp'],
          body,
          toleranceSeconds: 300
        });
        if (!accept) {
          res.statusCode = 503;
          return res.end();
        }
        received.push({ valid, event: JSON.parse(body), headers: req.headers });
        res.statusCode = valid ? 204 : 401;
        return res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

beforeAll(async () => {
  await startReceiver();
  ctx = await createTestContext({
    webhookTargets: [{ name: 'core', url: `http://127.0.0.1:${port}/hooks/competition`, secret: SECRET, types: ['competition.*'] }]
  });
  staff = await ctx.as({ scope: STAFF });
});
afterAll(async () => {
  await ctx.close();
  server.close();
});

const makeRated = async (ref) => {
  const p = await staff.put(`/v1/players/by-ref/${ref}`).send({ displayName: ref });
  await staff.post(`/v1/players/${p.body.data.id}/assessments`).send({ rubricVersion: 'v1', answers: allAnswers(3), profile: { gender: 'male' } });
  return p.body.data.id;
};

describe('outbox + dispatcher', () => {
  test('giao được: chữ ký HMAC hợp lệ, header đủ, trạng thái delivered', async () => {
    const playerId = await makeRated('bd:customer:o1');
    const { OutboxEvent } = ctx.models;
    expect(await OutboxEvent.count({ where: { aggregateId: playerId, status: 'pending' } })).toBe(3);
    const result = await ctx.built.dispatcher.runOnce();
    expect(result.delivered).toBeGreaterThanOrEqual(3);
    const mine = received.filter((r) => r.event.data.playerId === playerId);
    expect(mine).toHaveLength(3);
    expect(mine.every((r) => r.valid)).toBe(true);
    expect(mine[0].headers['x-event-type']).toBe(mine[0].event.type);
    for (const r of mine) expect(ctx.eventValidator.check(r.event)).toEqual([]);
    expect(await OutboxEvent.count({ where: { aggregateId: playerId, status: 'delivered' } })).toBe(3);
  });

  test('bên nhận chết → giữ pending + lùi lịch; sống lại → giao đủ, không trùng, đúng thứ tự', async () => {
    accept = false;
    const playerId = await makeRated('bd:customer:o2');
    const { OutboxEvent } = ctx.models;
    const failed = await ctx.built.dispatcher.runOnce();
    // Chỉ sự kiện đầu của aggregate được thử; các sự kiện sau chờ nó (thứ tự theo aggregate).
    expect(failed.failed).toBe(1);
    const rows = await OutboxEvent.findAll({ where: { aggregateId: playerId }, order: [['id', 'ASC']] });
    expect(rows.map((r) => r.status)).toEqual(['pending', 'pending', 'pending']);
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastError).toMatch(/503/);
    expect(new Date(rows[0].nextAttemptAt).getTime()).toBeGreaterThan(Date.now() + 5000);

    accept = true;
    // Chạy như khi đã tới hạn thử lại.
    await ctx.built.dispatcher.runOnce(new Date(Date.now() + 60 * 1000));
    const mine = received.filter((r) => r.event.data.playerId === playerId);
    expect(mine).toHaveLength(3);
    expect(new Set(mine.map((r) => r.event.id)).size).toBe(3);
    const order = mine.map((r) => r.event.id);
    expect(order).toEqual([...order].sort()); // UUIDv7 theo thời gian = thứ tự ghi
    expect(await OutboxEvent.count({ where: { aggregateId: playerId, status: 'delivered' } })).toBe(3);
  });

  test(`lỗi liên tục ${MAX_ATTEMPTS} lần → dead; ops xem được và gửi lại được`, async () => {
    accept = false;
    const playerId = await makeRated('bd:customer:o3');
    const { OutboxEvent } = ctx.models;
    const first = await OutboxEvent.findOne({ where: { aggregateId: playerId }, order: [['id', 'ASC']] });
    await first.update({ attempts: MAX_ATTEMPTS - 1 });
    await ctx.built.dispatcher.runOnce();
    expect((await first.reload()).status).toBe('dead');

    const ops = await ctx.as({ scope: 'ops:admin' });
    const list = await ops.get('/v1/ops/outbox?status=dead');
    expect(list.body.data.items.map((i) => i.id)).toContain(first.id);
    accept = true;
    const replay = await ops.post(`/v1/ops/outbox/${first.id}/replay`).send();
    expect(replay.status).toBe(200);
    await ctx.built.dispatcher.runOnce(new Date(Date.now() + 60 * 1000));
    expect((await first.reload()).status).toBe('delivered');
    // Không có scope ops:admin → 403.
    expect((await staff.get('/v1/ops/outbox')).status).toBe(403);
  });
});
