import { describe, test, expect } from 'vitest';
import {
  FEE_PER_PERSON_VND, feeText, formatVnd, dayText, tournamentWhen, sessionWhen, sessionPhase, registrationState, spotsText, fillRatio, myTournamentText,
  ratingRuleText, tournamentFacts, sessionFacts, sessionSpotsText, sessionFillRatio, mySessionText, groupSchedule, scoreText, winnerOf, sortOpenTournaments,
  tournamentTabs, hubPaths, loginRedirect, branchRef, disciplineLabel, withLive, withLiveList, withLiveBoard, liveMapReducer
} from './publicHub';

// Logic thuần của khu công khai /thi-dau (plan 27, p3).
const NOW = new Date(2026, 9, 7, 10, 0, 0); // 07/10/2026 10:00 (giờ máy)

describe('lệ phí hiển thị tạm cố định', () => {
  test('200.000đ/người cho cả giải và buổi giao lưu (chỉ hiển thị, chưa thu)', () => {
    expect(FEE_PER_PERSON_VND).toBe(200000);
    expect(formatVnd(200000)).toBe('200.000đ');
    expect(feeText()).toBe('200.000đ/người');
  });
});

describe('ngày giờ gần gũi', () => {
  test('hôm nay / ngày mai / hôm qua / thứ + ngày', () => {
    expect(dayText('2026-10-07', NOW)).toBe('Hôm nay · 07/10');
    expect(dayText('2026-10-08', NOW)).toBe('Ngày mai · 08/10');
    expect(dayText('2026-10-06', NOW)).toBe('Hôm qua · 06/10');
    expect(dayText('2026-12-20', NOW)).toBe('Chủ nhật · 20/12');
    expect(dayText('2026-10-10', NOW)).toBe('Thứ bảy · 10/10');
    expect(dayText('hỏng', NOW)).toBe('');
  });
  test('giải: ngày + giờ bắt đầu nếu có', () => {
    expect(tournamentWhen({ startsOn: '2026-10-08', startTime: '08:30' }, NOW)).toBe('Ngày mai · 08/10 · 08:30');
    expect(tournamentWhen({ startsOn: '2026-10-08', startTime: null }, NOW)).toBe('Ngày mai · 08/10');
  });
  test('buổi giao lưu: ngày + giờ theo giờ máy', () => {
    const iso = new Date(2026, 9, 7, 18, 5, 0).toISOString();
    expect(sessionWhen(iso, NOW)).toBe('Hôm nay · 07/10 · 18:05');
    expect(sessionWhen('hỏng', NOW)).toBe('');
  });
  test('sessionPhase: đang diễn ra / sắp diễn ra / đã kết thúc', () => {
    expect(sessionPhase({ status: 'open', startsAt: new Date(2026, 9, 7, 9, 0).toISOString() }, NOW)).toBe('live');
    expect(sessionPhase({ status: 'open', startsAt: new Date(2026, 9, 7, 19, 0).toISOString() }, NOW)).toBe('soon');
    expect(sessionPhase({ status: 'closed', startsAt: new Date(2026, 9, 7, 9, 0).toISOString() }, NOW)).toBe('closed');
  });
});

