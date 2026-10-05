import { describe, test, expect } from 'vitest';
import { courtText, describeError, RELOAD_CODES, toCompetitionError, CompetitionError } from './errors';
import {
  addMinutes, courtName, fmtDelta, fmtDuration, fmtNumber, fold, gamesText, matchesQuery, orgName, rulesText, teamText
} from './format';
import { permissionsFor } from './permissions';
import { presetOf, disciplineText, isPairsTournament, SCORING_PRESETS, MATCH_MINUTES } from './labels';

const axiosError = (status, data) => ({ response: { status, data } });

describe('describeError — dịch lỗi của cổng / service', () => {
  test('mất mạng (không có response) → thông báo mạng, đánh dấu unavailable', () => {
    expect(describeError(new Error('Network Error'))).toMatchObject({ code: 'NETWORK', unavailable: true, status: 0 });
  });

  test('request bị huỷ không phải lỗi để hiện', () => {
    expect(describeError({ code: 'ERR_CANCELED' })).toMatchObject({ canceled: true, message: '' });
  });

  test.each([
    ['COMPETITION_DISABLED', 503, /chưa được bật/],
    ['COMPETITION_UNAVAILABLE', 503, /tạm ngưng/],
    ['COMPETITION_AUTH_FAILED', 502, /lỗi cấu hình/],
    ['FORBIDDEN_SCOPE', 403, /không có quyền/]
  ])('%s → câu dễ hiểu', (code, status, pattern) => {
    expect(describeError(axiosError(status, { code, message: 'x' })).message).toMatch(pattern);
  });

  test('cổng / service tắt → unavailable (giao diện hiện thông báo thay vì trang lỗi)', () => {
    expect(describeError(axiosError(503, { code: 'COMPETITION_UNAVAILABLE' })).unavailable).toBe(true);
    expect(describeError(axiosError(502, { code: 'COMPETITION_AUTH_FAILED' })).unavailable).toBe(true);
    expect(describeError(axiosError(409, { code: 'INVALID_STATE' })).unavailable).toBe(false);
  });

  test('lỗi "máy khác vừa đổi" nói rõ và đòi tải lại; 409 thường không đòi', () => {
    const e = describeError(axiosError(409, { code: 'INVALID_STATE', message: 'Trận không ở trạng thái scheduled' }));
    expect(e.message).toMatch(/máy khác/);
    expect(e.reload).toBe(true);
    expect(describeError(axiosError(409, { code: 'ALREADY_REGISTERED', message: 'Đã đăng ký rồi' })).reload).toBe(false);
    for (const code of ['VERSION_CONFLICT', 'LIVE_CONFLICT', 'FILL_STALE']) expect(RELOAD_CODES.has(code)).toBe(true);
  });

  test('lỗi nghiệp vụ có thông báo tiếng Việt của service thì giữ nguyên, đổi mã sân sang tên sân', () => {
    const e = describeError(axiosError(422, { code: 'COURT_NOT_IN_CONTEXT', message: 'bd:court:7 không thuộc giải' }));
    expect(e.message).toBe('Sân 7 không thuộc giải');
  });

  test('validate 400 → gom lỗi theo ô', () => {
    const e = describeError(axiosError(400, { code: 'VALIDATION_FAILED', message: 'Sai hợp đồng', errors: [{ field: 'name', message: 'bắt buộc' }, { field: 'startsOn', message: 'sai định dạng' }] }));
    expect(e.fields).toEqual([{ field: 'name', message: 'bắt buộc' }, { field: 'startsOn', message: 'sai định dạng' }]);
    expect(e.message).toBe('Dữ liệu chưa hợp lệ: name — bắt buộc; startsOn — sai định dạng');
  });

  test('5xx không rõ mã → câu chung, không lộ nội dung kỹ thuật', () => {
    expect(describeError(axiosError(500, { message: 'SequelizeDatabaseError: ...' })).message).toMatch(/gặp lỗi/);
    expect(describeError(axiosError(504, {})).message).toMatch(/tạm ngưng/);
  });

  test('toCompetitionError bọc một lần và giữ nguyên nếu đã bọc', () => {
    const wrapped = toCompetitionError(axiosError(404, { code: 'NOT_FOUND' }));
    expect(wrapped).toBeInstanceOf(CompetitionError);
    expect(wrapped).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(toCompetitionError(wrapped)).toBe(wrapped);
  });

  test('courtText: nhận cả "sân bd:court:5" lẫn "bd:court:5"', () => {
    expect(courtText('Sân bd:court:5 đang bận; chuyển bd:court:12')).toBe('Sân 5 đang bận; chuyển Sân 12');
    expect(courtText(null)).toBe('');
  });
});

