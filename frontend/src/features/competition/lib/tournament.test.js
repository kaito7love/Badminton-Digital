import { describe, test, expect } from 'vitest';
import { phaseOf, splitBold, stepsOf } from './phase';
import { buildModel, defaultTab, entryUnits, matchTitle, suggestForCourts, tabsOf, tourCourts } from './tournamentModel';
import { boardRows, mergeLive, pickNewest, serveText } from './live';
import { buildBracketLayout, roundName } from './bracketLayout';

const entry = (id, over = {}) => ({ id, playerId: `p${id}`, name: `Người ${id}`, status: 'registered', checkedInAt: null, ...over });
const tour = (over = {}) => ({
  id: 't1', name: 'Giải', status: 'open', discipline: 'doubles', pairingMode: 'fixed', format: 'knockout', genderRule: 'open', stage: null,
  scoring: { bestOf: 1, points: 21 }, courtRefs: ['bd:court:7', 'bd:court:8'], startsOn: '2026-10-20', organizerRef: 'bd:branch:1', checkInRequired: false, ...over
});
const team = (...names) => ({ players: names.map((n) => ({ id: `id-${n}`, name: n })) });

describe('phaseOf — thanh tiến trình, "việc cần làm", nút chính', () => {
  test('nháp → mở đăng ký', () => {
    const p = phaseOf(tour({ status: 'draft' }), [], []);
    expect(p).toMatchObject({ step: 0, primary: { id: 'open', label: 'Mở đăng ký' } });
  });

  test('mở, chưa đủ người → mở tab đăng ký, đếm số cặp (đôi cặp sẵn = một nửa số người)', () => {
    const p = phaseOf(tour(), [], [entry(1), entry(2)]);
    expect(p.primary.id).toBe('goto:dangky');
    expect(p.todo).toContain('**1 cặp**');
  });

  test('mở, đủ người, bốc thăm tại sân → đếm người đã đến, nút Bốc thăm + Điểm danh', () => {
    const es = [entry(1, { checkedInAt: 'x' }), entry(2), entry(3), entry(4)];
    const p = phaseOf(tour({ checkInRequired: true }), [], es);
    expect(p.primary.id).toBe('draw');
    expect(p.secondary.id).toBe('goto:dangky');
    expect(p.todo).toContain('**1/4**');
    expect(p.step).toBe(1);
  });

  test('giải đơn chỉ cần 2 người; đôi cần 4', () => {
    expect(phaseOf(tour({ discipline: 'singles' }), [], [entry(1), entry(2)]).primary.id).toBe('draw');
    expect(phaseOf(tour({ discipline: 'doubles' }), [], [entry(1), entry(2), entry(3)]).primary.id).toBe('goto:dangky');
  });

  test('đang đấu: còn x trận (y đang đánh) → mở tab Sân', () => {
    const ms = [{ status: 'in_play' }, { status: 'scheduled' }, { status: 'completed' }];
    const p = phaseOf(tour({ status: 'in_progress', stage: 'knockout' }), ms, []);
    expect(p).toMatchObject({ step: 3, primary: { id: 'goto:san' } });
    expect(p.todo).toContain('**2 trận**');
    expect(p.todo).toContain('(1 đang đánh)');
  });

  test('vòng bảng xong → khoá sơ đồ; vòng bảng còn trận → mở tab Sân', () => {
    const t = tour({ status: 'in_progress', format: 'groups_knockout', stage: 'group' });
    expect(phaseOf(t, [{ stage: 'group', status: 'completed' }], []).primary.id).toBe('ko');
    expect(phaseOf(t, [{ stage: 'group', status: 'scheduled' }], []).primary.id).toBe('goto:san');
  });

  test('mọi trận xong → chốt; đã chốt → xem kết quả; huỷ → không có nút', () => {
    expect(phaseOf(tour({ status: 'in_progress', stage: 'knockout' }), [{ status: 'completed' }], []).primary.id).toBe('fin');
    expect(phaseOf(tour({ status: 'finalized' }), [], []).primary.id).toBe('goto:ketqua');
    expect(phaseOf(tour({ status: 'cancelled' }), [], [])).toMatchObject({ step: -1, primary: null });
  });

  test('các bước: giải vòng bảng + loại trực tiếp có thêm "Loại trực tiếp"', () => {
    expect(stepsOf(tour({ format: 'knockout' }))).toEqual(['Đăng ký', 'Điểm danh', 'Bốc thăm', 'Thi đấu', 'Chốt']);
    expect(stepsOf(tour({ format: 'groups_knockout' }))).toEqual(['Đăng ký', 'Điểm danh', 'Bốc thăm', 'Vòng bảng', 'Loại trực tiếp', 'Chốt']);
  });

  test('splitBold tách phần đậm', () => {
    expect(splitBold('Còn **3 trận** nữa')).toEqual([{ bold: false, text: 'Còn ' }, { bold: true, text: '3 trận' }, { bold: false, text: ' nữa' }]);
  });
});

