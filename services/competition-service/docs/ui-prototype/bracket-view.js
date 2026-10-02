// Sơ đồ loại trực tiếp dạng hình (plan 21) — module độc lập, không phụ thuộc thư viện.
// Bản tham chiếu cho bước 4 (tích hợp vào frontend/src/features/competition/): bàn thử nhúng nguyên file này;
// khi chuyển sang React chỉ cần bọc `BK.render(...)` + `BK.mount(...)` (hoặc viết lại phần dựng theo cùng hình học).
//
//   BK.render(rounds, { title, tone, pick, selected, rounds, doubles, tools }) → chuỗi HTML (tools:false = ẩn nút phóng / thu, dùng cho TV)
//   BK.mount(root, { onMatch(matchId, match), onCell(k) })               → gắn "Vừa màn hình / Cỡ thật" + bấm ô
//
// `rounds` = `data.rounds` của GET /v1/tournaments/:id/bracket (mỗi vòng có `matches[]` gồm roundNo, bracketPos,
// label, teamA, teamB, games, outcome, winnerSide, status). Vòng 1 không có trận cho ô miễn đấu — module tự dựng lại.
//
// Hai kiểu theo cỡ sơ đồ (số ô = 2^vòng):
//   ≤ 16 ô (đến 16 đội)  → một chiều, vòng 1 bên trái → cúp + "VÔ ĐỊCH" bên phải      (tông xanh lá)
//   ≥ 32 ô (17–32+ đội)  → đối xứng hai nửa, hai ô chung kết + cúp ở giữa             (tông vàng đồng)
const BK = (() => {
  let uid = 0;
  const pref = { fit: null }; // null = tự chọn; true / false = người dùng đã bấm
  const THIRD = 'Tranh hạng 3';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
  .bkbox { margin: 0; }
  .bktools { display: flex; gap: 6px; justify-content: flex-end; margin-bottom: 6px; }
  .bktools button { padding: 3px 10px; font-size: 12px; border-radius: 999px; background: transparent; color: inherit; border: 1px solid currentColor; opacity: .6; cursor: pointer; }
  .bktools button.on { opacity: 1; font-weight: 700; }
  .bk { --line: #b9722a; --hi: #ffd166; --p1: #b9bbc2; --p2: #7c7e86; --ptext: #14151a; --w1: #ffe08a; --w2: #d89a1d; --wtext: #1c1300; --accent: #e8b04a; --lab: #d7a24a;
        background: radial-gradient(ellipse at 50% -10%, #2a2a31 0, #101013 55%, #08080a 100%); color: #e5e7eb; border-radius: 14px; padding: 14px; }
  .bk.green { --line: #9aa0aa; --hi: #9cff3a; --p1: #49b926; --p2: #2a7b13; --ptext: #fff; --w1: #b7ff6b; --w2: #5fd21c; --wtext: #0d2a02; --accent: #9cff3a; --lab: #b6e98a; }
  .bkscroll { overflow-x: auto; overflow-y: hidden; }
  .bksizer { position: relative; margin: 0 auto; }
  .bkcanvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .bkcanvas svg.bklines { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
  .bklines path { fill: none; stroke: var(--line); stroke-width: 2; stroke-linejoin: round; }
  .bklines path.hi { stroke: var(--hi); stroke-width: 2.5; }
  .bkp { position: absolute; display: flex; align-items: center; gap: 6px; padding: 0 14px; box-sizing: border-box; background: linear-gradient(180deg, var(--p1), var(--p2)); color: var(--ptext);
         clip-path: polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%); font: 600 12.5px/1.15 system-ui, sans-serif; }
  .bkp .bkn { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .bkp .bkn i { font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bkp .bkn small { font-weight: 500; font-size: 10px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bkp .bks { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 12px; }
  .bkp.pend { opacity: .4; } .bkp.pend .bkn i { font-weight: 500; font-style: italic; }
  .bkp.bye { opacity: .3; } .bkp.bye .bkn i { font-weight: 500; font-style: italic; }
  .bkp.win, .bkp.champ.has { background: linear-gradient(180deg, var(--w1), var(--w2)); color: var(--wtext); }
  .bkp.lose { opacity: .5; }
  .bkp.live::after { content: ''; flex: none; width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: bkpulse 1.2s infinite; }
  .bkp.sel { background: linear-gradient(180deg, #fbbf24, #d97706) !important; color: #1c1300; opacity: 1; }
  .bkp.fin { background: linear-gradient(180deg, #ffe08a, #c98a1b); color: #1c1300; }
  .bkp.fin.pend { background: linear-gradient(180deg, #8c7a49, #5e5130); color: #e5e7eb; }
  .bkp.champ { font-size: 14px; justify-content: center; text-align: center; }
  .bkp.champ .bkn { align-items: center; }
  .bkp.champ.has { box-shadow: none; }
  .bkp[data-bm], .bkp[data-k] { cursor: pointer; }
  .bkp[data-bm]:hover, .bkp[data-k]:hover { filter: brightness(1.15); }
  .bklab { position: absolute; text-align: center; font: 700 11px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--lab); opacity: .85; }
  .bkcap { position: absolute; text-align: center; font: 800 15px/1 system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--hi); }
  .bkcap small { display: block; margin-top: 4px; font: 500 11px/1.2 system-ui, sans-serif; letter-spacing: .02em; text-transform: none; color: #9ca3af; }
  .bkcup { position: absolute; filter: drop-shadow(0 4px 10px rgba(255, 190, 40, .35)); }
  .bkthird { position: absolute; box-sizing: border-box; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font: 500 11.5px/1.35 system-ui, sans-serif; background: rgba(255, 255, 255, .04); }
  .bkthird b { display: block; color: var(--lab); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 2px; }
  .bkthird div { display: flex; justify-content: space-between; gap: 6px; } .bkthird div span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bkthird .w { font-weight: 700; color: var(--hi); }
  @keyframes bkpulse { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }`;

  const cup = (w, style) => {
    uid += 1;
    const g = `bkg${uid}`;
    return `<svg class="bkcup" style="${style}" viewBox="0 0 100 124" width="${w}" height="${(w * 124) / 100}" aria-hidden="true">
      <defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".45" stop-color="#e9a820"/><stop offset="1" stop-color="#8d5a0b"/></linearGradient></defs>
      <path d="M22 6H78V40C78 62 64 74 50 76C36 74 22 62 22 40Z" fill="url(#${g})"/>
      <path d="M22 14H9C7 40 20 54 33 57M78 14H91C93 40 80 54 67 57" fill="none" stroke="url(#${g})" stroke-width="6" stroke-linecap="round"/>
      <rect x="44" y="76" width="12" height="20" fill="url(#${g})"/>
      <path d="M28 112H72L67 96H33Z" fill="url(#${g})"/>
      <rect x="22" y="112" width="56" height="9" rx="2" fill="url(#${g})"/>
      <path d="M32 14H40V42C40 52 44 60 50 64" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/></svg>`;
  };

  const roundName = (plates) => (plates === 2 ? 'Chung kết' : plates === 4 ? 'Bán kết' : plates === 8 ? 'Tứ kết' : `Vòng 1/${plates / 2}`);

  const render = (rounds, opts = {}) => {
    const flat = (rounds || []).flatMap((r) => r.matches);
    const third = flat.find((m) => m.label === THIRD) || null;
    const mains = flat.filter((m) => m.label !== THIRD);
    const R = opts.rounds || Math.max(0, ...mains.map((m) => m.roundNo));
    if (!R) return '';
    const size = 2 ** R;
    const at = (r, k) => mains.find((x) => x.roundNo === r && x.bracketPos === k) || null;
    const doubles = Boolean(opts.doubles) || flat.some((m) => [m.teamA, m.teamB].some((t) => t && t.players.length > 1));
    const two = R >= 5; // ≥ 32 ô → đối xứng
    const H = doubles ? 42 : 32;
    const W = two ? 176 : 206;
    const G = two ? 30 : 46;
    const pitch = H + (two ? 6 : 10);
    const LAB = 26;

    // Nội dung một ô (cột c, chỉ số i): đội, trạng thái, tỉ số.
    const info = (c, i) => {
      if (c > R) {
        const f = at(R, 1);
        if (f && f.status === 'completed' && f.winnerSide) return { team: f.winnerSide === 'A' ? f.teamA : f.teamB, cls: 'has champ' };
        return { team: null, cls: 'pend champ', text: 'chờ vô địch' };
      }
      const m = at(c, (i >> 1) + 1);
      const side = i & 1 ? 'B' : 'A';
      if (m) {
        const t = side === 'A' ? m.teamA : m.teamB;
        if (!t && opts.pick && c === 1) return { cls: 'bye', text: 'miễn đấu' };
        let cls = t ? 'has' : 'pend';
        if (m.status === 'completed' && m.winnerSide && t) cls += m.winnerSide === side ? ' win' : ' lose';
        if (m.status === 'in_play') cls += ' live';
        let score = (m.games || []).map((x) => x[side === 'A' ? 0 : 1]).join(' ');
        if (m.status === 'completed' && m.outcome === 'walkover') score = 'W.O.';
        else if (m.status === 'completed' && m.outcome && m.outcome !== 'normal' && !score) score = 'BC';
        return { team: t, cls, m, score, text: 'chờ đội thắng' };
      }
      if (c === 1) {
        if (i & 1) return { cls: 'bye', text: 'miễn đấu' };
        const k = i >> 1;
        const nx = at(2, (k >> 1) + 1);
        const t = nx ? (k & 1 ? nx.teamB : nx.teamA) : null;
        return { team: t, cls: t ? 'has win' : 'pend', note: t ? 'miễn đấu — đi thẳng' : null, text: 'chờ xác định' };
      }
      return { team: null, cls: 'pend', text: 'chờ đội thắng' };
    };

    const plates = [];
    const paths = [];
    const labels = [];
    const extra = [];
    const pos = new Map(); // `${c}:${i}` → { x, y, left }
    const P = (c, i) => pos.get(`${c}:${i}`);
    let totalW;
    let totalH;

    const place = (c, i, x, y, left, w = W, cls = '') => {
      pos.set(`${c}:${i}`, { x, y, left, w });
      plates.push({ c, i, x, y: y - H / 2, w, cls });
    };
    // Nối hai ô cùng một trận tới ô thắng; hi = bên đã thắng.
    const link = (c, k, tg) => {
      const a = P(c, 2 * k);
      const b = P(c, 2 * k + 1);
      if (!a || !b || !tg) return;
      const m = at(c, k + 1);
      const win = m && m.status === 'completed' ? m.winnerSide : null;
      const xa = a.left ? a.x + a.w : a.x;
      const xt = a.left ? tg.x : tg.x + tg.w;
      const xm = (xa + xt) / 2;
      const yt = tg.y;
      const seg = (d, hi) => paths.push({ d, hi });
      seg(`M${xa} ${a.y}H${xm}V${yt}`, win === 'A');
      seg(`M${xa} ${b.y}H${xm}V${yt}`, win === 'B');
      seg(`M${xm} ${yt}H${xt}`, Boolean(win));
    };

    if (!two) {
      const colX = (c) => (c - 1) * (W + G);
      for (let i = 0; i < size; i += 1) place(1, i, colX(1), i * pitch + pitch / 2, true);
      for (let c = 2; c <= R + 1; c += 1) {
        const n = size >> (c - 1);
        for (let i = 0; i < n; i += 1) place(c, i, colX(c), (P(c - 1, 2 * i).y + P(c - 1, 2 * i + 1).y) / 2, true, W, c === R + 1 ? 'champ' : '');
      }
      for (let c = 1; c <= R; c += 1) for (let k = 0; k < size >> c; k += 1) link(c, k, P(c + 1, k));
      for (let c = 1; c <= R; c += 1) labels.push({ x: colX(c), w: W, y: 0, text: roundName(size >> (c - 1)) });
      totalW = (R + 1) * (W + G) - G;
      const ch = P(R + 1, 0);
      const cupTop = ch.y - H / 2 - 128;
      const shift = LAB + Math.max(0, -cupTop);
      totalH = size * pitch + shift;
      extra.push(cup(86, `left:${ch.x + W / 2 - 43}px;top:${ch.y - H / 2 - 128 + shift}px`));
      plates.forEach((p) => { p.y += shift; });
      paths.forEach((p) => { p.shift = shift; });
      if (third) {
        const ty = Math.max(ch.y + shift + H + 26, 0);
        extra.push({ third, x: ch.x, y: ty, w: W });
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
      for (let c = 1; c <= R - 1; c += 1) {
        for (let k = 0; k < size >> c; k += 1) link(c, k, P(c + 1, k));
      }
      // Trận chung kết: nối hai ô chung kết.
      const f = at(R, 1);
      paths.push({ d: `M${cx0 + W / 2} ${yA + H / 2}V${yB - H / 2}`, hi: Boolean(f && f.status === 'completed') });
      for (let c = 1; c <= R - 1; c += 1) {
        const text = roundName(size >> (c - 1));
        labels.push({ x: xL(c), w: W, y: 0, text });
        labels.push({ x: xR(c), w: W, y: 0, text });
      }
      const cw = 110;
      extra.push(cup(cw, `left:${cx0 + W / 2 - cw / 2}px;top:0px`));
      const champY = 0 + (cw * 124) / 100 + 6 + H / 2;
      place(R + 1, 0, cx0, champY, true, W, 'champ');
      extra.push(`<div class="bkcap" style="left:${cx0}px;width:${W}px;top:${yA - H / 2 - 34}px">Chung kết${opts.title ? `<small>${esc(opts.title)}</small>` : ''}</div>`);
      totalH = sideH + LAB;
      if (third) extra.push({ third, x: cx0, y: yB + H / 2 + 22, w: W });
      const shift = LAB;
      plates.forEach((p) => { p.y += shift; });
      paths.forEach((p) => { p.shift = shift; });
      extra.forEach((e, idx) => {
        if (typeof e === 'string') extra[idx] = e.replace(/top:(-?[\d.]+)px/, (_, v) => `top:${Number(v) + shift}px`);
        else e.y += shift;
      });
    }

    const nameHtml = (t) => (t ? t.players.map((p) => `<i>${esc(p.name)}</i>`).join('') : '');
    const plateHtml = (p) => {
      const d = info(p.c, p.i);
      const cls = `${d.cls} ${p.cls}`.trim();
      const attrs = [];
      if (d.m && !opts.pick) attrs.push(`data-bm="${esc(d.m.id)}"`);
      if (opts.pick && p.c === 1) attrs.push(`data-k="${p.i}"`);
      const sel = opts.pick && p.c === 1 && opts.selected === p.i ? ' sel' : '';
      const full = d.team ? d.team.players.map((x) => x.name).join(' + ') : '';
      const body = d.team
        ? `<span class="bkn">${nameHtml(d.team)}${d.team.tag ? `<small>${esc(d.team.tag)}</small>` : ''}${d.note ? `<small>${esc(d.note)}</small>` : ''}</span>`
        : `<span class="bkn"><i>${esc(d.text || '—')}</i></span>`;
      const inner = /\bchamp\b/.test(p.cls) && d.team ? `<span class="bkn"><small style="font-size:10px;letter-spacing:.12em">VÔ ĐỊCH</small>${nameHtml(d.team)}</span>` : body;
      return `<div class="bkp ${cls}${sel}" ${attrs.join(' ')} title="${esc(full)}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${H}px">${inner}${d.score ? `<span class="bks">${esc(d.score)}</span>` : ''}</div>`;
    };
    const thirdHtml = (e) => {
      const m = e.third;
      const row = (t, side) => {
        const g = (m.games || []).map((x) => x[side === 'A' ? 0 : 1]).join(' ');
        const won = m.status === 'completed' && m.winnerSide === side;
        return `<div class="${won ? 'w' : ''}"><span>${t ? esc(t.players.map((p) => p.name).join(' + ')) : 'chờ xác định'}</span><span>${esc(g)}</span></div>`;
      };
      return `<div class="bkthird" ${opts.pick ? '' : `data-bm="${esc(m.id)}"`} style="left:${e.x}px;top:${e.y}px;width:${e.w}px"><b>Tranh hạng 3</b>${row(m.teamA, 'A')}${row(m.teamB, 'B')}</div>`;
    };

    const svg = `<svg class="bklines" width="${totalW}" height="${totalH}">${[false, true].map((hi) => paths.filter((p) => Boolean(p.hi) === hi).map((p) => `<path class="${hi ? 'hi' : ''}" d="${p.d}" transform="translate(0 ${p.shift || 0})"/>`).join('')).join('')}</svg>`;
    const tone = opts.tone || (two ? 'gold' : 'green');
    return `<div class="bkbox">${opts.tools === false ? '' : '<div class="bktools"><button type="button" data-bkfit="1">Vừa màn hình</button><button type="button" data-bkfit="0">Cỡ thật</button></div>'}
      <div class="bk ${tone}"><div class="bkscroll"><div class="bksizer"><div class="bkcanvas" data-w="${totalW}" data-h="${totalH}" style="width:${totalW}px;height:${totalH}px">${svg}
        ${labels.map((l) => `<div class="bklab" style="left:${l.x}px;width:${l.w}px;top:${l.y + 6}px">${esc(l.text)}</div>`).join('')}
        ${extra.map((e) => (typeof e === 'string' ? e : thirdHtml(e))).join('')}
        ${plates.map(plateHtml).join('')}</div></div></div></div></div>`;
  };

  const mount = (root, handlers = {}) => {
    root.querySelectorAll('.bkbox').forEach((box) => {
      const scroll = box.querySelector('.bkscroll');
      const sizer = box.querySelector('.bksizer');
      const canvas = box.querySelector('.bkcanvas');
      const cw = Number(canvas.dataset.w);
      const ch = Number(canvas.dataset.h);
      const apply = () => {
        const f = (scroll.clientWidth || cw) / cw;
        const useFit = pref.fit === null ? f >= 0.5 : pref.fit;
        const s = useFit ? Math.min(1, f) : 1;
        canvas.style.transform = `scale(${s})`;
        sizer.style.width = `${cw * s}px`;
        sizer.style.height = `${ch * s}px`;
        box.querySelectorAll('[data-bkfit]').forEach((b) => b.classList.toggle('on', (b.dataset.bkfit === '1') === (s < 1 || (useFit && f >= 1))));
      };
      box.querySelectorAll('[data-bkfit]').forEach((b) => { b.onclick = () => { pref.fit = b.dataset.bkfit === '1'; apply(); }; });
      canvas.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-k]');
        if (cell && handlers.onCell) { handlers.onCell(Number(cell.dataset.k)); return; }
        const el = e.target.closest('[data-bm]');
        if (el && handlers.onMatch) handlers.onMatch(el.dataset.bm);
      });
      apply();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(scroll);
    });
  };

  if (typeof document !== 'undefined' && !document.getElementById('bk-css')) {
    const st = document.createElement('style');
    st.id = 'bk-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  return { render, mount, pref };
})();
