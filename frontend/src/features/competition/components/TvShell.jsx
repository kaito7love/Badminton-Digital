import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clockText } from '../lib/board';
import { ConnectionDot } from './ui';
import ScoreBoard from './ScoreBoard';
import Elapsed from './Elapsed';
import { courtName, teamText } from '../lib/format';
import { boardLabel } from '../lib/board';

// Khung màn hình lớn (TV): toàn màn hình, luôn nền tối, chữ lớn, chỉ đọc (07 mục 1.2 và mục 4). Mở bằng chính phiên đăng nhập của nhân viên.

export function TvShell({ title, subtitle, status, children, badge }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  const el = (
    <div className="fixed inset-0 z-[45] overflow-y-auto bg-slate-950 p-6 text-white" data-testid="tv-shell">
      <header className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-4xl font-black tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-xl text-slate-400">{subtitle}</p>}
        </div>
        {badge}
        <span className="text-white/70"><ConnectionDot status={status} /></span>
        <span className="text-5xl font-black tabular-nums" aria-label="Giờ hiện tại">{clockText(now)}</span>
      </header>
      {children}
    </div>
  );
  // Portal vào <body>: thoát khỏi khung z-index của SidebarLayout để phủ kín cả thanh menu.
  return typeof document === 'undefined' ? el : createPortal(el, document.body);
}

export const TvSection = ({ title, children, className = '' }) => (
  <section className={`rounded-3xl border border-white/10 bg-slate-900/60 p-5 ${className}`}>
    {title && <h2 className="mb-3 text-2xl font-black uppercase tracking-wider text-emerald-400">{title}</h2>}
    {children}
  </section>
);

/** Một sân trên TV: đang đánh (tên sân, trận, đồng hồ, bảng điểm hoặc tên hai đội) hoặc trống. */
export function TvCourt({ courtRef, match, live, skew, emptyText = 'Trống — chờ gọi trận kế tiếp' }) {
  return (
    <div className={`rounded-3xl border-2 p-5 ${match ? 'border-amber-400/60 bg-amber-400/5' : 'border-emerald-400/30 bg-emerald-400/5'}`} data-court={courtRef}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <b className="text-3xl font-black">
          {courtName(courtRef)}
          {match && match.scoring && match.scoring.bestOf > 1 && <span className="ml-3 rounded-full bg-violet-500/30 px-3 py-0.5 align-middle text-lg font-bold text-violet-200">{match.scoring.bestOf} game</span>}
        </b>
        {match
          ? <span className="text-2xl font-bold text-amber-300">Đang đánh · <Elapsed since={match.calledAt} skew={skew} /></span>
          : <span className="text-2xl font-bold text-emerald-300">Trống</span>}
      </div>
      {match ? (
        <>
          <p className="mb-2 text-xl text-slate-400">{boardLabel(match)}</p>
          {live ? (
            <ScoreBoard match={match} live={live} variant="tv" />
          ) : (
            <div className="space-y-1 text-3xl font-bold">
              <div>{teamText(match.teamA) || '—'}</div>
              <div className="text-xl font-normal text-slate-500">vs</div>
              <div>{teamText(match.teamB) || '—'}</div>
            </div>
          )}
        </>
      ) : (
        <p className="text-2xl text-slate-400">{emptyText}</p>
      )}
    </div>
  );
}