describe('mô hình trang giải', () => {
  test('tourCourts: giải cũ chỉ có số sân → Sân 1..n', () => {
    expect(tourCourts({ courtCount: 2 })).toEqual(['bd:court:1', 'bd:court:2']);
    expect(tourCourts({ courtRefs: ['bd:court:9'] })).toEqual(['bd:court:9']);
  });

  test('matchTitle theo giai đoạn', () => {
    expect(matchTitle({ stage: 'group', groupNo: 2, slotNo: 3 })).toBe('Bảng 2 · lượt 3');
    expect(matchTitle({ stage: 'knockout', label: 'Bán kết', slotNo: 7 })).toBe('Bán kết · lượt 7');
    expect(matchTitle({ stage: 'extra' })).toBe('Trận thêm');
  });

  test('entryUnits: ghép cặp cùng trạng thái; cặp lệch trạng thái tách ra', () => {
    const es = [
      entry(1, { partnerPlayerId: 'p2' }), entry(2, { partnerPlayerId: 'p1' }),
      entry(3, { partnerPlayerId: 'p4' }), entry(4, { partnerPlayerId: 'p3', status: 'withdrawn' })
    ];
    const units = entryUnits(tour(), es);
    expect(units.map((u) => u.map((e) => e.id))).toEqual([[1, 2], [3], [4]]);
    expect(entryUnits(tour({ pairingMode: 'random_balanced' }), es).every((u) => u.length === 1)).toBe(true);
  });

  test('suggestForCourts: mỗi sân một trận, không ai ở hai sân', () => {
    const m = (id, a, b) => ({ match: { id, teamA: team(a), teamB: team(b) } });
    const result = suggestForCourts(['c1', 'c2', 'c3'], [m('m1', 'A', 'B'), m('m2', 'A', 'C'), m('m3', 'D', 'E')]);
    expect([...result].map(([c, it]) => [c, it.match.id])).toEqual([['c1', 'm1'], ['c2', 'm3']]);
  });

  test('buildModel: sân bận việc khác không nhận gợi ý; sân đang đánh tách riêng', () => {
    const t = tour({ status: 'in_progress', stage: 'knockout', courtRefs: ['c1', 'c2', 'c3'] });
    const playing = { id: 'm0', status: 'in_play', courtRef: 'c1', teamA: team('X'), teamB: team('Y') };
    const next = { items: [{ match: { id: 'm1', teamA: team('A'), teamB: team('B') } }], blocked: [], freeCourts: ['c1', 'c3'] };
    const model = buildModel({ t, entries: [], matches: [playing], next });
    expect([...model.onCourt.keys()]).toEqual(['c1']);
    expect(model.busyElsewhere).toEqual(['c2']);
    expect(model.freeCourts).toEqual(['c3']);
    expect([...model.suggestion.keys()]).toEqual(['c3']);
    expect(model.live).toBe(true);
  });

  test('buildModel: lý do chờ của trận bị chặn nêu tên người và sân', () => {
    const t = tour({ status: 'in_progress', stage: 'knockout' });
    const m = { id: 'm1', status: 'scheduled', teamA: team('An'), teamB: team('Bình') };
    const next = { items: [], blocked: [{ matchId: 'm1', players: [{ id: 'id-An', courtRef: 'bd:court:3' }] }], freeCourts: [] };
    expect(buildModel({ t, entries: [], matches: [m], next }).blockedText(m)).toBe('An đang ở Sân 3');
  });

  test('tab theo giai đoạn + tab mở sẵn', () => {
    const open = buildModel({ t: tour(), entries: [entry(1)], matches: [] });
    expect(tabsOf(open).map(([k]) => k)).toEqual(['dangky']);
    expect(defaultTab(tour())).toBe('dangky');
    const running = buildModel({ t: tour({ status: 'in_progress' }), entries: [], matches: [{ status: 'completed' }, { status: 'scheduled' }], next: { items: [], blocked: [] } });
    expect(tabsOf(running).map(([k]) => k)).toEqual(['san', 'dangky', 'lich', 'bang']);
    expect(tabsOf(running).find(([k]) => k === 'lich')[1]).toBe('Lịch & kết quả (1/2)');
    expect(defaultTab(tour({ status: 'in_progress' }))).toBe('san');
    expect(defaultTab(tour({ status: 'finalized' }))).toBe('ketqua');
    expect(tabsOf(buildModel({ t: tour({ status: 'finalized' }), entries: [], matches: [] })).map(([k]) => k)).toContain('ketqua');
  });

  test('tên tab "bang" theo thể thức', () => {
    const label = (format) => tabsOf(buildModel({ t: tour({ status: 'in_progress', format }), entries: [], matches: [], next: { items: [], blocked: [] } })).find(([k]) => k === 'bang')[1];
    expect(label('knockout')).toBe('Sơ đồ');
    expect(label('round_robin')).toBe('Bảng xếp hạng');
    expect(label('groups_knockout')).toBe('Bảng đấu & sơ đồ');
  });
});

