import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Meter, PlayerName, PlayersLine } from './atoms';
import { SessionCard, TournamentCard } from './Cards';
import { EntriesList, PlacementsCard, ScheduleList, SessionBoardView, SignupList, StandingsTables } from './Lists';
import { RegistrationPanel, SessionSignupPanel } from './Panels';
import RegisterDialog, { GuestForm } from './RegisterDialog';
import { OnlineTags, onlineCount } from '../../pages/tournaments/TabRegistration';
import { SignupRow } from '../../pages/sessions/SessionDetailPage';

// Thành phần của khu công khai /thi-dau (plan 27) vẽ ra HTML tĩnh với dữ liệu hình dạng API công khai — kiểm nội dung, che tên, trạng thái, không tên lạ.
const NOW = new Date(2026, 9, 7, 10, 0, 0);
const html = (el) => renderToStaticMarkup(<StaticRouter location="/thi-dau">{el}</StaticRouter>);

const person = (name, extra = {}) => ({ id: `id-${name}`, name, masked: false, ...extra });
const masked = (code) => ({ id: null, name: `Thành viên ${code}`, masked: true });

const tournament = (over = {}) => ({
  id: 't1', organizerRef: 'bd:branch:1', name: 'Giải mùa thu', description: null, startsOn: '2026-10-08', startTime: '08:30', tier: 'club', discipline: 'doubles', genderRule: 'open',
  pairingMode: 'fixed', maxEntries: 8, ratingRule: { scope: 'player', min: 2.5, max: 3.5 }, format: 'round_robin', groupCount: null, advancePerGroup: null, thirdPlaceMatch: false,
  scoring: { bestOf: 3, points: 21 }, courtCount: 4, matchMinutes: 20, rated: true, ranked: true, status: 'open', stage: null, finalizedAt: null,
  registration: { open: true, needsPartner: true, registered: 5, waitlisted: 0, maxEntries: 8, spotsLeft: 3 }, ...over
});
const session = (over = {}) => ({
  id: 's1', organizerRef: 'bd:branch:1', name: 'Giao lưu tối thứ tư', startsAt: new Date(2026, 9, 7, 18, 30).toISOString(), format: 'doubles', mode: 'balanced', rated: false,
  scoring: { bestOf: 1, points: 21 }, status: 'open', courtCount: 2, rounds: 0, closedAt: null, players: { present: 3 },
  signup: { open: true, maxPlayers: 12, registered: 7, waitlisted: 0, spotsLeft: 5 }, ...over
});

describe('PlayerName / PlayersLine', () => {
  test('người công khai bấm được sang hồ sơ; người bị che hiện mờ, không có liên kết', () => {
    const open = html(<PlayerName player={person('An')} />);
    expect(open).toContain('href="/players/id-An"');
    const hidden = html(<PlayerName player={masked('A3F2')} />);
    expect(hidden).toContain('Thành viên A3F2');
    expect(hidden).toContain('italic');
    expect(hidden).not.toContain('href');
  });
  test('một cặp nối bằng "&"; mine tô xanh', () => {
    const out = html(<PlayersLine players={[person('An'), masked('1B2C')]} mine />);
    expect(out).toContain('An');
    expect(out).toContain('Thành viên 1B2C');
    expect(out).toContain('&amp;');
    expect(out).toContain('text-emerald-700');
  });
  test('Meter: không giới hạn thì không vẽ; đầy thì màu cảnh báo', () => {
    expect(html(<Meter ratio={null} />)).toBe('');
    expect(html(<Meter ratio={0.5} />)).toContain('width:50%');
    expect(html(<Meter ratio={1} />)).toContain('bg-amber-500');
  });
});