describe('định dạng', () => {
  test('mã sân / chi nhánh → tên', () => {
    expect(courtName('bd:court:3')).toBe('Sân 3');
    expect(orgName('bd:branch:2')).toBe('Chi nhánh 2');
    expect(orgName('*')).toBe('Mọi chi nhánh');
  });

  test('fold bỏ dấu, kể cả đ', () => {
    expect(fold('Nguyễn Đình Phúc')).toBe('nguyen dinh phuc');
  });

  test('matchesQuery: mọi từ gõ vào phải có (không dấu, không phân biệt hoa thường), rỗng thì khớp hết', () => {
    expect(matchesQuery('nguyen hoang', 'Nguyễn Văn Hoàng')).toBe(true);
    expect(matchesQuery('hoang tuan', 'Nguyễn Văn Hoàng')).toBe(false);
    expect(matchesQuery('', 'ai cũng khớp')).toBe(true);
    expect(matchesQuery('mai', 'Lê Thị', 'Mai Linh')).toBe(true);
  });

  test('số có dấu cho điểm trình đổi', () => {
    expect(fmtDelta(0.151)).toBe('+0.15');
    expect(fmtDelta(-0.074)).toBe('−0.07');
    expect(fmtDelta(0.001)).toBe('0.00');
    expect(fmtDelta(null)).toBe('—');
    expect(fmtNumber(3.456)).toBe('3.46');
    expect(fmtNumber(undefined)).toBe('—');
  });

  test('đồng hồ sân', () => {
    expect(fmtDuration(0)).toBe('0:00');
    expect(fmtDuration(754000)).toBe('12:34');
    expect(fmtDuration(3723000)).toBe('1:02:03');
    expect(fmtDuration(-5)).toBe('0:00');
  });

  test('giờ dự kiến của lượt', () => {
    expect(addMinutes('18:00', 45)).toBe('18:45');
    expect(addMinutes('23:30', 45)).toBe('00:15');
    expect(addMinutes('abc', 5)).toBe('');
  });

  test('tên đội, tỉ số, luật điểm', () => {
    expect(teamText({ players: [{ name: 'An' }, { name: 'Bình' }] })).toBe('An + Bình');
    expect(teamText(null)).toBe('');
    expect(gamesText([[21, 15], [18, 21]])).toBe('21–15, 18–21');
    expect(rulesText({ bestOf: 3, points: 21 })).toBe('3 game × 21');
    expect(presetOf({ bestOf: 3, points: 15 })).toBe('3x15');
    expect(presetOf(null)).toBe('1x21');
  });

  test('nhãn giải', () => {
    expect(disciplineText({ discipline: 'doubles', genderRule: 'mixed' })).toBe('Đôi nam nữ');
    expect(isPairsTournament({ discipline: 'doubles', pairingMode: 'fixed' })).toBe(true);
    expect(isPairsTournament({ discipline: 'singles', pairingMode: 'fixed' })).toBe(false);
    for (const [preset] of SCORING_PRESETS) expect(MATCH_MINUTES[preset]).toBeGreaterThan(0);
  });
});

describe('permissionsFor — chỉ để ẩn nút, service mới là chốt chặn', () => {
  const user = (role) => ({ id: 1, role });

  test('nhân viên vận hành được, không tạo giải / chỉnh điểm', () => {
    expect(permissionsFor(user('employee'))).toMatchObject({ canOperate: true, canManageTournaments: false, canAdjustRating: false, isManager: false });
  });

  test.each(['admin', 'branch_manager'])('%s có quyền quản lý', (role) => {
    expect(permissionsFor(user(role))).toMatchObject({ canOperate: true, canManageTournaments: true, canAdjustRating: true, canReviewAssessments: true });
  });

  test('khách chỉ phần của mình', () => {
    expect(permissionsFor(user('customer'))).toMatchObject({ isCustomer: true, canOperate: false, canManageTournaments: false, canScoreOwnMatch: true });
  });

  test('chưa đăng nhập, hoặc role dạng object của API', () => {
    expect(permissionsFor(null)).toMatchObject({ isAnonymous: true, canOperate: false });
    expect(permissionsFor({ id: 1, role: { name: 'admin' } }).isManager).toBe(true);
  });
});
