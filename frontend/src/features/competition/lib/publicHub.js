import { FORMAT, GENDER, MODE, PAIRING } from './labels';
import { rulesText } from './format';

// Logic thuần của khu công khai "Thi đấu" (/thi-dau — plan 27): nhãn, ngày giờ, chỗ còn, nhóm lịch đấu. Không đụng React nên test được.
// Dữ liệu vào là hình dạng của API công khai (docs/02 mục 2.10 / 2.11): giải `{ registration, me }`, buổi `{ signup, me, players }`.

/** Lệ phí hiển thị TẠM CỐ ĐỊNH 200.000đ/người cho cả giải và buổi giao lưu (chủ dự án chốt; chưa thu / ghi nhận online — plan 27 mục 8.1). */
export const FEE_PER_PERSON_VND = 200000;
export const formatVnd = (amount) => `${Number(amount).toLocaleString('vi-VN')}đ`;
export const feeText = () => `${formatVnd(FEE_PER_PERSON_VND)}/người`;

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const pad = (n) => String(n).padStart(2, '0');
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);

/** Ngày dạng chữ gần gũi: "Hôm nay · 07/10", "Ngày mai · 08/10", "Thứ bảy · 20/12". `date` = Date hoặc 'YYYY-MM-DD'. */
export const dayText = (date, now = new Date()) => {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00`) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const diff = dayDiff(d, now);
  const dm = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (diff === 0) return `Hôm nay · ${dm}`;
  if (diff === 1) return `Ngày mai · ${dm}`;
  if (diff === -1) return `Hôm qua · ${dm}`;
  return `${WEEKDAYS[d.getDay()]} · ${dm}`;
};

export const tournamentWhen = (t, now = new Date()) => `${dayText(t.startsOn, now)}${t.startTime ? ` · ${t.startTime}` : ''}`;

export const sessionWhen = (iso, now = new Date()) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${dayText(d, now)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Buổi giao lưu: đang diễn ra (đã tới giờ) / sắp diễn ra / đã đóng. */
export const sessionPhase = (s, now = new Date()) => {
  if (s.status !== 'open') return 'closed';
  return new Date(s.startsAt).getTime() <= now.getTime() ? 'live' : 'soon';
};
export const SESSION_PHASE = {
  live: ['Đang diễn ra', 'emerald'],
  soon: ['Sắp diễn ra', 'sky'],
  closed: ['Đã kết thúc', 'slate']
};

// ---------- đăng ký giải ----------

/** Tình trạng đăng ký của một giải để vẽ huy hiệu + nút: open (còn chỗ) · full (hết chỗ, vẫn vào danh sách chờ) · closed (đã bốc thăm) · live · done. */
export const registrationState = (t) => {
  const reg = t.registration || {};
  if (t.status === 'open') {
    const full = reg.maxEntries && reg.spotsLeft === 0;
    return full
      ? { key: 'full', label: 'Hết chỗ — nhận danh sách chờ', tone: 'amber', canRegister: true }
      : { key: 'open', label: 'Đang mở đăng ký', tone: 'emerald', canRegister: true };
  }
  if (t.status === 'drawn') return { key: 'closed', label: 'Đã chốt danh sách', tone: 'sky', canRegister: false };
  if (t.status === 'in_progress') return { key: 'live', label: 'Đang thi đấu', tone: 'amber', canRegister: false };
  if (t.status === 'finalized') return { key: 'done', label: 'Đã kết thúc', tone: 'slate', canRegister: false };
  return { key: 'closed', label: 'Không nhận đăng ký', tone: 'slate', canRegister: false };
};

/** Chỗ còn: "Còn 3/16 chỗ", "Hết chỗ · 2 người chờ", "12 người đã đăng ký" (không giới hạn). Đếm theo NGƯỜI. */
export const spotsText = (reg) => {
  if (!reg) return '';
  if (reg.maxEntries) {
    if (reg.spotsLeft > 0) return `Còn ${reg.spotsLeft}/${reg.maxEntries} chỗ`;
    return reg.waitlisted > 0 ? `Hết chỗ · ${reg.waitlisted} người chờ` : 'Hết chỗ';
  }
  return reg.registered > 0 ? `${reg.registered} người đã đăng ký` : 'Chưa có ai đăng ký';
};

/** Tỉ lệ lấp đầy 0..1 cho thanh tiến độ; không giới hạn → null. */
export const fillRatio = (reg) => {
  if (!reg || !reg.maxEntries) return null;
  return Math.min(1, Math.max(0, (reg.maxEntries - (reg.spotsLeft ?? 0)) / reg.maxEntries));
};

/** Trạng thái đăng ký của CHÍNH MÌNH (`me` ở chi tiết giải): câu ngắn + sắc thái. */
export const myTournamentText = (me) => {
  if (!me || !me.entry) return null;
  const e = me.entry;
  const pair = e.players && e.players.length > 1 ? e.players.map((p) => p.name).join(' & ') : '';
  if (e.status === 'waitlisted') {
    return { tone: 'amber', text: e.waitlistPosition ? `Bạn đang trong danh sách chờ — thứ ${e.waitlistPosition}` : 'Bạn đang trong danh sách chờ', pair };
  }
  return { tone: 'emerald', text: 'Bạn đã đăng ký', pair };
};

export const ratingRuleText = (rule) => {
  if (!rule) return 'Không giới hạn trình';
  const who = rule.scope === 'team_sum' ? 'Tổng trình cặp' : 'Trình mỗi người';
  const hasMin = rule.min !== null && rule.min !== undefined;
  const hasMax = rule.max !== null && rule.max !== undefined;
  if (hasMin && hasMax) return `${who} từ ${rule.min} đến ${rule.max}`;
  if (hasMax) return `${who} tối đa ${rule.max}`;
  return `${who} tối thiểu ${rule.min}`;
};

export const disciplineLabel = (t) => `${t.discipline === 'doubles' ? 'Đôi' : 'Đơn'}${GENDER[t.genderRule] && t.genderRule !== 'open' ? ` ${GENDER[t.genderRule]}` : ''}`;

/** Các dòng "thông tin giải" cho lưới chi tiết. */
export const tournamentFacts = (t) => {
  const rows = [
    ['Nội dung', disciplineLabel(t)],
    ['Thể thức', FORMAT[t.format] || t.format],
    ['Điều kiện trình', ratingRuleText(t.ratingRule)],
    ['Luật điểm', rulesText(t.scoring)]
  ];
  if (t.discipline === 'doubles') rows.splice(2, 0, ['Cách ghép cặp', PAIRING[t.pairingMode] || t.pairingMode]);
  rows.push(['Số sân', `${t.courtCount} sân`]);
  rows.push(['Lệ phí dự kiến', `${feeText()} — thanh toán tại quầy`]);
  return rows;
};

export const sessionFacts = (s) => [
  ['Hình thức', s.format === 'singles' ? 'Đánh đơn' : 'Đánh đôi'],
  ['Cách xếp sân', MODE[s.mode] || s.mode],
  ['Số sân', `${s.courtCount} sân`],
  ['Luật điểm', rulesText(s.scoring)],
  ['Tính điểm trình', s.rated ? 'Có (hệ số 0.5)' : 'Không'],
  ['Lệ phí dự kiến', `${feeText()} — thanh toán tại quầy`]
];

// ---------- giao lưu ----------

/** Chỗ của buổi giao lưu từ `signup`: "Còn 4/12 chỗ" · "Hết chỗ · 2 người chờ" · "5 người đã đăng ký". */
export const sessionSpotsText = (signup) => {
  if (!signup) return '';
  if (signup.maxPlayers) {
    if (signup.spotsLeft > 0) return `Còn ${signup.spotsLeft}/${signup.maxPlayers} chỗ`;
    return signup.waitlisted > 0 ? `Hết chỗ · ${signup.waitlisted} người chờ` : 'Hết chỗ';
  }
  return signup.registered > 0 ? `${signup.registered} người đã đăng ký` : 'Chưa có ai đăng ký';
};
export const sessionFillRatio = (signup) => {
  if (!signup || !signup.maxPlayers) return null;
  return Math.min(1, Math.max(0, (signup.maxPlayers - (signup.spotsLeft ?? 0)) / signup.maxPlayers));
};

export const mySessionText = (me) => {
  if (!me) return null;
  if (me.status === 'attended') return { tone: 'emerald', text: 'Bạn đã điểm danh tại sân' };
  if (me.status === 'waitlisted') return { tone: 'amber', text: me.waitlistPosition ? `Bạn đang chờ — thứ ${me.waitlistPosition}` : 'Bạn đang chờ chỗ' };
  return { tone: 'emerald', text: 'Bạn đã đăng ký giữ chỗ' };
};

// ---------- lịch thi đấu ----------

const STAGE_ORDER = { group: 0, knockout: 1, extra: 2, session: 3 };

/**
 * Gom trận của giải thành các khối: "Vòng bảng — Bảng A", "Loại trực tiếp — Tứ kết", "Trận thêm"… theo thứ tự đánh; trong khối: đang đánh trước, rồi theo lượt.
 * Trả [{ key, title, matches }].
 */
export const groupSchedule = (matches) => {
  const list = [...(matches || [])].filter((m) => m.status !== 'cancelled');
  const sections = new Map();
  for (const m of list) {
    let key;
    let title;
    if (m.stage === 'group') {
      key = `g${m.groupNo ?? 0}`;
      title = m.groupNo ? `Vòng bảng — Bảng ${m.groupNo}` : 'Vòng đấu';
    } else if (m.stage === 'knockout') {
      key = `k${m.roundNo ?? 0}${m.label === 'Tranh hạng 3' ? 'b' : ''}`;
      title = m.label === 'Tranh hạng 3' ? 'Tranh hạng 3' : `Loại trực tiếp — vòng ${m.roundNo ?? ''}`.trim();
    } else {
      key = m.stage;
      title = 'Trận thêm';
    }
    if (!sections.has(key)) sections.set(key, { key, title, order: [STAGE_ORDER[m.stage] ?? 9, m.groupNo ?? 0, m.roundNo ?? 0, m.label === 'Tranh hạng 3' ? 1 : 0], matches: [] });
    sections.get(key).matches.push(m);
  }
  const rank = (m) => (m.status === 'in_play' ? 0 : m.status === 'scheduled' ? 1 : 2);
  return [...sections.values()]
    .sort((a, b) => a.order.reduce((acc, v, i) => acc || v - b.order[i], 0))
    .map(({ key, title, matches: ms }) => ({
      key,
      title,
      matches: ms.sort((a, b) => rank(a) - rank(b) || (a.slotNo ?? 0) - (b.slotNo ?? 0) || (a.bracketPos ?? 0) - (b.bracketPos ?? 0))
    }));
};

/** Tỉ số hiện tại của một trận: đã xong → các game; đang bấm điểm → các game xong + game đang đánh; chưa đánh → ''. */
export const scoreText = (m) => {
  if (!m) return '';
  if (m.live && m.status === 'in_play') {
    const done = (m.live.games || []).map((g) => g.join('–'));
    const current = m.live.current ? [m.live.current.join('–')] : [];
    return [...done, ...current].join(', ');
  }
  return (m.games || []).map((g) => g.join('–')).join(', ');
};

/**
 * Ghép tỉ số trực tiếp (từ sự kiện SSE `snapshot` / `score`, khoá theo matchId) vào dữ liệu đã tải: chỉ dùng bản MỚI HƠN (revision lớn hơn) — dữ liệu tải lại
 * về sau có thể đã có tỉ số mới hơn sự kiện cũ. Trận chưa có `live` thì nhận luôn. Trả cùng đối tượng nếu không có gì đổi (React không vẽ lại).
 */
export const withLive = (match, liveMap) => {
  const incoming = match && liveMap ? liveMap[match.id] : null;
  if (!incoming) return match;
  const current = match.live;
  if (current && current.revision >= incoming.revision) return match;
  return { ...match, live: incoming, status: match.status === 'scheduled' ? 'in_play' : match.status };
};
export const withLiveList = (matches, liveMap) => (!liveMap || !Object.keys(liveMap).length ? matches : (matches || []).map((m) => withLive(m, liveMap)));
export const withLiveBoard = (board, liveMap) => {
  if (!board || !liveMap || !Object.keys(liveMap).length) return board;
  return {
    ...board,
    courts: board.courts.map((c) => (c.match ? { ...c, match: withLive(c.match, liveMap) } : c)),
    recent: board.recent
  };
};
/** Sự kiện SSE → bản đồ tỉ số trực tiếp: `snapshot` thay cả bản đồ, `score` thêm / đổi một trận. */
export const liveMapReducer = (map, name, payload) => {
  if (name === 'snapshot') return Object.fromEntries(((payload && payload.matches) || []).map((x) => [x.matchId, x.live]));
  if (name === 'score' && payload && payload.matchId) return { ...map, [payload.matchId]: payload.live };
  return map;
};

/** Đội thắng của trận đã xong: 'A' | 'B' | null (huỷ / chưa xong). */
export const winnerOf = (m) => (m && m.status === 'completed' ? m.winnerSide : null);

// ---------- trang chủ ----------

/** Lọc ô chọn chi nhánh: organizerRef của một chi nhánh (`bd:branch:<id>`), '' = tất cả. */
export const branchRef = (id) => (id ? `bd:branch:${id}` : '');

/** Sắp giải đang mở: còn chỗ lên trước, rồi theo ngày. */
export const sortOpenTournaments = (list) => [...(list || [])].sort((a, b) => {
  const fullA = a.registration && a.registration.maxEntries && a.registration.spotsLeft === 0 ? 1 : 0;
  const fullB = b.registration && b.registration.maxEntries && b.registration.spotsLeft === 0 ? 1 : 0;
  return fullA - fullB || String(a.startsOn).localeCompare(String(b.startsOn)) || String(a.startTime || '').localeCompare(String(b.startTime || ''));
});

/** Tab của trang giải theo trạng thái: chưa bốc thăm chỉ có Đăng ký; có lịch thì thêm Lịch / Bảng; đã chốt thêm Kết quả. */
export const tournamentTabs = (t) => {
  const tabs = [['dangky', 'Đăng ký']];
  if (t.status !== 'open') {
    tabs.push(['lich', 'Lịch & kết quả']);
    tabs.push(['bang', t.format === 'round_robin' ? 'Bảng đấu' : t.format === 'knockout' ? 'Sơ đồ' : 'Bảng & sơ đồ']);
  }
  if (t.status === 'finalized') tabs.push(['ketqua', 'Kết quả chung cuộc']);
  return tabs;
};

/** Đường dẫn đăng nhập rồi quay lại đúng trang này. */
export const loginRedirect = (pathname) => ({ pathname: '/login', state: { from: { pathname } } });

export const hubPaths = {
  home: '/thi-dau',
  tournament: (id) => `/thi-dau/giai/${id}`,
  session: (id) => `/thi-dau/giao-luu/${id}`
};