describe('tỉ số trực tiếp', () => {
  const live = (revision, extra = {}) => ({ matchId: 'm', revision, games: [], current: [3, 2], gameNo: 1, server: 'A', serveFrom: 'right', gamesWon: [0, 0], decided: false, ...extra });

  test('giữ bản có revision mới nhất dù đến lệch thứ tự', () => {
    const v5 = live(5);
    expect(pickNewest(v5, live(4))).toBe(v5);
    expect(pickNewest(v5, live(6)).revision).toBe(6);
    expect(pickNewest(null, live(1)).revision).toBe(1);
    expect(pickNewest(v5, null)).toBe(v5);
    const map = mergeLive(new Map([['m', v5]]), 'm', live(3));
    expect(map.get('m').revision).toBe(5);
  });

  test('bảng điểm: game đã xong, game đang đánh, đội đang giao, ván', () => {
    const match = { scoring: { bestOf: 3, points: 21 }, teamA: team('A'), teamB: team('B') };
    const b = boardRows(match, live(9, { games: [[21, 15]], current: [4, 7], gameNo: 2, gamesWon: [1, 0], server: 'B', serveFrom: 'left' }));
    expect(b.multi).toBe(true);
    expect(b.rows[0]).toMatchObject({ side: 'A', current: 4, serving: false, games: [{ points: 21, won: true }] });
    expect(b.rows[1]).toMatchObject({ side: 'B', current: 7, serving: true, games: [{ points: 15, won: false }] });
    expect(b.meta).toBe('Ván 1–0 · Game 2/3 · giao ô trái');
  });

  test('trận đã đủ điểm: số to là game cuối, đội thắng được đánh dấu, chờ xác nhận', () => {
    const match = { scoring: { bestOf: 1, points: 21 }, teamA: team('A'), teamB: team('B') };
    const b = boardRows(match, live(9, { games: [[21, 17]], decided: true, winnerSide: 'A' }));
    expect(b.rows[0]).toMatchObject({ current: 21, winner: true, serving: false });
    expect(b.meta).toBe('Xong trận — chờ xác nhận');
  });

  test('serveText', () => {
    expect(serveText(live(1))).toBe('Đội A giao · ô phải');
    expect(serveText(null)).toBe('');
  });
});

