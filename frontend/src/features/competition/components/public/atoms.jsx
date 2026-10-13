import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../../components/UIComponents';
import { feeText } from '../../lib/publicHub';

// Thành phần nhỏ dùng chung của khu công khai "Thi đấu" (plan 27).

/**
 * Tên một người chơi theo dữ liệu công khai `{ id, name, masked }`: người bị che hiện mờ + nghiêng (không bấm được); người công khai bấm được
 * sang hồ sơ; `mine` = đăng ký của chính mình → đậm màu xanh.
 */
export function PlayerName({ player, mine = false, link = true }) {
  if (!player) return null;
  if (player.masked) {
    return <span className="italic text-slate-400 dark:text-slate-500" title="Thành viên đã ẩn tên">{player.name}</span>;
  }
  const cls = mine ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-slate-900 dark:text-white';
  return link && player.id
    ? <Link to={`/players/${player.id}`} className={`${cls} hover:underline`}>{player.name}</Link>
    : <span className={cls}>{player.name}</span>;
}

/** Một cặp / một người: "A & B". */
export function PlayersLine({ players, mine = false, className = '' }) {
  return (
    <span className={className}>
      {(players || []).map((p, i) => (
        <React.Fragment key={p.id || `${p.name}-${i}`}>
          {i > 0 && <span className="text-slate-400"> &amp; </span>}
          <PlayerName player={p} mine={mine} />
        </React.Fragment>
      ))}
    </span>
  );
}

/** Thanh chỗ đã đăng ký (ratio 0..1); null = không giới hạn → không vẽ. */
export function Meter({ ratio, tone = 'emerald' }) {
  if (ratio === null || ratio === undefined) return null;
  const color = ratio >= 1 ? 'bg-amber-500' : tone === 'sky' ? 'bg-sky-500' : 'bg-emerald-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

/** Lệ phí dự kiến — chỉ hiển thị (plan 27 mục 8.1); thanh toán tại quầy. */
export function FeeChip({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-800 dark:text-amber-200 ${className}`} title="Lệ phí dự kiến, thanh toán tại quầy">
      💰 {feeText()}
    </span>
  );
}

export const Pill = ({ tone = 'slate', children }) => <Badge variant={tone}>{children}</Badge>;

/** Tiêu đề một khu của trang chủ, có neo để menu nhảy tới. */
export function SectionTitle({ id, title, hint, action }) {
  return (
    <div id={id} className="mb-3 mt-8 flex scroll-mt-32 flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">{title}</h2>
        {hint && <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** Ô số liệu nhỏ (thông tin giải, thống kê). */
export function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{children}</dd>
    </div>
  );
}

/** Dấu "mình" cạnh một dòng đăng ký. */
export const YouTag = () => (
  <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">Bạn</span>
);