describe('thẻ giải / buổi', () => {
  test('giải đang mở: huy hiệu, ngày giờ, điều kiện trình, chỗ còn, lệ phí tạm 200.000đ, nút "Xem & đăng ký" và liên kết tới trang giải', () => {
    const out = html(<TournamentCard t={tournament()} now={NOW} />);
    expect(out).toContain('href="/thi-dau/giai/t1"');
    expect(out).toContain('Đang mở đăng ký');
    expect(out).toContain('Ngày mai · 08/10 · 08:30');
    expect(out).toContain('Trình mỗi người từ 2.5 đến 3.5');
    expect(out).toContain('Còn 3/8 chỗ');
    expect(out).toContain('200.000đ/người');
    expect(out).toContain('Xem &amp; đăng ký');
    expect(out).toContain('Đôi');
  });
  test('giải hết chỗ → "vào danh sách chờ"; giải đã kết thúc → "Xem kết quả" và không có thanh chỗ', () => {
    const full = html(<TournamentCard t={tournament({ registration: { open: true, needsPartner: true, registered: 8, waitlisted: 2, maxEntries: 8, spotsLeft: 0 } })} now={NOW} />);
    expect(full).toContain('Hết chỗ · 2 người chờ');
    expect(full).toContain('Xem &amp; vào danh sách chờ');
    const done = html(<TournamentCard t={tournament({ status: 'finalized' })} now={NOW} />);
    expect(done).toContain('Đã kết thúc');
    expect(done).toContain('Xem kết quả');
    expect(done).not.toContain('progressbar');
  });
  test('buổi giao lưu: giờ, số sân, chỗ còn, người đang có mặt, lệ phí; buổi đã đóng không có thanh chỗ', () => {
    const out = html(<SessionCard s={session()} now={NOW} />);
    expect(out).toContain('href="/thi-dau/giao-luu/s1"');
    expect(out).toContain('Hôm nay · 07/10 · 18:30');
    expect(out).toContain('Sắp diễn ra');
    expect(out).toContain('Còn 5/12 chỗ');
    expect(out).toContain('3 người đang có mặt');
    expect(out).toContain('2 sân');
    expect(out).toContain('200.000đ/người');
    const closed = html(<SessionCard s={session({ status: 'closed' })} now={NOW} />);
    expect(closed).toContain('Đã kết thúc');
    expect(closed).toContain('Xem lại');
    expect(closed).not.toContain('progressbar');
  });
});

describe('danh sách đăng ký', () => {
  const entry = (id, players, over = {}) => ({ id, status: 'registered', waitlistReason: null, waitlistPosition: null, registeredAt: '2026-10-01T00:00:00Z', players, mine: false, ...over });
  test('chính thức và danh sách chờ tách riêng; đếm theo người; dòng của mình có dấu "Bạn"', () => {
    const out = html(<EntriesList needsPartner entries={[
      entry('e1', [person('An'), masked('AAAA')], { mine: true }),
      entry('e2', [masked('BBBB'), masked('CCCC')]),
      entry('e3', [person('Bình'), person('Chi')], { status: 'waitlisted', waitlistReason: 'capacity', waitlistPosition: 1 })
    ]} />);
    expect(out).toContain('Danh sách chính thức (4 người)');
    expect(out).toContain('Danh sách chờ (2 người)');
    expect(out).toContain('#1');
    expect(out).toContain('>Bạn<');
    expect(out).toContain('Thành viên BBBB');
    expect(out.match(/data-testid="entry-row"/g)).toHaveLength(3);
  });
  test('chưa ai đăng ký → gợi ý là người / cặp đầu tiên', () => {
    expect(html(<EntriesList entries={[]} needsPartner />)).toContain('cặp');
    expect(html(<EntriesList entries={[]} needsPartner={false} />)).toContain('người đầu tiên');
  });
});

describe('lịch, bảng, thứ hạng', () => {
  const team = (...names) => ({ teamId: 'x', players: names.map((n) => person(n)) });
  test('lịch gom theo bảng; trận đang đánh có huy hiệu + tỉ số trực tiếp; trận xong tô đậm đội thắng', () => {
    const out = html(<ScheduleList matches={[
      { id: 'm1', stage: 'group', groupNo: 1, slotNo: 1, status: 'in_play', teamA: team('An'), teamB: team('Bình'), games: [], live: { revision: 2, games: [[21, 15]], current: [4, 3] }, courtRef: 'bd:court:2', expectedTime: '08:30', outcome: null, winnerSide: null },
      { id: 'm2', stage: 'group', groupNo: 1, slotNo: 2, status: 'completed', teamA: team('Chi'), teamB: team('Dũng'), games: [[21, 10]], live: null, outcome: 'normal', winnerSide: 'B', courtRef: null },
      { id: 'm3', stage: 'group', groupNo: 1, slotNo: 3, status: 'scheduled', teamA: null, teamB: team('Em'), games: [], live: null, outcome: null, winnerSide: null }
    ]} />);
    expect(out).toContain('Vòng bảng — Bảng 1');
    expect(out).toContain('Đang đánh');
    expect(out).toContain('21–15, 4–3');
    expect(out).toContain('21–10');
    expect(out).toContain('chờ xác định');
    expect(out.match(/data-testid="match-row"/g)).toHaveLength(3);
    expect(html(<ScheduleList matches={[]} />)).toContain('Chưa có lịch thi đấu');
  });
  test('bảng xếp hạng nhiều bảng có tiêu đề từng bảng; đội đã rút mờ + nhãn', () => {
    const out = html(<StandingsTables roundRobin={false} groups={[
      { groupNo: 1, rows: [{ rank: 1, played: 2, wins: 2, losses: 0, gameDiff: 4, pointDiff: 20, team: { id: 'a', players: [person('An')], withdrawn: false } }] },
      { groupNo: 2, rows: [{ rank: 1, played: 2, wins: 1, losses: 1, gameDiff: 0, pointDiff: 1, team: { id: 'b', players: [masked('9999')], withdrawn: true } }] }
    ]} />);
    expect(out).toContain('Bảng 1');
    expect(out).toContain('Bảng 2');
    expect(out).toContain('đã rút');
    expect(out).toContain('Thành viên 9999');
    expect(html(<StandingsTables groups={[]} />)).toBe('');
  });
  test('thứ hạng chung cuộc: cúp cho hạng 1', () => {
    const out = html(<PlacementsCard placements={[{ teamId: 't', from: 1, to: 1, label: 'Vô địch', reachedKnockout: true, wins: 3, players: [person('An')] }, { teamId: 'u', from: 2, to: 2, label: 'Á quân', reachedKnockout: true, wins: 2, players: [person('Bình')] }]} />);
    expect(out).toContain('🏆 Vô địch');
    expect(out).toContain('Á quân');
    expect(html(<PlacementsCard placements={[]} />)).toContain('Chưa có kết quả chung cuộc');
  });
});

