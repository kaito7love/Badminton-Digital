const crypto = require('crypto');
const { createTestContext, allAnswers, STAFF } = require('./helpers');

// Gộp / ẩn danh hồ sơ (docs/05 mục 4) + sự kiện nhận từ app chính (docs/02 mục 3.3).
let ctx;
let staff;
beforeAll(async () => {
  ctx = await createTestContext();
  staff = await ctx.as({ scope: STAFF, sub: 'bd:user:staff' });
});
afterAll(() => ctx.close());

const player = async (ref, name, answers) => {
  const res = await staff.put(`/v1/players/by-ref/${ref}`).send({ displayName: name });
  if (answers) await staff.post(`/v1/players/${res.body.data.id}/assessments`).send({ rubricVersion: 'v1', answers, profile: { gender: 'male' } });
  return res.body.data.id;
};
const event = (type, data, id = crypto.randomUUID()) => ({ specversion: '1.0', id, type, source: 'badminton-digital-core', time: new Date().toISOString(), data });

describe('gộp hồ sơ qua API', () => {
  test('cả hai có điểm → giữ bên nhiều trận hơn, không cộng số trận; sổ điểm + bài chấm chuyển sang đích', async () => {
    const target = await player('bd:customer:m-target', 'Tài Khoản', allAnswers(3));
    const source = await player('bd:customer:m-walkin', 'Vãng Lai', allAnswers(4));
    const { PlayerRating, Assessment, RatingChange, Player } = ctx.models;
    await PlayerRating.update({ ratedMatches: 7 }, { where: { playerId: source, discipline: 'doubles' } });
    await PlayerRating.update({ ratedMatches: 2 }, { where: { playerId: target, discipline: 'doubles' } });

    const res = await staff.post(`/v1/players/${target}/merge`).send({ sourcePlayerId: source });
    expect(res.status).toBe(200);
    expect(res.body.data.merged.ratings).toEqual({ singles: 'kept_target', doubles: 'kept_source' });
    const doubles = await PlayerRating.findOne({ where: { playerId: target, discipline: 'doubles' } });
    expect([Number(doubles.rating), doubles.ratedMatches]).toEqual([4, 7]);
    expect(await PlayerRating.count({ where: { playerId: source } })).toBe(0);
    expect(await Assessment.count({ where: { playerId: target } })).toBe(2);
    expect(await RatingChange.count({ where: { playerId: target, reason: 'merge' } })).toBe(2);
    expect((await Player.findByPk(source)).status).toBe('merged');
    // Điểm Đôi của đích đổi (3 → 4) → có sự kiện rating_changed reason merge.
    const mergeEvents = await ctx.models.OutboxEvent.findAll({ where: { aggregateId: target, type: 'competition.player.rating_changed' } });
    const merged = mergeEvents.filter((e) => e.payload.data.reason === 'merge');
    expect(merged.map((e) => [e.payload.data.discipline, e.payload.data.before, e.payload.data.after])).toEqual([['doubles', 3, 4]]);

    // Tra theo mã cũ của nguồn → trả hồ sơ đích.
    const byOldRef = await staff.get('/v1/players/by-ref/bd:customer:m-walkin');
    expect(byOldRef.body.data.id).toBe(target);
  });

  test('gộp vào chính nó → 422; gộp hồ sơ đã gộp → 409', async () => {
    const a = await player('bd:customer:m-a', 'A');
    const b = await player('bd:customer:m-b', 'B');
    expect((await staff.post(`/v1/players/${a}/merge`).send({ sourcePlayerId: a })).status).toBe(422);
    await staff.post(`/v1/players/${a}/merge`).send({ sourcePlayerId: b });
    const again = await staff.post(`/v1/players/${a}/merge`).send({ sourcePlayerId: b });
    expect(again.status).toBe(409);
  });

  test('ẩn danh: xoá thông tin cá nhân, giữ điểm và sổ điểm', async () => {
    const id = await player('bd:customer:m-anon', 'Sẽ Bị Xoá', allAnswers(3));
    const res = await staff.post(`/v1/players/${id}/anonymize`).send();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      displayName: 'Người chơi đã xoá', externalRef: `anon:${id}`, gender: null, visibility: 'hidden', status: 'anonymized'
    });
    expect(res.body.data.ratings.doubles.rating).toBe(3);
    expect(await ctx.models.RatingChange.count({ where: { playerId: id } })).toBe(2);
  });
});

describe('sự kiện từ app chính (POST /v1/events)', () => {
  test('chữ ký sai / thiếu / quá hạn → 401', async () => {
    const e = event('bd.customer.updated', { externalRef: 'x', fullName: 'X' });
    expect((await ctx.sendEvent(e, { secret: 'wrong-secret-wrong-secret-wrong-secret' })).status).toBe(401);
    expect((await ctx.sendEvent(e, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    expect((await ctx.sendEvent(e, { source: 'unknown-source' })).status).toBe(401);
  });

  test('bd.customer.updated: đổi tên; gửi trùng → duplicate; bản cũ đến sau → bỏ qua', async () => {
    const id = await player('bd:customer:e-upd', 'Tên Cũ');
    const e = event('bd.customer.updated', { externalRef: 'bd:customer:e-upd', fullName: 'Tên Mới', version: 5 });
    const first = await ctx.sendEvent(e);
    expect(first.body.data).toMatchObject({ status: 'processed', result: 'Đã đổi tên hiển thị' });
    expect((await ctx.sendEvent(e)).body.data.status).toBe('duplicate');
    const stale = await ctx.sendEvent(event('bd.customer.updated', { externalRef: 'bd:customer:e-upd', fullName: 'Tên Rất Cũ', version: 3 }));
    expect(stale.body.data.result).toMatch(/Bỏ qua bản cũ/);
    const now = await staff.get(`/v1/players/${id}`);
    expect(now.body.data.displayName).toBe('Tên Mới');
    expect(await ctx.models.InboxEvent.count({ where: { eventId: e.id } })).toBe(1);
  });

  test('bd.customer.merged: chỉ nguồn có hồ sơ → hồ sơ đổi sang mã đích', async () => {
    const id = await player('bd:customer:e-src-only', 'Vãng Lai');
    const res = await ctx.sendEvent(event('bd.customer.merged', { sourceRef: 'bd:customer:e-src-only', targetRef: 'bd:customer:e-account' }));
    expect(res.body.data.status).toBe('processed');
    const byNew = await staff.get('/v1/players/by-ref/bd:customer:e-account');
    expect(byNew.body.data.id).toBe(id);
  });

  test('bd.customer.merged: cả hai có hồ sơ → gộp; bd.customer.deleted → ẩn danh', async () => {
    const target = await player('bd:customer:e-t', 'Đích', allAnswers(3));
    const source = await player('bd:customer:e-s', 'Nguồn', allAnswers(4));
    await ctx.sendEvent(event('bd.customer.merged', { sourceRef: 'bd:customer:e-s', targetRef: 'bd:customer:e-t' }));
    expect((await ctx.models.Player.findByPk(source)).status).toBe('merged');
    const del = await ctx.sendEvent(event('bd.customer.deleted', { externalRef: 'bd:customer:e-t' }));
    expect(del.body.data.result).toBe('Đã ẩn danh hoá');
    expect((await ctx.models.Player.findByPk(target)).status).toBe('anonymized');
  });

  test('loại sự kiện chưa hỗ trợ → ghi nhận "ignored", không lỗi', async () => {
    const res = await ctx.sendEvent(event('bd.booking.created', { id: 1 }));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ignored');
  });
});