describe('đăng ký giải', () => {
  const open = (reg) => ({ status: 'open', registration: { open: true, registered: 0, waitlisted: 0, maxEntries: null, spotsLeft: null, needsPartner: false, ...reg } });
  test('registrationState theo trạng thái giải và số chỗ', () => {
    expect(registrationState(open({}))).toMatchObject({ key: 'open', canRegister: true });
    expect(registrationState(open({ maxEntries: 8, spotsLeft: 3 }))).toMatchObject({ key: 'open', canRegister: true });
    expect(registrationState(open({ maxEntries: 8, spotsLeft: 0 }))).toMatchObject({ key: 'full', canRegister: true });
    expect(registrationState({ status: 'drawn' })).toMatchObject({ key: 'closed', canRegister: false });
    expect(registrationState({ status: 'in_progress' })).toMatchObject({ key: 'live', canRegister: false });
    expect(registrationState({ status: 'finalized' })).toMatchObject({ key: 'done', canRegister: false });
  });
  test('spotsText đếm theo người', () => {
    expect(spotsText({ maxEntries: 16, spotsLeft: 5, registered: 11, waitlisted: 0 })).toBe('Còn 5/16 chỗ');
    expect(spotsText({ maxEntries: 8, spotsLeft: 0, registered: 8, waitlisted: 2 })).toBe('Hết chỗ · 2 người chờ');
    expect(spotsText({ maxEntries: 8, spotsLeft: 0, registered: 8, waitlisted: 0 })).toBe('Hết chỗ');
    expect(spotsText({ maxEntries: null, registered: 12, waitlisted: 0 })).toBe('12 người đã đăng ký');
    expect(spotsText({ maxEntries: null, registered: 0, waitlisted: 0 })).toBe('Chưa có ai đăng ký');
    expect(spotsText(null)).toBe('');
  });
  test('fillRatio: 0..1; không giới hạn → null', () => {
    expect(fillRatio({ maxEntries: 8, spotsLeft: 2 })).toBe(0.75);
    expect(fillRatio({ maxEntries: 8, spotsLeft: 0 })).toBe(1);
    expect(fillRatio({ maxEntries: 8, spotsLeft: 8 })).toBe(0);
    expect(fillRatio({ maxEntries: null })).toBeNull();
    expect(fillRatio(undefined)).toBeNull();
  });
  test('đăng ký của chính mình: chính thức / chờ kèm thứ tự / cặp', () => {
    expect(myTournamentText(null)).toBeNull();
    expect(myTournamentText({ entry: { status: 'registered', players: [{ name: 'An' }] }, canWithdraw: true })).toEqual({ tone: 'emerald', text: 'Bạn đã đăng ký', pair: '' });
    expect(myTournamentText({ entry: { status: 'waitlisted', waitlistPosition: 2, players: [{ name: 'An' }, { name: 'Bình' }] } })).toEqual({ tone: 'amber', text: 'Bạn đang trong danh sách chờ — thứ 2', pair: 'An & Bình' });
    expect(myTournamentText({ entry: { status: 'waitlisted', waitlistPosition: null, players: [] } }).text).toBe('Bạn đang trong danh sách chờ');
  });
});

describe('thông tin giải / buổi', () => {
  test('điều kiện trình', () => {
    expect(ratingRuleText(null)).toBe('Không giới hạn trình');
    expect(ratingRuleText({ scope: 'player', min: 2.5, max: 3.5 })).toBe('Trình mỗi người từ 2.5 đến 3.5');
    expect(ratingRuleText({ scope: 'player', min: null, max: 4 })).toBe('Trình mỗi người tối đa 4');
    expect(ratingRuleText({ scope: 'team_sum', min: 6, max: null })).toBe('Tổng trình cặp tối thiểu 6');
  });
  test('nội dung thi đấu', () => {
    expect(disciplineLabel({ discipline: 'doubles', genderRule: 'mixed' })).toBe('Đôi nam nữ');
    expect(disciplineLabel({ discipline: 'singles', genderRule: 'men' })).toBe('Đơn nam');
    expect(disciplineLabel({ discipline: 'singles', genderRule: 'open' })).toBe('Đơn');
  });
  test('tournamentFacts: đôi có dòng ghép cặp; luôn có lệ phí dự kiến', () => {
    const t = { discipline: 'doubles', genderRule: 'open', pairingMode: 'fixed', format: 'round_robin', ratingRule: null, scoring: { bestOf: 3, points: 21 }, courtCount: 4 };
    const rows = Object.fromEntries(tournamentFacts(t));
    expect(rows['Nội dung']).toBe('Đôi');
    expect(rows['Cách ghép cặp']).toBe('cặp đăng ký sẵn');
    expect(rows['Thể thức']).toBe('vòng tròn');
    expect(rows['Luật điểm']).toBe('3 game × 21');
    expect(rows['Số sân']).toBe('4 sân');
    expect(rows['Lệ phí dự kiến']).toBe('200.000đ/người — thanh toán tại quầy');
    expect(Object.fromEntries(tournamentFacts({ ...t, discipline: 'singles' }))['Cách ghép cặp']).toBeUndefined();
  });
  test('sessionFacts', () => {
    const rows = Object.fromEntries(sessionFacts({ format: 'doubles', mode: 'balanced', courtCount: 2, scoring: { bestOf: 1, points: 21 }, rated: true }));
    expect(rows).toMatchObject({ 'Hình thức': 'Đánh đôi', 'Cách xếp sân': 'cân bằng', 'Số sân': '2 sân', 'Tính điểm trình': 'Có (hệ số 0.5)' });
  });
});