describe('buổi giao lưu: đăng ký + bảng sân', () => {
  test('danh sách đăng ký: trạng thái giữ chỗ / chờ có thứ tự / đã đến; mine', () => {
    const out = html(<SignupList maxPlayers={12} signups={[
      { id: 's1', status: 'registered', waitlistPosition: null, player: person('An'), mine: true },
      { id: 's2', status: 'waitlisted', waitlistPosition: 1, player: masked('0001'), mine: false },
      { id: 's3', status: 'attended', waitlistPosition: null, player: person('Bình'), mine: false }
    ]} />);
    expect(out).toContain('Đã đăng ký (3/12)');
    expect(out).toContain('Giữ chỗ');
    expect(out).toContain('Đang chờ #1');
    expect(out).toContain('Đã đến');
    expect(out).toContain('>Bạn<');
  });
  test('bảng sân: sân đang đánh có tỉ số, sân trống, sắp vào sân, hàng chờ, kết quả gần đây', () => {
    const board = {
      session: { id: 's1', name: 'x', status: 'open', format: 'doubles', mode: 'balanced', rated: false, rounds: 1 },
      serverTime: '2026-10-07T03:00:00Z',
      courts: [
        { courtRef: 'bd:court:1', status: 'busy', match: { id: 'm1', status: 'in_play', games: [], live: { revision: 3, games: [], current: [11, 9] }, teamA: { teamId: null, players: [person('An'), person('Bình')] }, teamB: { teamId: null, players: [person('Chi'), masked('7777')] } } },
        { courtRef: 'bd:court:2', status: 'free', match: null }
      ],
      upcoming: [{ courtRef: 'bd:court:2', sideA: [person('Em')], sideB: [person('Giang')] }],
      queue: [{ position: 1, player: person('Hải'), gamesPlayed: 1, waitingSince: null, next: true }],
      recent: [{ id: 'm0', stage: 'session', status: 'completed', games: [[21, 18]], teamA: { teamId: null, players: [person('Ka')] }, teamB: { teamId: null, players: [person('Lan')] }, winnerSide: 'A', outcome: 'normal', live: null }],
      counts: { present: 6, onCourt: 4, waiting: 2 }
    };
    const out = html(<SessionBoardView board={board} />);
    expect(out).toContain('11–9');
    expect(out).toContain('Thành viên 7777');
    expect(out).toContain('Sân đang trống');
    expect(out).toContain('Sắp vào sân');
    expect(out).toContain('Hàng chờ (1)');
    expect(out).toContain('sắp vào');
    expect(out).toContain('Kết quả gần đây');
    expect(out).toContain('6 người có mặt');
    expect(out.match(/data-testid="court-card"/g)).toHaveLength(2);
    expect(html(<SessionBoardView board={null} />)).toContain('Chưa tải được');
    const closed = html(<SessionBoardView board={{ ...board, session: { ...board.session, status: 'closed' }, upcoming: [], queue: [] }} />);
    expect(closed).not.toContain('Hàng chờ');
    expect(closed).not.toContain('Sắp vào sân');
  });
});

