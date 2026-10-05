import { describe, test, expect } from 'vitest';
import { buildProfilePatch, chartRows, defaultCategory, groupByTournament, headToHeadText, movementText, myLiveMatch, myTournamentState, nicknameError, profileForm, selfAssessState } from './customer';

describe('bảng mặc định / xu hướng', () => {
  test('theo giới tính', () => {
    expect(defaultCategory('male')).toBe('MD');
    expect(defaultCategory('female')).toBe('WD');
    expect(defaultCategory(null)).toBe('MD');
  });
  test('movementText', () => {
    expect(movementText(2)).toBe('▲2');
    expect(movementText(-1)).toBe('▼1');
    expect(movementText(0)).toBe('—');
    expect(movementText(null)).toBe('mới');
  });
});

describe('selfAssessState — khi nào tự chấm / chấm lại được', () => {
  const rating = (over = {}) => ({ rating: 3, ratedMatches: 0, verified: false, ...over });
  test('chưa có điểm → chấm được', () => {
    expect(selfAssessState({ ratings: {} })).toEqual({ can: true, reason: '' });
    expect(selfAssessState(null)).toEqual({ can: true, reason: '' });
  });
  test('đã có điểm tự chấm, chưa ai xác nhận, chưa có trận → chấm lại được', () => {
    expect(selfAssessState({ ratings: { singles: rating(), doubles: rating() } }).can).toBe(true);
  });
  test('đã có trận tính điểm → khoá, nêu lý do', () => {
    const s = selfAssessState({ ratings: { singles: rating({ ratedMatches: 2 }) } });
    expect(s.can).toBe(false);
    expect(s.reason).toMatch(/trận tính điểm/);
  });
  test('nhân viên đã xác nhận → khoá, bảo nhờ nhân viên', () => {
    const s = selfAssessState({ ratings: { doubles: rating({ verified: true }) } });
    expect(s.can).toBe(false);
    expect(s.reason).toMatch(/nhân viên/);
  });
});

describe('chartRows — sổ điểm → biểu đồ', () => {
  test('sắp theo thời gian, mỗi dòng một nội dung, giữ lý do', () => {
    const rows = chartRows([
      { discipline: 'doubles', after: 4.1, createdAt: '2026-10-05T10:00:00Z', reason: 'session' },
      { discipline: 'singles', after: 3.5, createdAt: '2026-10-01T10:00:00Z', reason: 'assessment' }
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ singles: 3.5, reason: 'Chấm trình' });
    expect(rows[1]).toMatchObject({ doubles: 4.1, reason: 'Buổi giao lưu' });
    expect(rows[0].doubles).toBeUndefined();
    expect(chartRows(null)).toEqual([]);
  });
  test('hai nội dung đổi cùng một lúc gộp thành một dòng (trục thời gian không trùng mốc)', () => {
    const rows = chartRows([
      { discipline: 'singles', after: 3.25, createdAt: '2026-10-05T10:00:00Z', reason: 'assessment' },
      { discipline: 'doubles', after: 3.25, createdAt: '2026-10-05T10:00:00Z', reason: 'assessment' },
      { discipline: 'doubles', after: 3.1, createdAt: '2026-10-06T10:00:00Z', reason: 'session' }
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ singles: 3.25, doubles: 3.25 });
    expect(rows[1]).toMatchObject({ doubles: 3.1 });
    expect(rows[1].singles).toBeUndefined();
  });
});

describe('hồ sơ của tôi', () => {
  const player = { nickname: 'An Smash', birthYear: 1990, dominantHand: 'right', playingSinceYear: null, sessionsPerWeek: 2, preferredPlay: 'both', doublesPosition: null, homeOrganizerRef: 'bd:branch:1', visibility: 'members', gender: 'male' };
  test('tên thi đấu 2–30 ký tự (trống = bỏ tên)', () => {
    expect(nicknameError('')).toBe('');
    expect(nicknameError('A')).toMatch(/2–30/);
    expect(nicknameError('A'.repeat(31))).toMatch(/2–30/);
    expect(nicknameError('An')).toBe('');
  });
  test('không sửa gì thì patch rỗng', () => {
    expect(buildProfilePatch(profileForm(player), player)).toEqual({});
  });
  test('chỉ gửi ô đổi; ô xoá trống → null; số ép kiểu; chuỗi cắt khoảng trắng', () => {
    const form = { ...profileForm(player), nickname: '  Bảo  ', birthYear: '1991', dominantHand: '', visibility: 'public' };
    expect(buildProfilePatch(form, player)).toEqual({ nickname: 'Bảo', birthYear: 1991, dominantHand: null, visibility: 'public' });
  });
  test('giới tính chỉ gửi khi mở khoá (chưa có trận tính điểm)', () => {
    const form = { ...profileForm(player), gender: 'female' };
    expect(buildProfilePatch(form, player)).toEqual({});
    expect(buildProfilePatch(form, player, { genderLocked: false })).toEqual({ gender: 'female' });
  });
  test('ô số buổi / tuần = 0 không bị coi là trống', () => {
    const form = { ...profileForm(player), sessionsPerWeek: '0' };
    expect(buildProfilePatch(form, player)).toEqual({ sessionsPerWeek: 0 });
  });
});

describe('giải của tôi / đối đầu', () => {
  test('trạng thái theo giải', () => {
    expect(myTournamentState({ tournament: { status: 'in_progress' } })).toEqual({ label: 'Đang thi đấu', tone: 'live' });
    expect(myTournamentState({ tournament: { status: 'open' } }).tone).toBe('open');
    expect(myTournamentState({ tournament: { status: 'finalized' }, placement: { label: 'Vô địch' } }).label).toBe('Đã kết thúc · Vô địch');
    expect(myTournamentState({ tournament: { status: 'cancelled' } }).tone).toBe('bad');
  });
  test('trận đang đánh của tôi', () => {
    expect(myLiveMatch([{ id: 'a', status: 'scheduled' }, { id: 'b', status: 'in_play' }]).id).toBe('b');
    expect(myLiveMatch([])).toBeNull();
    expect(myLiveMatch(undefined)).toBeNull();
  });
  test('gom trận theo giải, bỏ trận giao lưu', () => {
    const g = groupByTournament([{ id: 1, contextType: 'tournament', contextId: 't1' }, { id: 2, contextType: 'session', contextId: 's1' }, { id: 3, contextType: 'tournament', contextId: 't1' }, { id: 4, contextType: 'tournament', contextId: 't2' }]);
    expect([...g.keys()]).toEqual(['t1', 't2']);
    expect(g.get('t1').map((m) => m.id)).toEqual([1, 3]);
    expect(groupByTournament(null).size).toBe(0);
  });
  test('câu đối đầu', () => {
    expect(headToHeadText({ matches: 4, wins: 3, losses: 1 })).toBe('Bạn thắng 3 – thua 1 trong 4 trận');
    expect(headToHeadText({ matches: 0 })).toMatch(/Chưa có trận/);
  });
});
