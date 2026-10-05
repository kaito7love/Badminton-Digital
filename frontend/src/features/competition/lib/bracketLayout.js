// Hình học sơ đồ loại trực tiếp dạng hình (plan 21), tách khỏi giao diện để test được. Chuyển từ
// services/competition-service/docs/ui-prototype/bracket-view.js (đã bấm thử trên bàn thử).
//
// Dữ liệu vào: `rounds` = `data.rounds` của GET /tournaments/:id/bracket (mỗi vòng có `matches[]` với roundNo, bracketPos, label,
// teamA, teamB, games, outcome, winnerSide, status). Vòng 1 không có trận cho ô miễn đấu — module tự dựng lại.
//   ≤ 16 ô (đến 16 đội) → một chiều, trái → phải, cúp + "VÔ ĐỊCH" bên phải (tông xanh lá)
//   ≥ 32 ô (17–32+ đội) → đối xứng hai nửa, hai ô chung kết + cúp + ô vô địch ở giữa (tông vàng đồng)

export const THIRD_PLACE = 'Tranh hạng 3';

export const roundName = (plates) => (plates === 2 ? 'Chung kết' : plates === 4 ? 'Bán kết' : plates === 8 ? 'Tứ kết' : `Vòng 1/${plates / 2}`);

/** Một ô (cột c, chỉ số i trong cột) → nội dung. Trả { team, state, win, lose, live, matchId, score, note, text, tag }. */
const plateInfo = ({ c, i, R, at, pick }) => {
  if (c > R) {
    const f = at(R, 1);
    if (f && f.status === 'completed' && f.winnerSide) {
      return { team: f.winnerSide === 'A' ? f.teamA : f.teamB, state: 'has', win: true, champ: true };
    }
    return { team: null, state: 'pend', champ: true, text: 'chờ vô địch' };
  }
  const m = at(c, (i >> 1) + 1);
  const side = i & 1 ? 'B' : 'A';
  if (m) {
    const team = side === 'A' ? m.teamA : m.teamB;
    if (!team && pick && c === 1) return { team: null, state: 'bye', text: 'miễn đấu' };
    const done = m.status === 'completed' && m.winnerSide && team;
    let score = (m.games || []).map((x) => x[side === 'A' ? 0 : 1]).join(' ');
    if (m.status === 'completed' && m.outcome === 'walkover') score = 'W.O.';
    else if (m.status === 'completed' && m.outcome && m.outcome !== 'normal' && !score) score = 'BC';
    return {
      team,
      state: team ? 'has' : 'pend',
      win: Boolean(done && m.winnerSide === side),
      lose: Boolean(done && m.winnerSide !== side),
      live: m.status === 'in_play',
      matchId: m.id,
      score,
      text: 'chờ đội thắng'
    };
  }
  if (c === 1) {
    if (i & 1) return { team: null, state: 'bye', text: 'miễn đấu' };
    const k = i >> 1;
    const next = at(2, (k >> 1) + 1);
    const team = next ? (k & 1 ? next.teamB : next.teamA) : null;
    return { team, state: team ? 'has' : 'pend', win: Boolean(team), note: team ? 'miễn đấu — đi thẳng' : null, text: 'chờ xác định' };
  }
  return { team: null, state: 'pend', text: 'chờ đội thắng' };
};

/**
 * @param rounds `data.rounds`
 * @param opts { rounds?: số vòng (xem trước: truyền khi chưa có trận), doubles?, pick? (xem trước: ô vòng 1 bấm được), selected?, tone? }
 * @returns null nếu không có gì để vẽ
 */