describe('khung đăng ký (RegistrationPanel / SessionSignupPanel)', () => {
  const customer = { id: 1, fullName: 'Khách', role: { name: 'customer' } };
  const staff = { id: 2, fullName: 'NV', role: { name: 'employee' } };
  test('chưa đăng nhập → nút đăng nhập + tạo tài khoản (quay lại đúng trang), có lệ phí và gợi ý cặp', () => {
    const out = html(<RegistrationPanel t={tournament()} user={null} />);
    expect(out).toContain('Đăng nhập để đăng ký');
    expect(out).toContain('Tạo tài khoản');
    expect(out).toContain('200.000đ/người');
    expect(out).toContain('cả cặp trong một lần');
    expect(out).toContain('Còn 3/8 chỗ');
  });
  test('nhân viên → chỉ dẫn đăng ký hộ ở trang quản lý; giải đã chốt → không có nút đăng ký', () => {
    expect(html(<RegistrationPanel t={tournament()} user={staff} />)).toContain('/competition/tournaments/t1');
    const done = html(<RegistrationPanel t={tournament({ status: 'finalized', registration: { open: false, needsPartner: true, registered: 8, waitlisted: 0, maxEntries: 8, spotsLeft: 0 } })} user={null} />);
    expect(done).toContain('Giải đã kết thúc');
    expect(done).not.toContain('Đăng nhập để đăng ký');
  });
  test('khách: chưa đăng ký → nút Đăng ký cả cặp (khi có hành động); đã đăng ký → trạng thái của mình + nút rút; chờ → thứ tự', () => {
    const open = html(<RegistrationPanel t={tournament()} user={customer} onRegister={() => {}} />);
    expect(open).toContain('Đăng ký cả cặp');
    const mine = html(<RegistrationPanel t={tournament({ me: { canWithdraw: true, entry: { id: 'e', status: 'registered', waitlistPosition: null, players: [person('An'), person('Bình')], mine: true } } })} user={customer} onWithdraw={() => {}} onRegister={() => {}} />);
    expect(mine).toContain('Bạn đã đăng ký');
    expect(mine).toContain('Cặp: An &amp; Bình');
    expect(mine).toContain('Rút khỏi giải');
    expect(mine).not.toContain('Đăng ký cả cặp');
    const waiting = html(<RegistrationPanel t={tournament({ me: { canWithdraw: true, entry: { id: 'e', status: 'waitlisted', waitlistPosition: 2, players: [person('An')], mine: true } } })} user={customer} onWithdraw={() => {}} />);
    expect(waiting).toContain('danh sách chờ — thứ 2');
    const locked = html(<RegistrationPanel t={tournament({ me: { canWithdraw: false, entry: { id: 'e', status: 'registered', waitlistPosition: null, players: [person('An')], mine: true } } })} user={customer} onWithdraw={() => {}} />);
    expect(locked).toContain('liên hệ nhân viên');
    expect(locked).not.toContain('Rút khỏi giải');
  });
  test('hết chỗ → nút "Vào danh sách chờ"', () => {
    const t = tournament({ registration: { open: true, needsPartner: false, registered: 8, waitlisted: 1, maxEntries: 8, spotsLeft: 0 } });
    expect(html(<RegistrationPanel t={t} user={customer} onRegister={() => {}} />)).toContain('Vào danh sách chờ');
  });
  test('buổi giao lưu: đăng nhập / tham gia / giữ chỗ + huỷ / đã đến / đã đóng', () => {
    expect(html(<SessionSignupPanel s={session()} user={null} />)).toContain('Đăng nhập để tham gia');
    expect(html(<SessionSignupPanel s={session()} user={customer} onSignUp={() => {}} />)).toContain('Tham gia buổi này');
    expect(html(<SessionSignupPanel s={session({ signup: { open: true, maxPlayers: 4, registered: 4, waitlisted: 0, spotsLeft: 0 } })} user={customer} onSignUp={() => {}} />)).toContain('Vào danh sách chờ');
    const mine = html(<SessionSignupPanel s={session({ me: { status: 'registered', waitlistPosition: null, canCancel: true } })} user={customer} onCancel={() => {}} onSignUp={() => {}} />);
    expect(mine).toContain('Bạn đã đăng ký giữ chỗ');
    expect(mine).toContain('Huỷ đăng ký');
    expect(mine).not.toContain('Tham gia buổi này');
    const attended = html(<SessionSignupPanel s={session({ me: { status: 'attended', waitlistPosition: null, canCancel: false } })} user={customer} onCancel={() => {}} />);
    expect(attended).toContain('đã điểm danh');
    expect(attended).not.toContain('Huỷ đăng ký');
    const closed = html(<SessionSignupPanel s={session({ status: 'closed' })} user={customer} onSignUp={() => {}} />);
    expect(closed).toContain('đã kết thúc');
    expect(closed).not.toContain('Tham gia buổi này');
  });
});

