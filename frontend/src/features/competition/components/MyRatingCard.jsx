import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { meApi } from '../api/tournaments';
import { useCompetition } from '../context/CompetitionContext';
import { ratingSummary } from '../lib/customer';

/**
 * Thẻ "Trình độ của tôi" ở trang Tài khoản: theo dõi nhanh điểm Đơn / Đôi ngay trong hồ sơ.
 * Chưa chấm trình → mời sang trang tự chấm; đã chấm → chỉ hiện điểm Đơn và Đôi, chi tiết ở /my-rating.
 * Thi đấu tắt hoặc tải lỗi thì không hiện thẻ (thẻ chỉ là phần thêm, không làm hỏng trang Tài khoản).
 */
export function MyRatingCardView({ summary }) {
  return (
    <div className="nike-card-static p-6" data-testid="my-rating-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Trình độ của tôi</p>
        {summary.rated && (
          <Link to="/my-rating" className="font-kinetic text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:underline dark:text-emerald-400">
            Xem chi tiết →
          </Link>
        )}
      </div>

      {summary.rated ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {summary.rows.map((row) => (
            <div key={row.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/50">
              <p className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">{row.label}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="font-kinetic text-3xl font-black text-emerald-700 dark:text-emerald-400">{row.rating}</span>
                {row.level && <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{row.level}</span>}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-500">
                {row.matches > 0 ? `${row.matches} trận tính điểm` : 'Chưa có trận tính điểm'}
                {row.provisional ? ' · tạm tính' : ''}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-slate-700 dark:text-slate-300">Bạn chưa chấm trình. Chấm một lần để đăng ký giải đấu và được ghép cặp đúng trình.</p>
          <Link to="/my-rating/assess" className="btn-nike-bolt mt-4 text-xs">Tự chấm trình</Link>
        </div>
      )}
    </div>
  );
}

export default function MyRatingCard() {
  const { enabled } = useCompetition();
  const [state, setState] = useState({ loading: true, summary: null });

  useEffect(() => {
    if (!enabled) { setState({ loading: false, summary: null }); return undefined; }
    let alive = true;
    meApi.get()
      .then((me) => { if (alive) setState({ loading: false, summary: ratingSummary(me) }); })
      .catch(() => { if (alive) setState({ loading: false, summary: null }); });
    return () => { alive = false; };
  }, [enabled]);

  if (!enabled || state.loading || !state.summary) return null;
  return <MyRatingCardView summary={state.summary} />;
}