export const buildBracketLayout = (rounds, opts = {}) => {
  const flat = (rounds || []).flatMap((r) => r.matches);
  const third = flat.find((m) => m.label === THIRD_PLACE) || null;
  const mains = flat.filter((m) => m.label !== THIRD_PLACE);
  const R = opts.rounds || Math.max(0, ...mains.map((m) => m.roundNo));
  if (!R) return null;
  const size = 2 ** R;
  const pick = Boolean(opts.pick);
  const at = (r, k) => mains.find((x) => x.roundNo === r && x.bracketPos === k) || null;
  const doubles = Boolean(opts.doubles) || flat.some((m) => [m.teamA, m.teamB].some((t) => t && t.players.length > 1));
  const two = R >= 5;
  const H = doubles ? 42 : 32;
  const W = two ? 176 : 206;
  const G = two ? 30 : 46;
  const pitch = H + (two ? 6 : 10);
  const LAB = 26;

  const plates = [];
  const paths = [];
  const labels = [];
  const pos = new Map();
  const P = (c, i) => pos.get(`${c}:${i}`);
  let totalW;
  let totalH;
  let cup;
  let caption = null;
  let thirdBox = null;

  const place = (c, i, x, y, left, w = W, kind = '') => {
    pos.set(`${c}:${i}`, { x, y, left, w });
    plates.push({ c, i, x, y: y - H / 2, w, h: H, kind, ...plateInfo({ c, i, R, at, pick }), pickIndex: pick && c === 1 ? i : null, selected: pick && c === 1 && opts.selected === i });
  };

  // Nối hai ô cùng một trận tới ô thắng; hi = bên đã thắng.
  const link = (c, k, target) => {
    const a = P(c, 2 * k);
    const b = P(c, 2 * k + 1);
    if (!a || !b || !target) return;
    const m = at(c, k + 1);
    const win = m && m.status === 'completed' ? m.winnerSide : null;
    const xa = a.left ? a.x + a.w : a.x;
    const xt = a.left ? target.x : target.x + target.w;
    const xm = (xa + xt) / 2;
    const yt = target.y;
    paths.push({ d: `M${xa} ${a.y}H${xm}V${yt}`, hi: win === 'A' });
    paths.push({ d: `M${xa} ${b.y}H${xm}V${yt}`, hi: win === 'B' });
    paths.push({ d: `M${xm} ${yt}H${xt}`, hi: Boolean(win) });
  };

  if (!two) {
    const colX = (c) => (c - 1) * (W + G);
    for (let i = 0; i < size; i += 1) place(1, i, colX(1), i * pitch + pitch / 2, true);
    for (let c = 2; c <= R + 1; c += 1) {
      const n = size >> (c - 1);
      for (let i = 0; i < n; i += 1) place(c, i, colX(c), (P(c - 1, 2 * i).y + P(c - 1, 2 * i + 1).y) / 2, true, W, c === R + 1 ? 'champ' : '');
    }
    for (let c = 1; c <= R; c += 1) for (let k = 0; k < size >> c; k += 1) link(c, k, P(c + 1, k));
    for (let c = 1; c <= R; c += 1) labels.push({ x: colX(c), w: W, text: roundName(size >> (c - 1)) });
    totalW = (R + 1) * (W + G) - G;
    const ch = P(R + 1, 0);
    const cupTop = ch.y - H / 2 - 128;
    const shift = LAB + Math.max(0, -cupTop);
    totalH = size * pitch + shift;
    cup = { x: ch.x + W / 2 - 43, y: ch.y - H / 2 - 128 + shift, w: 86 };
    plates.forEach((p) => { p.y += shift; });
    paths.forEach((p) => { p.shift = shift; });
    if (third) {
      const ty = ch.y + shift + H + 26;
      thirdBox = { match: third, x: ch.x, y: ty, w: W };
      totalH = Math.max(totalH, ty + 70);
    }
  } else {
    const n1 = size / 2;
    const sideH = n1 * pitch;
    const cx0 = (R - 1) * (W + G);
    totalW = 2 * (R - 1) * (W + G) + W;
    const xL = (c) => (c - 1) * (W + G);
    const xR = (c) => totalW - W - (c - 1) * (W + G);
    for (let s = 0; s < 2; s += 1) {
      const left = s === 0;
      for (let j = 0; j < n1; j += 1) place(1, s * n1 + j, left ? xL(1) : xR(1), j * pitch + pitch / 2, left);
      for (let c = 2; c <= R - 1; c += 1) {
        const cnt = size >> (c - 1);
        for (let j = 0; j < cnt / 2; j += 1) {
          const i = s * (cnt / 2) + j;
          place(c, i, left ? xL(c) : xR(c), (P(c - 1, 2 * i).y + P(c - 1, 2 * i + 1).y) / 2, left);
        }
      }
    }
    const yA = sideH / 2 - (H / 2 + 6);
    const yB = sideH / 2 + (H / 2 + 6);
    place(R, 0, cx0, yA, true, W, 'fin');
    place(R, 1, cx0, yB, false, W, 'fin');
    for (let c = 1; c <= R - 1; c += 1) for (let k = 0; k < size >> c; k += 1) link(c, k, P(c + 1, k));
    const f = at(R, 1);
    paths.push({ d: `M${cx0 + W / 2} ${yA + H / 2}V${yB - H / 2}`, hi: Boolean(f && f.status === 'completed') });
    for (let c = 1; c <= R - 1; c += 1) {
      const text = roundName(size >> (c - 1));
      labels.push({ x: xL(c), w: W, text });
      labels.push({ x: xR(c), w: W, text });
    }
    const cw = 110;
    cup = { x: cx0 + W / 2 - cw / 2, y: 0, w: cw };
    const champY = (cw * 124) / 100 + 6 + H / 2;
    place(R + 1, 0, cx0, champY, true, W, 'champ');
    caption = { x: cx0, w: W, y: yA - H / 2 - 34, text: 'Chung kết', sub: opts.title || '' };
    totalH = sideH + LAB;
    if (third) thirdBox = { match: third, x: cx0, y: yB + H / 2 + 22, w: W };
    const shift = LAB;
    plates.forEach((p) => { p.y += shift; });
    paths.forEach((p) => { p.shift = shift; });
    cup.y += shift;
    caption.y += shift;
    if (thirdBox) thirdBox.y += shift;
  }

  // Đường vẽ: đường thường trước, đường của đội thắng (hi) sau để nằm trên.
  const orderedPaths = [...paths.filter((p) => !p.hi), ...paths.filter((p) => p.hi)].map((p) => ({ d: p.d, hi: p.hi, shift: p.shift || 0 }));
  return {
    R,
    size,
    two,
    doubles,
    tone: opts.tone || (two ? 'gold' : 'green'),
    totalW,
    totalH,
    plates,
    paths: orderedPaths,
    labels,
    cup,
    caption,
    third: thirdBox
  };
};