describe('đăng ký online (plan 27, p4)', () => {
  test('RegisterDialog mở ra thì kiểm tra hồ sơ trước, chưa hiện form', () => {
    const out = html(<RegisterDialog t={tournament()} onClose={() => {}} onDone={() => {}} />);
    expect(out).toContain('Đăng ký: Giải mùa thu');
    expect(out).toContain('Đang kiểm tra hồ sơ của bạn');
    expect(out).not.toContain('guest-form');
  });
  test('GuestForm: đủ ô, báo lỗi theo ô, nói rõ SĐT chỉ nhân viên thấy', () => {
    const empty = { name: '', phone: '', gender: '', level: '' };
    const out = html(<GuestForm value={empty} onChange={() => {}} errors={{ phone: 'Số điện thoại di động gồm 10 số', level: 'Chọn mức trình gần đúng' }} />);
    expect(out).toContain('Họ tên đồng đội');
    expect(out).toContain('chỉ nhân viên thấy');
    expect(out).toContain('Số điện thoại di động gồm 10 số');
    expect(out).toContain('Chọn mức trình gần đúng');
    expect(out).toContain('Mới chơi (1.5)');
    expect(out).toContain('nhân viên sẽ xác nhận lại');
    expect(html(<GuestForm value={empty} onChange={() => {}} errors={{}} />)).not.toContain('role="alert"');
  });
  test('nhân viên thấy dấu "đăng ký online" và liên hệ đồng đội khách; người nhân viên nhập thì không', () => {
    const self = { id: 'e1', via: 'self', source: null, contactPhone: null, name: 'An' };
    const guest = { id: 'e2', via: 'self', source: 'online_guest', contactPhone: '0912345678', name: 'Bích' };
    const staff = { id: 'e3', via: 'staff', source: null, contactPhone: null, name: 'Cường' };
    const pair = html(<OnlineTags unit={[self, guest]} />);
    expect(pair).toContain('đăng ký online');
    expect(pair).toContain('đồng đội khách');
    expect(pair).toContain('Bích · SĐT 0912 345 678');
    expect(html(<OnlineTags unit={[staff]} />)).toBe('');
  });
  test('đếm đăng ký online: cặp ở giải đôi cặp cố định, người ở giải khác, bỏ người đã rút', () => {
    const e = (id, via, status = 'registered') => ({ id, via, status });
    const pairs = [[e('a', 'self'), e('b', 'self')], [e('c', 'staff'), e('d', 'staff')], [e('x', 'self', 'withdrawn'), e('y', 'self', 'withdrawn')], [e('p', 'staff'), e('q', 'self')]];
    expect(onlineCount(pairs, pairs.flat(), true)).toBe(2); // cặp 1 và cặp 4 (một người online đã đủ)
    const singles = [e('s1', 'self'), e('s2', 'staff'), e('s3', 'self'), e('s4', 'self', 'withdrawn')];
    expect(onlineCount(singles.map((x) => [x]), singles, false)).toBe(2);
    expect(onlineCount([], [], true)).toBe(0);
  });
  test('SignupRow: giữ chỗ → điểm danh + gỡ; chờ → thứ mấy; đã đến → không nút; buổi đóng → không nút', () => {
    const base = { id: 'g1', playerId: 'p1', name: 'An', rating: 3.25, flags: [], present: false };
    const reg = html(<SignupRow r={{ ...base, status: 'registered' }} open operate />);
    expect(reg).toContain('Đã giữ chỗ');
    expect(reg).toContain('Điểm danh');
    expect(reg).toContain('Gỡ');
    expect(reg).toContain('3.25');
    const wait = html(<SignupRow r={{ ...base, status: 'waitlisted', waitlistPosition: 2 }} open operate />);
    expect(wait).toContain('Đang chờ · thứ 2');
    expect(wait).not.toContain('Điểm danh');
    expect(wait).toContain('Gỡ');
    const came = html(<SignupRow r={{ ...base, status: 'attended', present: true }} open operate />);
    expect(came).toContain('Đã đến');
    expect(came).not.toContain('Gỡ');
    const closed = html(<SignupRow r={{ ...base, status: 'registered' }} open={false} operate />);
    expect(closed).not.toContain('Điểm danh');
    const unrated = html(<SignupRow r={{ ...base, status: 'registered', rating: null, flags: ['quick'] }} open operate />);
    expect(unrated).toContain('chưa có điểm');
    expect(unrated).toContain('chưa xác nhận trình');
    expect(html(<SignupRow r={{ ...base, status: 'registered' }} open operate={false} />)).not.toContain('Điểm danh');
  });
});
