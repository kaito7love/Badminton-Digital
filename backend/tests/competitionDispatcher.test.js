const { createDispatcher, backoffSeconds, toSqlUtc } = require('../src/integrations/competition/dispatcher');
const { verify } = require('../src/integrations/competition/signature');
const { enabledConfig, EVENT_SECRET } = require('./competitionTestKit');

const config = enabledConfig();
const silent = { warn: jest.fn(), error: jest.fn() };
const NOW = new Date('2026-10-05T03:00:00.000Z');

const makeRow = (over = {}) => {
  const row = {
    id: 1,
    eventId: 'ev-1',
    type: 'bd.customer.deleted',
    status: 'pending',
    attempts: 0,
    payload: { id: 'ev-1', type: 'bd.customer.deleted', data: { externalRef: 'bd:customer:1' } },
    ...over
  };
  row.update = jest.fn(async (values) => Object.assign(row, values));
  return row;
};

// sequelize / model giả: lô đầu có dòng, lô sau rỗng (vòng lặp của runOnce dừng).
const makeDeps = (rows) => {
  const query = jest.fn()
    .mockResolvedValueOnce(rows.map((r) => ({ id: r.id })))
    .mockResolvedValue([]);
  const sequelize = { transaction: async (fn) => fn({ id: 'tx' }), query };
  const model = { update: jest.fn(), findAll: jest.fn(async () => rows), destroy: jest.fn(async () => 3) };
  return { sequelize, model, query };
};
const okResponse = { status: 200 };

