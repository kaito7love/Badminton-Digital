import React from 'react';
import { Badge } from '../../../components/UIComponents';
import { DISCIPLINE_LABEL, ratingOf, reliabilityText } from '../lib/rating';
import { fmtNumber } from '../lib/format';

// Hai thẻ điểm Đơn / Đôi của một người chơi (07: "Trình độ của tôi" và hồ sơ nhân viên): điểm, nhãn, độ tin cậy, đã xác nhận chưa.
// Dùng chung màn hình nhân viên (Tailwind sáng / tối) — màn hình khách (c5) bọc lại bằng khung Kinetic.

export function RatingCard({ discipline, rating, tone = 'default', footer }) {
  const label = DISCIPLINE_LABEL[discipline];
  return (
    <div className={`rounded-3xl border p-5 ${tone === 'kinetic' ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80'}`} data-discipline={discipline}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</h3>
        {rating && (
          <span className="flex flex-wrap gap-1">
            {rating.verified ? <Badge variant="emerald">Đã xác nhận</Badge> : <Badge variant="amber">Chưa xác thực</Badge>}
            {rating.provisional && <Badge>Tạm tính</Badge>}
          </span>
        )}
      </div>
      {rating ? (
        <>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl font-black tabular-nums" data-testid={`rating-${discipline}`}>{fmtNumber(rating.rating)}</span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{rating.level}</span>
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Độ tin cậy {rating.reliability}% · {reliabilityText(rating.reliability)}</span>
              <span>{rating.ratedMatches} trận tính điểm</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={rating.reliability} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, rating.reliability))}%` }} />
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Chưa có điểm {label}.</p>
      )}
      {footer}
    </div>
  );
}

export default function RatingCards({ player, tone, footers = {} }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {['singles', 'doubles'].map((d) => <RatingCard key={d} discipline={d} rating={ratingOf(player, d)} tone={tone} footer={footers[d]} />)}
    </div>
  );
}
