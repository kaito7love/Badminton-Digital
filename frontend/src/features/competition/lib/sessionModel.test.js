import { describe, test, expect } from 'vitest';
import { buildFillBody, checkInPlan, initFill, perCourt, personLabel, repeatWarning, rosterGroups, rosterNote, sessionInfo, swapFill } from './sessionModel';
import { buildSessionBody } from '../pages/sessions/SessionDialogs';

const preview = () => ({
  seed: 's1', round: 2, freeCourts: ['bd:court:1', 'bd:court:2'],
  assignments: [
    { court: 'bd:court:1', sideA: ['a', 'b'], sideB: ['c', 'd'], repeatPartners: 1 },
    { court: 'bd:court:2', sideA: ['e', 'f'], sideB: ['g', 'h'], repeatPartners: 0 }
  ],
  waiting: ['i', 'j'],
  players: { a: { name: 'An', pairingRating: 3.25 }, i: { name: 'Ích', pairingRating: null } }
});

describe('sessionInfo / rosterGroups', () => {
  test('dòng mô tả buổi', () => {
    const s = { format: 'doubles', mode: 'balanced', scoring: { bestOf: 3, points: 21 }, rated: true, courtRefs: ['bd:court:1', 'bd:court:2'] };
    expect(sessionInfo(s)).toBe('Đôi · cân bằng · 3 game × 21 · tính điểm trình khi đóng buổi · Sân 1, Sân 2');
    expect(sessionInfo({ ...s, rated: false, format: 'singles' })).toContain('không tính điểm trình');
  });
  test('người trên sân / đang chờ / đã rời', () => {
    const roster = [
      { playerId: 1, status: 'present', onCourt: 'bd:court:1' }, { playerId: 2, status: 'present', onCourt: null },
      { playerId: 3, status: 'left', onCourt: null }
    ];
    const g = rosterGroups(roster);
    expect(g.present).toHaveLength(2);
    expect(g.onCourt.map((r) => r.playerId)).toEqual([1]);
    expect(g.waiting.map((r) => r.playerId)).toEqual([2]);
    expect(g.left.map((r) => r.playerId)).toEqual([3]);
  });
  test('ghi chú theo trạng thái; số người mỗi sân', () => {
    const now = Date.parse('2026-10-05T10:30:00Z');
    expect(rosterNote({ status: 'left' }, now)).toBe('đã rời buổi');
    expect(rosterNote({ status: 'present', onCourt: 'bd:court:2' }, now)).toBe('đang ở Sân 2');
    expect(rosterNote({ status: 'present', waitingSince: '2026-10-05T10:18:00Z' }, now)).toBe('chờ 12 phút');
    expect(rosterNote({ status: 'present', waitingSince: '2026-10-05T10:30:00Z' }, now)).toBe('vừa vào hàng chờ');
    expect(perCourt('singles')).toBe(2);
    expect(perCourt('doubles')).toBe(4);
  });
});

describe('checkInPlan — lỗi điểm danh → bước tiếp', () => {
  test('chưa có điểm → chấm nhanh', () => {
    expect(checkInPlan({ code: 'NEEDS_ASSESSMENT' })).toEqual({ kind: 'quick' });
  });
  test('đang ở buổi khác → hỏi rời buổi kia (id + tên buổi lấy từ errors[])', () => {
    expect(checkInPlan({ code: 'PRESENT_ELSEWHERE', fields: [{ field: 'sess-9', message: 'Giao lưu thứ Tư' }] })).toEqual({ kind: 'elsewhere', sessionId: 'sess-9', sessionName: 'Giao lưu thứ Tư' });
  });
  test('lỗi khác / không lỗi', () => {
    expect(checkInPlan({ code: 'ALREADY_CHECKED_IN' }).kind).toBe('error');
    expect(checkInPlan(null).kind).toBe('none');
  });
});