describe('dispatcher outbox → competition-service', () => {
  test('gửi POST /v1/events kèm đủ header ký HMAC bằng secret chiều đi; thành công → sent', async () => {
    const row = makeRow();
    const { sequelize, model } = makeDeps([row]);
    const fetchImpl = jest.fn(async () => okResponse);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl, logger: silent, now: () => NOW });

    expect(await dispatcher.runOnce()).toEqual({ sent: 1, retry: 0, dead: 0 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:5100/v1/events');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(row.payload));
    expect(init.headers).toMatchObject({ 'X-Event-Source': 'badminton-digital-core', 'X-Event-Id': 'ev-1', 'X-Event-Type': 'bd.customer.deleted', 'Content-Type': 'application/json' });
    expect(verify({ secret: EVENT_SECRET, signature: init.headers['X-Signature'], timestamp: init.headers['X-Timestamp'], body: init.body })).toBe(true);
    expect(row).toMatchObject({ status: 'sent', attempts: 1, sentAt: NOW, lastError: null });
  });

  test('"thuê" dòng bằng cách đẩy next_attempt_at ra sau trong transaction ngắn (hai bản backend không gửi trùng)', async () => {
    const row = makeRow();
    const { sequelize, model, query } = makeDeps([row]);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl: async () => okResponse, logger: silent, now: () => NOW });
    await dispatcher.runOnce();
    expect(query.mock.calls[0][0]).toMatch(/FOR UPDATE SKIP LOCKED/);
    // dòng sau của cùng khách không được lấy khi dòng trước còn pending → thứ tự được giữ
    expect(query.mock.calls[0][0]).toMatch(/NOT EXISTS[\s\S]*p\.subject = o\.subject[\s\S]*p\.id < o\.id/);
    const [values, options] = model.update.mock.calls[0];
    expect(values.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
    expect(options.where).toEqual({ id: [1] });
  });

  test('mốc thời gian trong câu SQL thô là chuỗi UTC, không phụ thuộc múi giờ của máy (lỗi gặp khi chạy thật: dòng lùi dần bị gửi lại ngay)', async () => {
    const row = makeRow();
    const { sequelize, model, query } = makeDeps([row]);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl: async () => okResponse, logger: silent, now: () => NOW });
    await dispatcher.runOnce();
    expect(query.mock.calls[0][1].replacements.at).toBe('2026-10-05 03:00:00');
    expect(toSqlUtc(new Date('2026-12-31T23:59:59.999Z'))).toBe('2026-12-31 23:59:59');
  });

  test('service trả 5xx → vẫn pending, lùi dần, ghi lỗi', async () => {
    const row = makeRow({ attempts: 2 });
    const { sequelize, model } = makeDeps([row]);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl: async () => ({ status: 503 }), logger: silent, now: () => NOW });
    expect(await dispatcher.runOnce()).toEqual({ sent: 0, retry: 1, dead: 0 });
    expect(row).toMatchObject({ status: 'pending', attempts: 3, lastError: 'HTTP 503' });
    expect(row.nextAttemptAt.getTime()).toBe(NOW.getTime() + backoffSeconds(3) * 1000);
  });

  test('lỗi mạng cũng chỉ thử lại', async () => {
    const row = makeRow();
    const { sequelize, model } = makeDeps([row]);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl: async () => { throw new TypeError('fetch failed'); }, logger: silent, now: () => NOW });
    expect(await dispatcher.runOnce()).toEqual({ sent: 0, retry: 1, dead: 0 });
    expect(row.status).toBe('pending');
  });

  test.each([400, 422])('service báo sự kiện sai (%i) → dead ngay, không thử lại vô ích', async (status) => {
    const row = makeRow();
    const { sequelize, model } = makeDeps([row]);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl: async () => ({ status }), logger: silent, now: () => NOW });
    expect(await dispatcher.runOnce()).toEqual({ sent: 0, retry: 0, dead: 1 });
    expect(row.status).toBe('dead');
    expect(silent.error).toHaveBeenCalled();
  });

  test('401 (sai secret / lệch giờ) là lỗi cấu hình → vẫn thử lại, không đánh dead (sửa cấu hình là tự chạy tiếp)', async () => {
    const row = makeRow();
    const { sequelize, model } = makeDeps([row]);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl: async () => ({ status: 401 }), logger: silent, now: () => NOW });
    expect(await dispatcher.runOnce()).toEqual({ sent: 0, retry: 1, dead: 0 });
  });

  test('quá số lần thử tối đa → dead', async () => {
    const row = makeRow({ attempts: 11 });
    const { sequelize, model } = makeDeps([row]);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl: async () => ({ status: 500 }), logger: silent, now: () => NOW, maxAttempts: 12 });
    expect(await dispatcher.runOnce()).toEqual({ sent: 0, retry: 0, dead: 1 });
    expect(row).toMatchObject({ status: 'dead', attempts: 12 });
  });

  test('một dòng lỗi không làm các dòng khác trong lô bị bỏ', async () => {
    const rows = [makeRow({ id: 1, eventId: 'a' }), makeRow({ id: 2, eventId: 'b' })];
    const { sequelize, model } = makeDeps(rows);
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce(okResponse);
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl, logger: silent, now: () => NOW });
    expect(await dispatcher.runOnce()).toEqual({ sent: 1, retry: 1, dead: 0 });
    expect(rows.map((r) => r.status)).toEqual(['pending', 'sent']);
  });

  test('không có dòng đến hạn → không gọi service', async () => {
    const { sequelize, model } = makeDeps([]);
    const fetchImpl = jest.fn();
    const dispatcher = createDispatcher({ config, sequelize, model, fetchImpl, logger: silent, now: () => NOW });
    expect(await dispatcher.runOnce()).toEqual({ sent: 0, retry: 0, dead: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('lùi dần 5 giây → tối đa 1 giờ', () => {
    expect([1, 2, 3, 4, 8, 12, 20].map(backoffSeconds)).toEqual([5, 10, 20, 40, 640, 3600, 3600]);
  });

  test('dọn dòng đã gửi cũ hơn 30 ngày', async () => {
    const { sequelize, model } = makeDeps([]);
    const dispatcher = createDispatcher({ config, sequelize, model, logger: silent, now: () => NOW });
    expect(await dispatcher.purge()).toBe(3);
    const where = model.destroy.mock.calls[0][0].where;
    expect(where.status).toBe('sent');
    const cutoff = Object.values(where.sentAt)[0] ?? Object.getOwnPropertySymbols(where.sentAt).map((s) => where.sentAt[s])[0];
    expect(new Date(cutoff).getTime()).toBe(NOW.getTime() - 30 * 24 * 3600 * 1000);
  });
});
