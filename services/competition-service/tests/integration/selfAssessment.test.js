const { createTestContext, ANSWERS_EX42, allAnswers } = require('./helpers');

// Luồng tự chấm của khách (docs/03 mục 2) — kiểm cả dữ liệu trong DB thật.
let ctx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

const customer = (n, name = `Khách ${n}`) =>
  ctx.as({ scope: 'rating:self ranking:read', sub: `bd:user:${n}`, player: `bd:customer:${n}`, name });

const submit = async (who, body, key) => (await who).post('/v1/me/assessments', { key }).send(body);
const body = (answers = ANSWERS_EX42, profile = { gender: 'female' }) => ({ rubricVersion: 'v1', profile, answers });

describe('tự chấm', () => {
  test('lần đầu gọi /v1/me → tự tạo hồ sơ từ claim player_name, chưa có điểm', async () => {
    const res = await (await customer(1, 'Nguyễn Thị Một')).get('/v1/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      externalRef: 'bd:customer:1',
      displayName: 'Nguyễn Thị Một',
      publicName: 'Một N.',
      ratings: { singles: null, doubles: null },
      visibility: 'members'
    });
  });

  test('nộp form → Đơn 2.96 TB-, Đôi 3.15 TB; DB có bài chấm, 2 dòng điểm, 2 dòng sổ điểm, 3 sự kiện đúng hợp đồng', async () => {
    const res = await submit(customer(2), body());
    expect(res.status).toBe(201);
    expect(res.body.data.result.singles).toMatchObject({ rating: 2.962, level: 'TB-' });
    expect(res.body.data.result.doubles).toMatchObject({ rating: 3.154, level: 'TB' });
    const player = res.body.data.player;
    expect(player.ratings.singles).toMatchObject({ rating: 2.96, level: 'TB-', ratedMatches: 0, reliability: 0, provisional: true, verified: false });
    expect(player.ratings.doubles.rating).toBe(3.15);
    expect(player.gender).toBe('female');
    expect(player.flags).toContain('unverified');

    const { Assessment, PlayerRating, RatingChange, OutboxEvent } = ctx.models;
    expect(await Assessment.count({ where: { playerId: player.id } })).toBe(1);
    const ratings = await PlayerRating.findAll({ where: { playerId: player.id }, order: [['discipline', 'ASC']] });
    expect(ratings.map((r) => [r.discipline, Number(r.rating)]).sort()).toEqual([['doubles', 3.154], ['singles', 2.962]]);
    expect(await RatingChange.count({ where: { playerId: player.id, reason: 'assessment' } })).toBe(2);
    const events = await OutboxEvent.findAll({ where: { aggregateId: player.id } });
    expect(events.map((e) => e.type).sort()).toEqual([
      'competition.assessment.submitted',
      'competition.player.rating_changed',
      'competition.player.rating_changed'
    ]);
    for (const e of events) expect(ctx.eventValidator.check(e.payload)).toEqual([]);
    expect(events.every((e) => e.status === 'no_target')).toBe(true);
  });

  test('nộp lại khi chưa có trận → bài cũ superseded, điểm mới, sổ điểm có delta', async () => {
    const who = customer(3);
    await submit(who, body());
    const second = await submit(who, body(allAnswers(4)));
    expect(second.status).toBe(201);
    expect(second.body.data.player.ratings.singles.rating).toBe(4);
    const { Assessment, RatingChange } = ctx.models;
    const playerId = second.body.data.player.id;
    const statuses = (await Assessment.findAll({ where: { playerId }, order: [['createdAt', 'ASC']] })).map((a) => a.status);
    expect(statuses).toEqual(['superseded', 'applied']);
    const last = await RatingChange.findOne({ where: { playerId, discipline: 'singles' }, order: [['createdAt', 'DESC'], ['id', 'DESC']] });
    expect(Number(last.ratingBefore)).toBe(2.962);
    expect(Number(last.delta)).toBe(1.038);
  });

  test('Idempotency-Key: gửi lại cùng key + cùng body → đúng response cũ, không tạo thêm dữ liệu', async () => {
    const who = customer(4);
    const first = await submit(who, body(), 'same-key-000004');
    const replay = await submit(who, body(), 'same-key-000004');
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(await ctx.models.Assessment.count({ where: { playerId: first.body.data.player.id } })).toBe(1);

    const reused = await submit(who, body(allAnswers(2)), 'same-key-000004');
    expect(reused.status).toBe(422);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const missing = await (await who).post('/v1/me/assessments', { key: false }).send(body());
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  test('thiếu giới tính → 422 GENDER_REQUIRED; thiếu tiêu chí → 422 INVALID_ANSWERS; mức 6 → 400', async () => {
    const who = customer(5);
    const noGender = await submit(who, body(ANSWERS_EX42, {}));
    expect(noGender.status).toBe(422);
    expect(noGender.body.code).toBe('GENDER_REQUIRED');

    const partial = { ...ANSWERS_EX42 };
    delete partial.net;
    const missing = await submit(who, body(partial));
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('INVALID_ANSWERS');
    expect(missing.body.errors).toEqual([{ field: 'answers.net', message: expect.stringMatching(/Kỹ thuật lưới/) }]);

    const outOfRange = await submit(who, body({ ...ANSWERS_EX42, smash: 6 }));
    expect(outOfRange.status).toBe(400);
    expect(outOfRange.body.code).toBe('VALIDATION_FAILED');

    const outdated = await (await who).post('/v1/me/assessments').send({ ...body(), rubricVersion: 'v0' });
    expect(outdated.status).toBe(422);
    expect(outdated.body.code).toBe('RUBRIC_OUTDATED');
  });

  test('đã có trận tính điểm → khoá tự chấm (409) và khoá tự đổi giới tính (409 GENDER_LOCKED)', async () => {
    const who = customer(6);
    const first = await submit(who, body());
    await ctx.models.PlayerRating.update({ ratedMatches: 3 }, { where: { playerId: first.body.data.player.id, discipline: 'doubles' } });
    const again = await submit(who, body());
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SELF_ASSESSMENT_LOCKED');
    const genderChange = await (await who).patch('/v1/me').send({ gender: 'male' });
    expect(genderChange.status).toBe(409);
    expect(genderChange.body.code).toBe('GENDER_LOCKED');
    // Sửa trường khác vẫn được.
    const nick = await (await who).patch('/v1/me').send({ nickname: 'Sáu Smash', visibility: 'public' });
    expect(nick.status).toBe(200);
    expect(nick.body.data).toMatchObject({ nickname: 'Sáu Smash', publicName: 'Sáu Smash', visibility: 'public' });
  });

  test('mức 5 hết → trần 4.5, cờ cần xác nhận; tên thi đấu trùng → 422 NICKNAME_TAKEN', async () => {
    const res = await submit(customer(7), body(allAnswers(5), { gender: 'male', nickname: 'Top Seed' }));
    expect(res.status).toBe(201);
    expect(res.body.data.result.singles).toMatchObject({ raw: 5, rating: 4.5, cappedBy: 'self_max' });
    expect(res.body.data.player.flags).toEqual(expect.arrayContaining(['unverified', 'needs_verification']));
    const dup = await (await customer(8)).patch('/v1/me').send({ nickname: 'Top Seed' });
    expect(dup.status).toBe(422);
    expect(dup.body.code).toBe('NICKNAME_TAKEN');
  });

  test('xem trước (preview) không lưu gì', async () => {
    const who = await customer(9);
    const res = await who.post('/v1/assessments/preview', { key: false }).send({ rubricVersion: 'v1', answers: { ...allAnswers(4), backhand: 2 } });
    expect(res.status).toBe(200);
    expect(res.body.data.doubles).toMatchObject({ raw: 3.846, rating: 3.49, cappedBy: 'gate:backhand' });
    const me = await who.get('/v1/me');
    expect(me.body.data.ratings).toEqual({ singles: null, doubles: null });
  });

  test('hai request tự chấm song song (khác key) → khoá dòng, đúng một bài applied', async () => {
    const who = customer(10);
    await (await who).get('/v1/me');
    const results = await Promise.all([submit(who, body(allAnswers(3))), submit(who, body(allAnswers(4)))]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const playerId = results[0].body.data.player.id;
    const { Assessment, PlayerRating, RatingChange } = ctx.models;
    expect(await Assessment.count({ where: { playerId, status: 'applied' } })).toBe(1);
    expect(await PlayerRating.count({ where: { playerId } })).toBe(2);
    expect(await RatingChange.count({ where: { playerId } })).toBe(4);
  });
});