describe('hình học sơ đồ dạng hình', () => {
  const full = (n, { done = false } = {}) => {
    const R = Math.log2(n);
    const rounds = [];
    for (let r = 1; r <= R; r += 1) {
      const matches = [];
      for (let k = 1; k <= n / 2 ** r; k += 1) {
        matches.push({
          id: `m${r}-${k}`, roundNo: r, bracketPos: k, label: roundName(2 ** (R - r + 1)), status: done ? 'completed' : 'scheduled', winnerSide: done ? 'A' : null,
          teamA: r === 1 ? team(`T${2 * k - 1}`) : done ? team(`W${r}-${k}A`) : null, teamB: r === 1 ? team(`T${2 * k}`) : done ? team(`W${r}-${k}B`) : null, games: done ? [[21, 10]] : []
        });
      }
      rounds.push({ roundNo: r, matches });
    }
    return rounds;
  };

  test('tên cột theo số ô', () => {
    expect([2, 4, 8, 16].map(roundName)).toEqual(['Chung kết', 'Bán kết', 'Tứ kết', 'Vòng 1/8']);
  });

  test('không có trận → không vẽ', () => {
    expect(buildBracketLayout([])).toBeNull();
  });

  test.each([[2, 3], [4, 7], [8, 15], [16, 31]])('%i ô: kiểu một chiều, tông xanh, đủ ô (%i)', (n, plates) => {
    const layout = buildBracketLayout(full(n));
    expect(layout.two).toBe(false);
    expect(layout.tone).toBe('green');
    expect(layout.plates).toHaveLength(plates);
    expect(layout.labels).toHaveLength(Math.log2(n));
    expect(layout.cup).toBeTruthy();
  });

  test('32 ô: đối xứng hai nửa, tông vàng, 63 ô, hai ô chung kết ở giữa, có chú thích CHUNG KẾT', () => {
    const layout = buildBracketLayout(full(32), { title: 'Giải 32' });
    expect(layout.two).toBe(true);
    expect(layout.tone).toBe('gold');
    expect(layout.plates).toHaveLength(63);
    const fin = layout.plates.filter((p) => p.kind === 'fin');
    expect(fin).toHaveLength(2);
    expect(fin[0].x).toBe(fin[1].x);
    expect(fin[0].y).toBeLessThan(fin[1].y);
    expect(layout.caption).toMatchObject({ text: 'Chung kết', sub: 'Giải 32' });
    // hai nửa không đè lên nhau: ô vòng 1 bên trái nằm bên trái ô vòng 1 bên phải
    const first = layout.plates.filter((p) => p.c === 1);
    expect(Math.max(...first.slice(0, 16).map((p) => p.x + p.w))).toBeLessThan(Math.min(...first.slice(16).map((p) => p.x)));
  });

  test('mọi ô nằm trong khung vẽ (không tràn)', () => {
    for (const n of [8, 16, 32]) {
      const layout = buildBracketLayout(full(n));
      for (const p of layout.plates) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(layout.totalW + 0.5);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y + p.h).toBeLessThanOrEqual(layout.totalH + 0.5);
      }
    }
  });

  test('ô miễn đấu: vòng 1 thiếu trận → ô thứ hai là "miễn đấu", đội đi thẳng vòng 2', () => {
    const rounds = full(8);
    // 6 đội: bỏ trận 1 và 3 ở vòng 1; đội T1 và T5 đi thẳng vào vòng 2
    rounds[0].matches = rounds[0].matches.filter((m) => m.bracketPos === 2 || m.bracketPos === 4);
    rounds[1].matches[0].teamA = team('T1');
    rounds[1].matches[1].teamA = team('T5');
    const layout = buildBracketLayout(rounds);
    const col1 = layout.plates.filter((p) => p.c === 1);
    expect(col1[0]).toMatchObject({ note: 'miễn đấu — đi thẳng' });
    expect(col1[0].team.players[0].name).toBe('T1');
    expect(col1[1]).toMatchObject({ state: 'bye', text: 'miễn đấu' });
    expect(col1[4].team.players[0].name).toBe('T5');
  });

  test('đội thắng sáng, đội thua mờ, trận đang đánh có chấm, tỉ số hiện đúng bên', () => {
    const rounds = full(4);
    rounds[0].matches[0] = { ...rounds[0].matches[0], status: 'completed', winnerSide: 'B', games: [[15, 21]] };
    rounds[0].matches[1] = { ...rounds[0].matches[1], status: 'in_play' };
    const layout = buildBracketLayout(rounds);
    const col1 = layout.plates.filter((p) => p.c === 1);
    expect(col1[0]).toMatchObject({ lose: true, win: false, score: '15' });
    expect(col1[1]).toMatchObject({ win: true, score: '21' });
    expect(col1[2].live).toBe(true);
    expect(layout.paths.some((p) => p.hi)).toBe(true);
  });

  test('vô địch: ô cuối có tên đội thắng chung kết; chưa xong thì "chờ vô địch"', () => {
    expect(buildBracketLayout(full(4)).plates.find((p) => p.champ)).toMatchObject({ team: null, text: 'chờ vô địch' });
    const done = buildBracketLayout(full(4, { done: true })).plates.find((p) => p.champ);
    expect(done.team.players[0].name).toBe('W2-1A');
  });

  test('W.O. / bỏ cuộc hiện nhãn thay cho tỉ số', () => {
    const rounds = full(2);
    rounds[0].matches[0] = { ...rounds[0].matches[0], status: 'completed', winnerSide: 'A', outcome: 'walkover', games: [] };
    const col1 = buildBracketLayout(rounds).plates.filter((p) => p.c === 1);
    expect(col1.map((p) => p.score)).toEqual(['W.O.', 'W.O.']);
  });

  test('tranh hạng 3 vẽ riêng, không tính vào ô', () => {
    const rounds = full(4);
    rounds.push({ roundNo: 2, matches: [{ id: 'tp', label: 'Tranh hạng 3', roundNo: 2, bracketPos: 2, status: 'scheduled', teamA: team('X'), teamB: team('Y'), games: [] }] });
    const layout = buildBracketLayout(rounds);
    expect(layout.third.match.id).toBe('tp');
    expect(layout.plates).toHaveLength(7);
  });

  test('xem trước (pick): vòng 1 bấm được, ô null là "miễn đấu", ô đang chọn được đánh dấu', () => {
    const first = [{ id: 'p0', roundNo: 1, bracketPos: 1, status: 'scheduled', teamA: team('A'), teamB: null, games: [] }, { id: 'p1', roundNo: 1, bracketPos: 2, status: 'scheduled', teamA: team('B'), teamB: team('C'), games: [] }];
    const layout = buildBracketLayout([{ matches: first }], { pick: true, rounds: 2, selected: 1 });
    const col1 = layout.plates.filter((p) => p.c === 1);
    expect(col1.map((p) => p.pickIndex)).toEqual([0, 1, 2, 3]);
    expect(col1[1].state).toBe('bye');
    expect(col1[1].selected).toBe(true);
    expect(layout.plates.filter((p) => p.c > 1).every((p) => p.pickIndex === null)).toBe(true);
  });

  test('giải đôi: ô cao hơn để đủ hai dòng tên', () => {
    const rounds = full(4);
    rounds[0].matches[0].teamA = team('An', 'Bình');
    expect(buildBracketLayout(rounds).plates[0].h).toBeGreaterThan(buildBracketLayout(full(4)).plates[0].h);
  });
});
