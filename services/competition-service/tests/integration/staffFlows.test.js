const { createTestContext, ANSWERS_EX42, allAnswers, STAFF, MANAGER } = require('./helpers');

// Luồng nhân viên / quản lý (docs/03 mục 2.3, docs/02 mục 2.1–2.2).
let ctx;
let staff;
let manager;
beforeAll(async () => {
  ctx = await createTestContext();
  staff = await ctx.as({ scope: STAFF, sub: 'bd:user:staff1' });
  manager = await ctx.as({ scope: MANAGER, sub: 'bd:user:manager1' });
});
afterAll(() => ctx.close());

const newPlayer = async (ref, name = `Người chơi ${ref}`) => {
  const res = await staff.put(`/v1/players/by-ref/bd:customer:${ref}`).send({ displayName: name });
  return res.body.data;
};
const staffAssess = (who, playerId, answers = ANSWERS_EX42, extra = {}) =>
  who.post(`/v1/players/${playerId}/assessments`).send({ rubricVersion: 'v1', answers, profile: { gender: 'male' }, ...extra });

describe('nhân viên / quản lý', () => {
  test('PUT by-ref: lần đầu 201, lần sau 200 (idempotent), đổi tên có nhật ký', async () => {
    const first = await staff.put('/v1/players/by-ref/bd:customer:s1').send({ displayName: 'Trần Văn A' });
    expect(first.status).toBe(201);
    const again = await staff.put('/v1/players/by-ref/bd:customer:s1').send({ displayName: 'Trần Văn A' });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
    await staff.put('/v1/players/by-ref/bd:customer:s1').send({ displayName: 'Trần Văn Anh' });
    expect(await ctx.models.AuditLog.count({ where: { targetId: first.body.data.id, action: 'player.renamed' } })).toBe(1);
  });

  test('nhân viên chấm người chưa có trận → áp điểm, đã xác thực, không trần 4.5', async () => {
    const p = await newPlayer('s2');
    const res = await staffAssess(staff, p.id, allAnswers(5));
    expect(res.status).toBe(201);
    expect(res.body.data.assessment).toMatchObject({ source: 'staff', status: 'applied' });
    expect(res.body.data.player.ratings.singles).toMatchObject({ rating: 5, level: 'Bán chuyên', verified: true });
    expect(res.body.data.player.flags).toEqual([]);
  });

  test('người đã có trận: nhân viên thường → 403; quản lý → chỉ lưu hồ sơ (recorded), điểm không đổi', async () => {
    const p = await newPlayer('s3');
    await staffAssess(staff, p.id);
    await ctx.models.PlayerRating.update({ ratedMatches: 12 }, { where: { playerId: p.id } });
    const denied = await staffAssess(staff, p.id, allAnswers(4));
    expect(denied.status).toBe(403);
    const recorded = await staffAssess(manager, p.id, allAnswers(4));
    expect(recorded.status).toBe(201);
    expect(recorded.body.data.assessment.status).toBe('recorded');
    expect(recorded.body.data.player.ratings.singles.rating).toBe(2.96);
  });

  test('chấm nhanh: chỉ khi chưa có điểm; TB → 3.25 cả hai, cờ "quick"', async () => {
    const p = await newPlayer('s4');
    const quick = await staff.post(`/v1/players/${p.id}/assessments/quick`).send({ level: 'tb' });
    expect(quick.status).toBe(201);
    expect(quick.body.data.player.ratings.doubles.rating).toBe(3.25);
    expect(quick.body.data.player.flags).toEqual(expect.arrayContaining(['quick', 'unverified']));
    const again = await staff.post(`/v1/players/${p.id}/assessments/quick`).send({ level: 'kha' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_RATED');
  });

  test('bài chấm AI: chờ duyệt → quản lý duyệt kèm điền nốt → áp điểm; hàng chờ trống lại', async () => {
    const p = await newPlayer('s5');
    const ai = await ctx.as({ scope: 'assessment:submit-ai', sub: 'svc:video-analysis' });
    const answers = { ...Object.fromEntries(Object.keys(ANSWERS_EX42).map((k) => [k, null])), footwork: 4, stamina: 3, smash: 3 };
    const sent = await ai.post(`/v1/players/${p.id}/assessments/ai`).send({
      rubricVersion: 'v1', answers, confidence: { footwork: 0.86, stamina: 0.74, smash: 0.55 }, evidenceRef: 'vjob_1', modelVersion: 'va-0.3.1'
    });
    expect(sent.status).toBe(201);
    expect(sent.body.data.assessment.status).toBe('pending_review');

    const queue = await manager.get('/v1/assessments');
    expect(queue.body.data.items.map((a) => a.id)).toContain(sent.body.data.assessment.id);

    const incomplete = await manager.post(`/v1/assessments/${sent.body.data.assessment.id}/review`).send({ decision: 'approve' });
    expect(incomplete.status).toBe(422);
    expect(incomplete.body.code).toBe('INVALID_ANSWERS');

    const rest = { serve: 3, clear: 3, backhand: 3, drop: 3, net: 3, defense: 3, tactics: 3, rotation: 3, experience: 3 };
    const approved = await manager.post(`/v1/assessments/${sent.body.data.assessment.id}/review`).send({ decision: 'approve', answers: rest });
    expect(approved.status).toBe(200);
    expect(approved.body.data.assessment.status).toBe('applied');
    expect(approved.body.data.player.ratings.singles.verified).toBe(true);
    const after = await manager.get('/v1/assessments');
    expect(after.body.data.items.map((a) => a.id)).not.toContain(sent.body.data.assessment.id);
  });

  test('bài tự chấm có cờ cần xác nhận → duyệt không sửa → xác nhận trình, giữ điểm', async () => {
    const customer = await ctx.as({ scope: 'rating:self', sub: 'bd:user:s6', player: 'bd:customer:s6', name: 'Khách S6' });
    const self = await customer.post('/v1/me/assessments').send({ rubricVersion: 'v1', profile: { gender: 'female' }, answers: { ...allAnswers(3), experience: 5 } });
    expect(self.body.data.player.flags).toContain('needs_verification');
    const list = await manager.get('/v1/assessments?flag=needs_verification');
    expect(list.body.data.items.some((a) => a.id === self.body.data.assessment.id)).toBe(true);
    const ok = await manager.post(`/v1/assessments/${self.body.data.assessment.id}/review`).send({ decision: 'approve' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.player.ratings.doubles).toMatchObject({ verified: true, rating: self.body.data.player.ratings.doubles.rating });
    expect(ok.body.data.player.flags).not.toContain('needs_verification');
    // Đã được xác nhận → khách không tự chấm đè được nữa.
    const locked = await customer.post('/v1/me/assessments').send({ rubricVersion: 'v1', answers: allAnswers(2) });
    expect(locked.status).toBe(409);
  });

  test('chỉnh điểm tay: cần rating:adjust, lý do ≥ 10 ký tự; ghi sổ + nhật ký + sự kiện', async () => {
    const p = await newPlayer('s7');
    await staffAssess(staff, p.id);
    const noScope = await staff.post(`/v1/players/${p.id}/rating-adjustments`).send({ discipline: 'doubles', newRating: 3.6, reason: 'Đánh giải thực tế mạnh hơn' });
    expect(noScope.status).toBe(403);
    const shortReason = await manager.post(`/v1/players/${p.id}/rating-adjustments`).send({ discipline: 'doubles', newRating: 3.6, reason: 'ngắn' });
    expect(shortReason.status).toBe(400);
    const res = await manager.post(`/v1/players/${p.id}/rating-adjustments`).send({ discipline: 'doubles', newRating: 3.6, reason: 'Đánh giải thực tế mạnh hơn' });
    expect(res.status).toBe(201);
    expect(res.body.data.change).toEqual({ discipline: 'doubles', before: 3.154, after: 3.6 });
    const history = await manager.get(`/v1/players/${p.id}/rating-history?discipline=doubles`);
    expect(history.body.data.items.map((h) => [h.reason, h.after])).toEqual([['assessment', 3.15], ['adjustment', 3.6]]);
    expect(history.body.data.items[1]).toMatchObject({ delta: 0.446, note: 'Đánh giải thực tế mạnh hơn' });
    expect(await ctx.models.AuditLog.count({ where: { targetId: p.id, action: 'rating.adjusted' } })).toBe(1);
  });

  test('danh sách: tìm theo tên, lọc khoảng điểm và cờ; tra hàng loạt theo mã ngoài', async () => {
    const a = await newPlayer('s8', 'Lê Tìm Kiếm');
    await staffAssess(staff, a.id, allAnswers(4));
    const byName = await staff.get('/v1/players?search=T%C3%ACm%20Ki%E1%BA%BFm');
    expect(byName.body.data.items.map((p) => p.id)).toEqual([a.id]);
    const byRange = await staff.get('/v1/players?discipline=singles&minRating=3.9&maxRating=4.1');
    expect(byRange.body.data.items.map((p) => p.id)).toContain(a.id);
    const quickOnly = await staff.get('/v1/players?flag=quick');
    expect(quickOnly.body.data.items.every((p) => p.flags.includes('quick'))).toBe(true);
    const lookup = await staff.post('/v1/players/lookup', { key: false }).send({ externalRefs: ['bd:customer:s8', 'bd:customer:khong-co'] });
    expect(lookup.body.data.items.map((i) => i.externalRef)).toEqual(['bd:customer:s8']);
    expect(lookup.body.data.missing).toEqual(['bd:customer:khong-co']);
  });

  test('xác nhận trình một nội dung; người chưa có điểm → 422 NEEDS_ASSESSMENT', async () => {
    const p = await newPlayer('s9');
    const none = await manager.post(`/v1/players/${p.id}/verify`).send({ discipline: 'singles' });
    expect(none.status).toBe(422);
    await staff.post(`/v1/players/${p.id}/assessments/quick`).send({ level: 'tb_plus' });
    const ok = await manager.post(`/v1/players/${p.id}/verify`).send({ discipline: 'singles' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.ratings.singles.verified).toBe(true);
    expect(ok.body.data.ratings.doubles.verified).toBe(false);
  });
});
