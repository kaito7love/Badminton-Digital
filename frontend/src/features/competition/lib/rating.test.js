import { describe, test, expect } from 'vitest';
import {
  adjustError, answeredCount, buildAssessmentBody, calcRows, capExplanation, changeText, cleanProfile, clearDraft, criteriaOnPage, firstIncomplete,
  loadDraft, pageComplete, profileError, ratingText, reliabilityText, saveDraft, stepsOf
} from './rating';

const rubric = {
  version: 'v1',
  pages: [{ page: 0, title: 'Thông tin chơi' }, { page: 1, title: 'Kỹ thuật nền tảng' }, { page: 2, title: 'Tấn công' }],
  criteria: [
    { code: 'serve', page: 1, name: 'Giao cầu' },
    { code: 'clear', page: 1, name: 'Phông cầu' },
    { code: 'backhand', page: 1, name: 'Trái tay', gate: true },
    { code: 'smash', page: 2, name: 'Đập cầu' }
  ]
};

describe('các bước của form', () => {
  test('thông tin chơi → trang tiêu chí → xem lại → kết quả', () => {
    expect(stepsOf(rubric).map((s) => s.key)).toEqual(['profile', 'page:1', 'page:2', 'review', 'result']);
  });
  test('tiêu chí theo trang, trang đủ khi chọn hết, tiêu chí đầu tiên còn thiếu', () => {
    expect(criteriaOnPage(rubric, 1).map((c) => c.code)).toEqual(['serve', 'clear', 'backhand']);
    expect(pageComplete(rubric, 1, { serve: 3, clear: 2 })).toBe(false);
    expect(pageComplete(rubric, 1, { serve: 3, clear: 2, backhand: 1 })).toBe(true);
    expect(firstIncomplete(rubric, { serve: 3, clear: 2, backhand: 1 })).toEqual({ page: 2, code: 'smash' });
    expect(firstIncomplete(rubric, { serve: 3, clear: 2, backhand: 1, smash: 5 })).toBeNull();
    expect(answeredCount(rubric, { serve: 3, smash: 'x' })).toBe(1);
  });
});

describe('thông tin chơi → body', () => {
  test('giới tính bắt buộc khi hồ sơ chưa có; năm sinh phải hợp lý', () => {
    expect(profileError({}, { hasGender: false })).toMatch(/giới tính/);
    expect(profileError({}, { hasGender: true })).toBe('');
    expect(profileError({ gender: 'male', birthYear: '1800' })).toMatch(/Năm sinh/);
    expect(profileError({ gender: 'male', birthYear: '1990' })).toBe('');
    expect(profileError({ gender: 'male', birthYear: '' })).toBe('');
  });
  test('cleanProfile bỏ ô trống và ép số', () => {
    expect(cleanProfile({ gender: 'male', birthYear: '1990', dominantHand: '', sessionsPerWeek: '3' })).toEqual({ gender: 'male', birthYear: 1990, sessionsPerWeek: 3 });
  });
  test('buildAssessmentBody: chỉ các tiêu chí của bộ, kèm profile + ghi chú (nếu có)', () => {
    const body = buildAssessmentBody({ rubric, answers: { serve: 3, clear: 2, backhand: 4, smash: 5, ngoai: 9 }, profile: { gender: 'female' }, note: '  chấm ở sân  ' });
    expect(body).toEqual({ rubricVersion: 'v1', answers: { serve: 3, clear: 2, backhand: 4, smash: 5 }, profile: { gender: 'female' }, note: 'chấm ở sân' });
    expect(buildAssessmentBody({ rubric, answers: { serve: 1, clear: 1, backhand: 1, smash: 1 }, profile: {} })).not.toHaveProperty('profile');
  });
});

describe('capExplanation — vì sao điểm bị trần', () => {
  test('tiêu chí then chốt: nói rõ tiêu chí và mức', () => {
    const text = capExplanation({ rating: 3.49, cappedBy: 'gate:backhand' }, { gate: { criterion: 'backhand', level: 2, cap: 3.49 } }, rubric);
    expect(text).toBe('Điểm được giới hạn ở 3.49 vì Trái tay chỉ ở mức 2 (tiêu chí then chốt).');
  });
  test('tự chấm: trần 4.5', () => {
    expect(capExplanation({ rating: 4.5, cappedBy: 'self_max' }, {}, rubric)).toMatch(/tự chấm/);
  });
  test('không bị trần → rỗng', () => {
    expect(capExplanation({ rating: 3, cappedBy: null }, {}, rubric)).toBe('');
    expect(capExplanation(null, {}, rubric)).toBe('');
  });
});

describe('bản nháp', () => {
  test('không có localStorage (node) thì không lỗi và đọc ra null', () => {
    expect(loadDraft('x')).toBeNull();
    expect(() => saveDraft('x', { a: 1 })).not.toThrow();
    expect(() => clearDraft('x')).not.toThrow();
  });
});

describe('chỉnh điểm tay', () => {
  test('điểm trong 1–7 và lý do ≥ 10 ký tự', () => {
    expect(adjustError('', 'đủ dài rồi nhé')).toMatch(/1 – 7/);
    expect(adjustError('7.5', 'đủ dài rồi nhé')).toMatch(/1 – 7/);
    expect(adjustError('4', 'ngắn')).toMatch(/lý do/);
    expect(adjustError('4', '  ngắn   ')).toMatch(/lý do/);
    expect(adjustError('4.25', 'điều chỉnh sau khi xem video')).toBe('');
  });
});

describe('hồ sơ / sổ điểm', () => {
  test('ratingText và độ tin cậy', () => {
    expect(ratingText({ rating: 4.28, level: 'Khá' })).toBe('4.28 · Khá');
    expect(ratingText(null)).toBe('chưa có điểm');
    expect(reliabilityText(0)).toBe('điểm còn mới');
    expect(reliabilityText(45)).toBe('đang ổn định dần');
    expect(reliabilityText(90)).toBe('ổn định');
  });
  test('changeText: khởi tạo, tăng, giảm, không đổi', () => {
    expect(changeText({ reason: 'assessment', before: null, after: 4.5, delta: 0 })).toBe('Chấm trình: khởi tạo 4.50');
    expect(changeText({ reason: 'session', before: 4.52, after: 4.45, delta: -0.074 })).toBe('Buổi giao lưu: 4.52 → 4.45 (−0.07)');
    expect(changeText({ reason: 'tournament', before: 3, after: 3.2, delta: 0.2 })).toBe('Giải đấu: 3.00 → 3.20 (+0.20)');
    expect(changeText({ reason: 'adjustment', before: 3, after: 3, delta: 0 })).toContain('±0');
  });
  test('calcRows: chi tiết từng trận nếu có', () => {
    expect(calcRows({ calc: { matches: [{ matchId: 'a' }] } })).toHaveLength(1);
    expect(calcRows({ calc: null })).toEqual([]);
    expect(calcRows({})).toEqual([]);
  });
});