describe('buổi giao lưu: chỗ + trạng thái của mình', () => {
  test('sessionSpotsText / sessionFillRatio', () => {
    expect(sessionSpotsText({ maxPlayers: 12, spotsLeft: 4, registered: 8, waitlisted: 0 })).toBe('Còn 4/12 chỗ');
    expect(sessionSpotsText({ maxPlayers: 4, spotsLeft: 0, registered: 4, waitlisted: 3 })).toBe('Hết chỗ · 3 người chờ');
    expect(sessionSpotsText({ maxPlayers: null, registered: 5, waitlisted: 0 })).toBe('5 người đã đăng ký');
    expect(sessionFillRatio({ maxPlayers: 10, spotsLeft: 4 })).toBe(0.6);
    expect(sessionFillRatio({ maxPlayers: null })).toBeNull();
  });
  test('mySessionText', () => {
    expect(mySessionText(null)).toBeNull();
    expect(mySessionText({ status: 'registered' })).toEqual({ tone: 'emerald', text: 'Bạn đã đăng ký giữ chỗ' });
    expect(mySessionText({ status: 'waitlisted', waitlistPosition: 1 })).toEqual({ tone: 'amber', text: 'Bạn đang chờ — thứ 1' });
    expect(mySessionText({ status: 'attended' }).text).toBe('Bạn đã điểm danh tại sân');
  });
});

describe('lịch thi đấu', () => {
  const m = (over) => ({ id: over.id, stage: 'group', groupNo: 1, roundNo: null, slotNo: 1, bracketPos: null, label: null, status: 'scheduled', games: [], live: null, ...over });
  test('gom theo bảng / vòng, đúng thứ tự giai đoạn; đang đánh lên trước rồi theo lượt; trận huỷ bị bỏ', () => {
    const sections = groupSchedule([
      m({ id: 'k2', stage: 'knockout', groupNo: null, roundNo: 2, bracketPos: 1 }),
      m({ id: 'g2b', groupNo: 2, slotNo: 1 }),
      m({ id: 'g1c', groupNo: 1, slotNo: 3, status: 'completed' }),
      m({ id: 'g1a', groupNo: 1, slotNo: 1, status: 'in_play' }),
      m({ id: 'g1b', groupNo: 1, slotNo: 2 }),
      m({ id: 'k3', stage: 'knockout', groupNo: null, roundNo: 2, label: 'Tranh hạng 3', bracketPos: 2 }),
      m({ id: 'k1', stage: 'knockout', groupNo: null, roundNo: 1, bracketPos: 1 }),
      m({ id: 'x', status: 'cancelled' })
    ]);
    expect(sections.map((s) => s.title)).toEqual(['Vòng bảng — Bảng 1', 'Vòng bảng — Bảng 2', 'Loại trực tiếp — vòng 1', 'Loại trực tiếp — vòng 2', 'Tranh hạng 3']);
    expect(sections[0].matches.map((x) => x.id)).toEqual(['g1a', 'g1b', 'g1c']);
    expect(groupSchedule(null)).toEqual([]);
  });
  test('scoreText: xong → các game; đang bấm điểm → game xong + game đang đánh; chưa đánh → rỗng', () => {
    expect(scoreText({ status: 'completed', games: [[21, 15], [18, 21], [21, 19]] })).toBe('21–15, 18–21, 21–19');
    expect(scoreText({ status: 'in_play', games: [], live: { games: [[21, 17]], current: [8, 6] } })).toBe('21–17, 8–6');
    expect(scoreText({ status: 'in_play', games: [], live: { games: [], current: [3, 2] } })).toBe('3–2');
    expect(scoreText({ status: 'scheduled', games: [], live: null })).toBe('');
    expect(scoreText(null)).toBe('');
  });
  test('winnerOf chỉ khi trận đã xong', () => {
    expect(winnerOf({ status: 'completed', winnerSide: 'B' })).toBe('B');
    expect(winnerOf({ status: 'in_play', winnerSide: null })).toBeNull();
    expect(winnerOf(null)).toBeNull();
  });
});

