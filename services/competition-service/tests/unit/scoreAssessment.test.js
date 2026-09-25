const { scoreAssessment, scoreQuickLevel } = require('../../src/modules/rating/domain/scoreAssessment');
const { getRubric } = require('../../src/modules/rating/domain/rubric');
const { levelFor } = require('../../src/modules/rating/domain/levels');

const rubric = getRubric('v1');
const all = (level) => Object.fromEntries(rubric.criteria.map((c) => [c.code, level]));

describe('rubric v1', () => {
  test('12 tiêu chí, mỗi tiêu chí 5 mô tả, tổng trọng số Đơn = Đôi = 13', () => {
    expect(rubric.criteria).toHaveLength(12);
    for (const c of rubric.criteria) expect(c.anchors).toHaveLength(5);
    const sum = (d) => rubric.criteria.reduce((s, c) => s + c.weights[d], 0);
    expect(sum('singles')).toBe(13);
    expect(sum('doubles')).toBe(13);
    expect(rubric.criteria.filter((c) => c.gate).map((c) => c.code)).toEqual(['backhand', 'defense', 'footwork']);
  });

  test('4 trang, mỗi trang 3 tiêu chí', () => {
    for (const page of [1, 2, 3, 4]) expect(rubric.criteria.filter((c) => c.page === page)).toHaveLength(3);
  });
});

describe('scoreAssessment — ví dụ trong docs/03 mục 2.2', () => {
  test('mức 3 hết → 3.00 TB cả hai', () => {
    const r = scoreAssessment(all(3), rubric);
    expect(r.singles.rating).toBe(3);
    expect(r.doubles.rating).toBe(3);
    expect(r.singles.level.label).toBe('TB');
    expect(r.needsVerification).toBe(false);
  });

  test('ví dụ 02 §4.2: lưới 4, phối hợp 4, trái tay 2, còn lại 3 → Đơn 2.96 TB-, Đôi 3.15 TB', () => {
    const r = scoreAssessment({ ...all(3), backhand: 2, net: 4, rotation: 4 }, rubric);
    expect(r.singles.rating).toBeCloseTo(2.962, 3);
    expect(r.doubles.rating).toBeCloseTo(3.154, 3);
    expect(r.singles.level.label).toBe('TB-');
    expect(r.doubles.level.label).toBe('TB');
    expect(r.singles.cappedBy).toBeNull();
  });

  test('mức 4 hết, trái tay 2 → bị trần then chốt 3.49 (raw 3.77 / 3.85)', () => {
    const r = scoreAssessment({ ...all(4), backhand: 2 }, rubric);
    expect(r.singles.raw).toBeCloseTo(3.769, 3);
    expect(r.doubles.raw).toBeCloseTo(3.846, 3);
    expect(r.singles.rating).toBe(3.49);
    expect(r.doubles.rating).toBe(3.49);
    expect(r.singles.cappedBy).toBe('gate:backhand');
    expect(r.gate).toEqual({ criterion: 'backhand', level: 2, cap: 3.49 });
  });

  test('mức 5 hết → trần tự chấm 4.5 + cờ cần xác nhận', () => {
    const r = scoreAssessment(all(5), rubric);
    expect(r.singles.raw).toBe(5);
    expect(r.singles.rating).toBe(4.5);
    expect(r.singles.cappedBy).toBe('self_max');
    expect(r.needsVerification).toBe(true);
  });

  test('nhân viên chấm: bỏ trần 4.5 nhưng vẫn giữ trần then chốt, không có cờ xác nhận', () => {
    expect(scoreAssessment(all(5), rubric, { source: 'staff' }).singles.rating).toBe(5);
    const gated = scoreAssessment({ ...all(5), footwork: 3 }, rubric, { source: 'staff' });
    expect(gated.singles.rating).toBe(4.49);
    expect(gated.singles.cappedBy).toBe('gate:footwork');
    expect(gated.needsVerification).toBe(false);
  });

  test('kinh nghiệm mức 5 → cờ cần xác nhận dù điểm không vượt 4.5', () => {
    expect(scoreAssessment({ ...all(3), experience: 5 }, rubric).needsVerification).toBe(true);
  });

  test('mức 1 ở tiêu chí then chốt → trần 2.49', () => {
    const r = scoreAssessment({ ...all(4), defense: 1 }, rubric);
    expect(r.doubles.rating).toBe(2.49);
    expect(r.doubles.level.label).toBe('Yếu');
  });

  test('thiếu tiêu chí / mức ngoài 1–5 / tiêu chí lạ → INVALID_ANSWERS liệt kê đủ', () => {
    const answers = { ...all(3), smash: 6, extra: 3 };
    delete answers.net;
    try {
      scoreAssessment(answers, rubric);
      throw new Error('không ném lỗi');
    } catch (err) {
      expect(err.code).toBe('INVALID_ANSWERS');
      expect(err.errors.map((e) => e.field).sort()).toEqual(['answers.extra', 'answers.net', 'answers.smash']);
    }
  });

  test('chấm nhanh: TB → 3.25 cả hai nội dung; nhãn lạ → lỗi', () => {
    const r = scoreQuickLevel('tb');
    expect(r.singles.rating).toBe(3.25);
    expect(r.doubles.rating).toBe(3.25);
    expect(() => scoreQuickLevel('pro')).toThrow(/Nhãn chấm nhanh/);
  });
});

describe('levelFor', () => {
  test.each([
    [1.2, 'Mới chơi'],
    [2.0, 'Yếu'],
    [2.49, 'Yếu'],
    [2.5, 'TB-'],
    [3.49, 'TB'],
    [3.495, 'TB+'], // hiển thị 3.50 → phải là TB+
    [4.0, 'Khá'],
    [4.5, 'Khá giỏi'],
    [5.2, 'Bán chuyên'],
    [6.0, 'Chuyên nghiệp']
  ])('%s → %s', (rating, label) => {
    expect(levelFor(rating).label).toBe(label);
  });
});