describe('xếp sân trống — đổi chỗ xem trước', () => {
  test('initDraw tách khỏi bản xem trước; chưa sửa thì chỉ gửi seed', () => {
    const p = preview();
    const st = initFill(p);
    st.assignments[0].sideA.push('zz');
    expect(p.assignments[0].sideA).toEqual(['a', 'b']);
    expect(buildFillBody(p, initFill(p))).toEqual({ seed: 's1' });
  });
  test('đổi người giữa hai đội ở hai sân', () => {
    const st = swapFill(initFill(preview()), 'a:0:A:0', 'a:1:B:1');
    expect(st.assignments[0].sideA).toEqual(['h', 'b']);
    expect(st.assignments[1].sideB).toEqual(['g', 'a']);
    expect(st.moved).toBe(true);
  });
  test('đổi người đang xếp với người chờ → người chờ vào sân', () => {
    const st = swapFill(initFill(preview()), 'a:0:B:1', 'w:1');
    expect(st.assignments[0].sideB).toEqual(['c', 'j']);
    expect(st.waiting).toEqual(['i', 'd']);
  });
  test('sửa tay thì gửi nguyên văn (không kèm repeatPartners); không sửa trạng thái cũ', () => {
    const p = preview();
    const st0 = initFill(p);
    const st = swapFill(st0, 'a:0:A:0', 'a:0:A:1');
    expect(st0.assignments[0].sideA).toEqual(['a', 'b']);
    expect(buildFillBody(p, st)).toEqual({
      seed: 's1',
      assignments: [
        { court: 'bd:court:1', sideA: ['b', 'a'], sideB: ['c', 'd'] },
        { court: 'bd:court:2', sideA: ['e', 'f'], sideB: ['g', 'h'] }
      ]
    });
  });
  test('cảnh báo đồng đội trùng chỉ cho bản gốc', () => {
    const st = initFill(preview());
    expect(repeatWarning(st, st.assignments[0])).toMatch(/1 cặp/);
    expect(repeatWarning(st, st.assignments[1])).toBe('');
    expect(repeatWarning(swapFill(st, 'a:0:A:0', 'a:0:A:1'), st.assignments[0])).toBe('');
  });
  test('nhãn người: tên + điểm; thiếu thì dùng id', () => {
    const p = preview();
    expect(personLabel(p, 'a')).toBe('An · 3.25');
    expect(personLabel(p, 'i')).toBe('Ích');
    expect(personLabel(p, 'zz')).toBe('zz');
  });
});

describe('buildSessionBody', () => {
  const f = { name: 'Giao lưu T4', startsAt: '2026-10-07T18:30', courts: ['bd:court:1'], format: 'doubles', mode: 'balanced', scoring: '1x21', rated: false };
  test('tạo: có organizerRef, startsAt dạng ISO', () => {
    const r = buildSessionBody(f, { organizerRef: 'bd:branch:1', creating: true });
    expect(r.body).toMatchObject({ name: 'Giao lưu T4', courtRefs: ['bd:court:1'], format: 'doubles', mode: 'balanced', scoring: '1x21', rated: false, organizerRef: 'bd:branch:1' });
    expect(r.body.startsAt).toMatch(/^2026-10-0[67]T/);
  });
  test('sửa: không gửi organizerRef', () => {
    expect(buildSessionBody(f, { organizerRef: 'bd:branch:1', creating: false }).body.organizerRef).toBeUndefined();
  });
  test('tên ngắn / không có sân → lỗi tiếng Việt', () => {
    expect(buildSessionBody({ ...f, name: 'ab' }, {}).error).toMatch(/3 ký tự/);
    expect(buildSessionBody({ ...f, courts: [] }, {}).error).toMatch(/ít nhất một sân/);
  });
  test('sức chứa đăng ký online: trống = không giới hạn (null), số 2–200, sai → lỗi', () => {
    expect(buildSessionBody(f, { creating: false }).body.maxPlayers).toBeNull();
    expect(buildSessionBody({ ...f, maxPlayers: '' }, { creating: false }).body.maxPlayers).toBeNull();
    expect(buildSessionBody({ ...f, maxPlayers: '12' }, { creating: false }).body.maxPlayers).toBe(12);
    for (const bad of ['1', '201', '3.5', 'abc', '-4']) expect(buildSessionBody({ ...f, maxPlayers: bad }, {}).error).toMatch(/từ 2 đến 200/);
  });
});
