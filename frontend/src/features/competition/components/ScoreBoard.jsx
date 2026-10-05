import React from 'react';
import { boardRows } from '../lib/live';

// Bảng điểm một trận (plan 19, bố cục chủ dự án chọn): mỗi đội một hàng, điểm Ở BÊN PHẢI tên đội; mỗi game một cột, game đang đánh là
// ô to có khung; game đã xong: số của đội thắng game đó sáng + đậm, đội thua mờ; 🏸 cạnh điểm đội đang giao; trận bo3 có hàng
// tiêu đề "G1 · G2 · G3" và "Ván 1–1" ở dòng dưới. `variant`: card (thẻ sân, nhãn ngắn) | tv (chữ lớn, nền tối).

const SIZES = {
  card: { name: 'text-sm', game: 'w-7 text-sm', cur: 'min-w-[2.75rem] text-3xl', meta: 'text-xs', label: (n) => `G${n}` },
  tv: { name: 'text-3xl', game: 'w-14 text-3xl', cur: 'min-w-[5.5rem] text-7xl', meta: 'text-xl', label: (n) => `Game ${n}` }
};

export default function ScoreBoard({ match, live, variant = 'card', label = '' }) {
  if (!live) return null;
  const size = SIZES[variant] || SIZES.card;
  const tv = variant === 'tv';
  const b = boardRows(match, live);
  const dim = tv ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400';
  const text = tv ? 'text-white' : 'text-slate-900 dark:text-white';

  return (
    <div className={`rounded-2xl ${tv ? 'bg-slate-900/70 p-4' : 'border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60'}`} data-testid="scoreboard">
      {b.multi && (
        <div className={`mb-1 flex items-center gap-2 ${dim} ${size.meta} font-bold`}>
          <span className="flex-1" />
          {Array.from({ length: b.previous }, (_, k) => <span key={k} className={`${size.game} text-center`}>{size.label(k + 1)}</span>)}
          <span className="w-5" />
          <span className={`${size.cur} text-center`}>{size.label(b.currentNo)}</span>
        </div>
      )}
      {b.rows.map((row) => (
        <div key={row.side} className={`flex items-center gap-2 py-0.5 ${row.winner ? 'text-emerald-500' : text}`}>
          <span className={`flex min-w-0 flex-1 flex-col font-bold leading-tight ${size.name}`}>
            {row.team ? row.team.players.map((p) => <span key={p.id || p.name} className="truncate">{p.name}</span>) : <span className={dim}>—</span>}
          </span>
          {row.games.map((g, k) => (
            <span key={k} className={`${size.game} text-center font-bold tabular-nums ${g.won ? '' : 'opacity-40'}`}>{g.points}</span>
          ))}
          <span className="w-5 text-center" aria-label={row.serving ? 'đang giao' : undefined}>{row.serving ? '🏸' : ''}</span>
          <span className={`${size.cur} rounded-xl border-2 text-center font-black tabular-nums leading-none ${tv ? 'border-white/20 px-2 py-2' : 'border-slate-300 px-1 py-1 dark:border-slate-700'}`}>{row.current}</span>
        </div>
      ))}
      <div className={`mt-1 ${dim} ${size.meta}`}>{label ? `${label} · ` : ''}{b.meta}</div>
    </div>
  );
}
