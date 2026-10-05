import { describe, test, expect } from 'vitest';
import { buildDrawBody, initDraw, knockoutRounds, sameGroupPairs, swapCells, swapPeople, swapTeams } from './draw';
import { buildResultBody } from './score';

const P = (id, over = {}) => ({ id, name: `N${id}`, gender: 'male', pairingRating: 3, ...over });
const preview = () => ({
  seed: 'abc',
  teams: [{ players: [P('a'), P('b')] }, { players: [P('c'), P('d')] }, { players: [P('e'), P('f')] }, { players: [P('g'), P('h')] }],
  groups: [{ groupNo: 1, teams: [0, 1] }, { groupNo: 2, teams: [2, 3] }],
  bracket: [0, 1, 2, 3],
  waitlist: [{ playerId: 'z', name: 'Zed', reason: 'x' }]
});

describe('bốc thăm — đổi chỗ khi xem trước', () => {
  test('initDraw sao chép, không dính tham chiếu bản xem trước', () => {
    const p = preview();
    const st = initDraw(p);
    st.teams[0].players[0].name = 'sửa';
    st.groups[0].teams.push(9);
    expect(p.teams[0].players[0].name).toBe('Na');
    expect(p.groups[0].teams).toEqual([0, 1]);
    expect(st.waiting).toEqual([{ id: 'z', name: 'Zed', reason: 'x' }]);
    expect(st.moved).toBe(false);
  });

  test('swapTeams đổi đội ở cả bảng lẫn sơ đồ, không tách cặp', () => {
    const st = swapTeams(initDraw(preview()), 1, 2);
    expect(st.groups.map((g) => g.teams)).toEqual([[0, 2], [1, 3]]);
    expect(st.bracket).toEqual([0, 2, 1, 3]);
    expect(st.moved).toBe(true);
    expect(st.teams[1].players.map((x) => x.id)).toEqual(['c', 'd']);
  });

  test('swapTeams khi chưa có sơ đồ (vòng tròn) để bracket null', () => {
    const p = preview();
    p.bracket = null;
    expect(swapTeams(initDraw(p), 0, 1).bracket).toBeNull();
  });

  test('swapPeople: đổi giữa hai đội, và với danh sách chờ (chờ chỉ giữ id + tên)', () => {
    const st0 = initDraw(preview());
    const st1 = swapPeople(st0, 't:0:1', 't:3:0');
    expect(st1.teams[0].players.map((x) => x.id)).toEqual(['a', 'g']);
    expect(st1.teams[3].players.map((x) => x.id)).toEqual(['b', 'h']);
    const st2 = swapPeople(st0, 't:0:0', 'w:0');
    expect(st2.teams[0].players[0]).toMatchObject({ id: 'z', name: 'Zed', pairingRating: 0 });
    expect(st2.waiting[0]).toEqual({ id: 'a', name: 'Na' });
    expect(st0.teams[0].players[0].id).toBe('a'); // không sửa trạng thái cũ
  });

  test('buildDrawBody gửi seed + id người theo đội + bảng + sơ đồ', () => {
    const p = preview();
    expect(buildDrawBody(p, swapTeams(initDraw(p), 0, 3))).toEqual({
      seed: 'abc',
      teams: [{ players: ['a', 'b'] }, { players: ['c', 'd'] }, { players: ['e', 'f'] }, { players: ['g', 'h'] }],
      groups: [{ groupNo: 1, teams: [3, 1] }, { groupNo: 2, teams: [2, 0] }],
      bracket: [3, 1, 2, 0]
    });
  });
});

describe('khoá sơ đồ loại trực tiếp', () => {
  const byId = {
    t1: { groupNo: 1, groupRank: 1, players: [{ name: 'A' }] },
    t2: { groupNo: 1, groupRank: 2, players: [{ name: 'B' }] },
    t3: { groupNo: 2, groupRank: 1, players: [{ name: 'C' }] },
    t4: { groupNo: 2, groupRank: 2, players: [{ name: 'D' }] }
  };

  test('sameGroupPairs báo trận (từ 1) có hai đội cùng bảng, bỏ qua ô miễn đấu', () => {
    expect(sameGroupPairs(byId, ['t1', 't2', 't3', 't4'])).toEqual([1, 2]);
    expect(sameGroupPairs(byId, ['t1', 't4', 't3', 't2'])).toEqual([]);
    expect(sameGroupPairs(byId, ['t1', null, 't3', 't4'])).toEqual([2]);
  });

  test('knockoutRounds dựng vòng 1 kèm nhãn nhất/nhì bảng, ô trống = null', () => {
    const r = knockoutRounds(byId, ['t1', 't4', 't3', null]);
    expect(r).toHaveLength(1);
    expect(r[0].matches).toHaveLength(2);
    expect(r[0].matches[0].teamA.tag).toBe('nhất bảng 1');
    expect(r[0].matches[0].teamB.tag).toBe('nhì bảng 2');
    expect(r[0].matches[1].teamB).toBeNull();
    expect(r[0].matches[1].bracketPos).toBe(2);
  });

  test('swapCells không sửa mảng gốc', () => {
    const a = ['x', 'y', 'z'];
    expect(swapCells(a, 0, 2)).toEqual(['z', 'y', 'x']);
    expect(a).toEqual(['x', 'y', 'z']);
  });
});

describe('buildResultBody — nhập tỉ số tay', () => {
  test('bình thường: bỏ game trống, ép số', () => {
    expect(buildResultBody({ games: [['21', '13'], ['', '']] })).toEqual({ body: { games: [[21, 13]] } });
  });
  test('thiếu một bên / không phải số / quá 99 / không có game → lỗi tiếng Việt', () => {
    expect(buildResultBody({ games: [['21', '']] }).error).toMatch(/đủ điểm/);
    expect(buildResultBody({ games: [['21', 'x']] }).error).toMatch(/số nguyên/);
    expect(buildResultBody({ games: [['100', '3']] }).error).toMatch(/0 đến 99/);
    expect(buildResultBody({ games: [['21', '-1']] }).error).toMatch(/0 đến 99/);
    expect(buildResultBody({ games: [['', '']] }).error).toMatch(/ít nhất một game/);
  });
  test('bỏ cuộc giữa trận cần ít nhất một game xong; gửi outcome + winnerSide', () => {
    expect(buildResultBody({ games: [['', '']], outcome: 'retired' }).error).toMatch(/W\.O\./);
    expect(buildResultBody({ games: [['21', '10'], ['5', '3']], outcome: 'retired', winner: 'B' }).body).toEqual({ games: [[21, 10], [5, 3]], outcome: 'retired', winnerSide: 'B' });
  });
  test('W.O. bỏ qua mọi ô tỉ số', () => {
    expect(buildResultBody({ games: [['abc', '']], outcome: 'walkover', winner: 'A' })).toEqual({ body: { games: [], outcome: 'walkover', winnerSide: 'A' } });
  });
});
