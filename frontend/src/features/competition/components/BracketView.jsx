import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildBracketLayout } from '../lib/bracketLayout';
import './bracket.css';

// Sơ đồ loại trực tiếp dạng hình (plan 21): tự chọn kiểu theo số ô — một chiều (≤ 16 ô) hoặc đối xứng hai nửa (≥ 32 ô).
// Điện thoại: tự "Vừa màn hình" khi thu nhỏ còn ≥ 50%, không thì "Cỡ thật" + cuộn ngang; người dùng đã bấm nút nào thì giữ lựa chọn.

const prefs = { fit: null }; // null = tự chọn; true / false = người dùng đã bấm (giữ khi trang vẽ lại)

const Cup = ({ x, y, w }) => {
  const g = useId().replace(/:/g, '');
  return (
    <svg className="bkcup" style={{ left: x, top: y }} viewBox="0 0 100 124" width={w} height={(w * 124) / 100} aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" x2="1">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset=".45" stopColor="#e9a820" />
          <stop offset="1" stopColor="#8d5a0b" />
        </linearGradient>
      </defs>
      <path d="M22 6H78V40C78 62 64 74 50 76C36 74 22 62 22 40Z" fill={`url(#${g})`} />
      <path d="M22 14H9C7 40 20 54 33 57M78 14H91C93 40 80 54 67 57" fill="none" stroke={`url(#${g})`} strokeWidth="6" strokeLinecap="round" />
      <rect x="44" y="76" width="12" height="20" fill={`url(#${g})`} />
      <path d="M28 112H72L67 96H33Z" fill={`url(#${g})`} />
      <rect x="22" y="112" width="56" height="9" rx="2" fill={`url(#${g})`} />
      <path d="M32 14H40V42C40 52 44 60 50 64" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
};

const plateClass = (p) => [
  'bkp', p.state, p.win && 'win', p.lose && 'lose', p.live && 'live', p.champ && 'champ', p.kind === 'fin' && 'fin', p.selected && 'sel',
  (p.matchId || p.pickIndex !== null) && 'clickable'
].filter(Boolean).join(' ');

function Plate({ p, onMatch, onCell }) {
  const players = p.team ? p.team.players : [];
  const full = players.map((x) => x.name).join(' + ');
  const champion = p.champ && p.team;
  const click = () => {
    if (p.pickIndex !== null && onCell) onCell(p.pickIndex);
    else if (p.matchId && onMatch) onMatch(p.matchId);
  };
  return (
    <div
      className={plateClass(p)}
      style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
      title={full}
      onClick={p.matchId || p.pickIndex !== null ? click : undefined}
      role={p.matchId || p.pickIndex !== null ? 'button' : undefined}
      data-bm={p.matchId || undefined}
      data-k={p.pickIndex !== null ? p.pickIndex : undefined}
    >
      {p.team ? (
        <span className="bkn">
          {champion && <small style={{ fontSize: 10, letterSpacing: '.12em' }}>VÔ ĐỊCH</small>}
          {players.map((x) => <i key={x.id || x.name}>{x.name}</i>)}
          {!champion && p.team.tag && <small>{p.team.tag}</small>}
          {!champion && p.note && <small>{p.note}</small>}
        </span>
      ) : (
        <span className="bkn"><i>{p.text || '—'}</i></span>
      )}
      {p.score ? <span className="bks">{p.score}</span> : null}
    </div>
  );
}

function ThirdPlace({ box, onMatch }) {
  const m = box.match;
  const row = (team, side) => {
    const g = (m.games || []).map((x) => x[side === 'A' ? 0 : 1]).join(' ');
    const won = m.status === 'completed' && m.winnerSide === side;
    return (
      <div className={won ? 'w' : ''}>
        <span>{team ? team.players.map((x) => x.name).join(' + ') : 'chờ xác định'}</span>
        <span>{g}</span>
      </div>
    );
  };
  return (
    <div
      className={`bkthird ${onMatch ? 'clickable' : ''}`}
      style={{ left: box.x, top: box.y, width: box.w }}
      onClick={onMatch ? () => onMatch(m.id) : undefined}
      data-bm={onMatch ? m.id : undefined}
    >
      <b>Tranh hạng 3</b>
      {row(m.teamA, 'A')}
      {row(m.teamB, 'B')}
    </div>
  );
}

/**
 * @param rounds `data.rounds` của GET /tournaments/:id/bracket (hoặc vòng 1 dựng từ bản xem trước — kèm `pick`)
 * @param roundCount số vòng khi chưa có trận (xem trước); @param pick bấm được ô vòng 1 (đổi chỗ); @param selected ô đang chọn
 * @param onMatch(matchId) bấm một ô có trận; @param onCell(index) bấm ô vòng 1 ở chế độ `pick`; @param tools false = ẩn nút phóng / thu (TV)
 */
export default function BracketView({ rounds, title, doubles, roundCount, pick = false, selected = null, tone, onMatch, onCell, tools = true }) {
  const layout = useMemo(
    () => buildBracketLayout(rounds, { title, doubles, rounds: roundCount, pick, selected, tone }),
    [rounds, title, doubles, roundCount, pick, selected, tone]
  );
  const scrollRef = useRef(null);
  const [avail, setAvail] = useState(0);
  const [fit, setFit] = useState(prefs.fit);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setAvail(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!layout) return null;
  const f = (avail || layout.totalW) / layout.totalW;
  const useFit = fit === null ? f >= 0.5 : fit;
  const scale = useFit ? Math.min(1, f) : 1;
  const choose = (value) => { prefs.fit = value; setFit(value); };

  return (
    <div className="bkbox">
      {tools && (
        <div className="bktools">
          <button type="button" className={scale < 1 || (useFit && f >= 1) ? 'on' : ''} onClick={() => choose(true)}>Vừa màn hình</button>
          <button type="button" className={scale >= 1 && !(useFit && f >= 1) ? 'on' : ''} onClick={() => choose(false)}>Cỡ thật</button>
        </div>
      )}
      <div className={`bk ${layout.tone}`}>
        <div className="bkscroll" ref={scrollRef}>
          <div className="bksizer" style={{ width: layout.totalW * scale, height: layout.totalH * scale }}>
            <div className="bkcanvas" style={{ width: layout.totalW, height: layout.totalH, transform: `scale(${scale})` }}>
              <svg className="bklines" width={layout.totalW} height={layout.totalH}>
                {layout.paths.map((p, idx) => <path key={idx} className={p.hi ? 'hi' : ''} d={p.d} transform={`translate(0 ${p.shift})`} />)}
              </svg>
              {layout.labels.map((l, idx) => <div key={idx} className="bklab" style={{ left: l.x, width: l.w }}>{l.text}</div>)}
              {layout.cup && <Cup {...layout.cup} />}
              {layout.caption && (
                <div className="bkcap" style={{ left: layout.caption.x, width: layout.caption.w, top: layout.caption.y }}>
                  {layout.caption.text}
                  {layout.caption.sub ? <small>{layout.caption.sub}</small> : null}
                </div>
              )}
              {layout.third && <ThirdPlace box={layout.third} onMatch={pick ? null : onMatch} />}
              {layout.plates.map((p) => <Plate key={`${p.c}:${p.i}`} p={p} onMatch={pick ? null : onMatch} onCell={onCell} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