describe('tỉ số trực tiếp qua SSE', () => {
  const live = (revision, games, current) => ({ matchId: 'm1', revision, games, current });
  test('liveMapReducer: snapshot thay cả bản đồ; score thêm / đổi một trận; sự kiện khác bỏ qua', () => {
    const first = liveMapReducer({}, 'snapshot', { matches: [{ matchId: 'a', live: live(1, [], [1, 0]) }, { matchId: 'b', live: live(2, [], [0, 1]) }] });
    expect(Object.keys(first)).toEqual(['a', 'b']);
    const next = liveMapReducer(first, 'score', { matchId: 'a', live: live(3, [], [2, 0]) });
    expect(next.a.revision).toBe(3);
    expect(next.b.revision).toBe(2);
    expect(liveMapReducer(next, 'board', { reason: 'x' })).toBe(next);
    expect(liveMapReducer(next, 'snapshot', { matches: [] })).toEqual({});
    expect(liveMapReducer(next, 'snapshot', null)).toEqual({});
  });
  test('withLive chỉ nhận bản MỚI HƠN; trận chưa đánh nhận bản live thì thành đang đánh', () => {
    const m = { id: 'm1', status: 'in_play', live: live(5, [], [10, 8]) };
    expect(withLive(m, { m1: live(4, [], [9, 8]) })).toBe(m); // cũ hơn → giữ nguyên
    expect(withLive(m, { m1: live(6, [], [11, 8]) }).live.current).toEqual([11, 8]);
    const fresh = withLive({ id: 'm1', status: 'scheduled', live: null }, { m1: live(1, [], [1, 0]) });
    expect([fresh.status, fresh.live.revision]).toEqual(['in_play', 1]);
    expect(withLive({ id: 'zz', status: 'scheduled', live: null }, { m1: live(1, [], [1, 0]) }).live).toBeNull();
    expect(withLive(m, null)).toBe(m);
  });
  test('withLiveList / withLiveBoard: không có tỉ số trực tiếp thì trả nguyên đối tượng', () => {
    const list = [{ id: 'm1', status: 'in_play', live: null }];
    expect(withLiveList(list, {})).toBe(list);
    expect(withLiveList(list, { m1: live(1, [], [3, 2]) })[0].live.current).toEqual([3, 2]);
    const board = { courts: [{ courtRef: 'c1', status: 'busy', match: { id: 'm1', status: 'in_play', live: null } }, { courtRef: 'c2', status: 'free', match: null }], recent: [] };
    expect(withLiveBoard(board, {})).toBe(board);
    expect(withLiveBoard(board, { m1: live(2, [], [5, 4]) }).courts[0].match.live.current).toEqual([5, 4]);
    expect(withLiveBoard(null, { m1: live(2, [], [5, 4]) })).toBeNull();
  });
});

describe('trang chủ / điều hướng', () => {
  test('sortOpenTournaments: còn chỗ trước, rồi ngày, rồi giờ', () => {
    const t = (id, startsOn, startTime, spotsLeft, maxEntries = 8) => ({ id, startsOn, startTime, registration: { maxEntries, spotsLeft } });
    expect(sortOpenTournaments([t('full', '2026-10-09', '08:00', 0), t('late', '2026-10-12', '09:00', 3), t('early2', '2026-10-10', '10:00', 5), t('early1', '2026-10-10', '08:00', 5), t('open', '2026-10-30', null, null, null)]).map((x) => x.id))
      .toEqual(['early1', 'early2', 'late', 'open', 'full']);
    expect(sortOpenTournaments(undefined)).toEqual([]);
  });
  test('tab của trang giải theo trạng thái', () => {
    expect(tournamentTabs({ status: 'open', format: 'round_robin' }).map(([k]) => k)).toEqual(['dangky']);
    expect(tournamentTabs({ status: 'in_progress', format: 'groups_knockout' }).map(([k, label]) => [k, label])).toEqual([['dangky', 'Đăng ký'], ['lich', 'Lịch & kết quả'], ['bang', 'Bảng & sơ đồ']]);
    expect(tournamentTabs({ status: 'drawn', format: 'knockout' })[2]).toEqual(['bang', 'Sơ đồ']);
    expect(tournamentTabs({ status: 'finalized', format: 'round_robin' }).map(([k]) => k)).toEqual(['dangky', 'lich', 'bang', 'ketqua']);
  });
  test('đường dẫn và đăng nhập quay lại', () => {
    expect(hubPaths.home).toBe('/thi-dau');
    expect(hubPaths.tournament('abc')).toBe('/thi-dau/giai/abc');
    expect(hubPaths.session('xyz')).toBe('/thi-dau/giao-luu/xyz');
    expect(loginRedirect('/thi-dau/giai/abc')).toEqual({ pathname: '/login', state: { from: { pathname: '/thi-dau/giai/abc' } } });
    expect(branchRef(3)).toBe('bd:branch:3');
    expect(branchRef('')).toBe('');
  });
});
