import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '../../../../components/UIComponents';
import { playersApi } from '../../api/tournaments';
import { toCompetitionError } from '../../lib/errors';
import { FLAG_FILTERS, FLAG_LABELS, ratingOf } from '../../lib/rating';
import { fmtNumber } from '../../lib/format';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner } from '../../components/ui';

// Danh sách người chơi (07 mục 1.2): tên, điểm Đơn / Đôi + nhãn, độ tin cậy, cờ (chưa xác thực / cần xác nhận / chấm nhanh). Tìm theo tên
// (không cần dấu, do service tìm), lọc theo cờ; bấm một dòng mở hồ sơ.

const LIMIT = 25;
const flagVariant = { unverified: 'amber', needs_verification: 'rose', quick: 'violet' };

function RatingCell({ r }) {
  if (!r) return <span className="text-slate-400">chưa có</span>;
  return (
    <span>
      <b className="tabular-nums">{fmtNumber(r.rating)}</b> <small className="text-slate-500">{r.level}</small>
      <small className="ml-1 text-slate-400">· {r.reliability}%</small>
    </span>
  );
}

export default function PlayersPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [flag, setFlag] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const timer = useRef(null);
  const seq = useRef(0);

  const load = (q = query, f = flag, p = page) => {
    const mine = (seq.current += 1);
    setState((s) => ({ ...s, loading: true, error: null }));
    playersApi.list({ limit: LIMIT, page: p, status: 'active', ...(q.trim() ? { search: q.trim() } : {}), ...(f ? { flag: f } : {}) })
      .then((data) => { if (mine === seq.current) setState({ data, error: null, loading: false }); })
      .catch((e) => { if (mine === seq.current) setState({ data: null, error: toCompetitionError(e), loading: false }); });
  };

  // Gõ tìm: đợi 300 ms sau phím cuối rồi mới gọi (và về trang 1).
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); load(query, flag, 1); }, 300);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, flag]);

  const goto = (p) => { setPage(p); load(query, flag, p); };
  const items = state.data ? state.data.items : [];
  const total = state.data ? state.data.total : 0;
  const pages = state.data ? state.data.totalPages || 1 : 1;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader title="Người chơi" subtitle="Điểm trình Đơn / Đôi, chấm trình, xác nhận trình, sổ điểm." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FLAG_FILTERS.map(([key, label]) => (
          <button
            key={key || 'all'}
            type="button"
            onClick={() => setFlag(key)}
            aria-pressed={flag === key}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition ${flag === key ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          placeholder="Tìm theo tên…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 sm:w-64"
          aria-label="Tìm người chơi"
        />
      </div>

      {state.error && <Notice error={state.error} onRetry={() => load()} />}
      {state.loading && !state.data && <Spinner />}
      {state.data && !items.length && <EmptyState title="Không có ai khớp">Thử bỏ bộ lọc hoặc gõ tên khác.</EmptyState>}

      {items.length > 0 && (
        <Card className={state.loading ? 'opacity-60' : ''}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm" data-testid="players-table">
              <thead>
                <tr className="text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-1 pr-3">Tên</th><th className="py-1 pr-3">Đơn</th><th className="py-1 pr-3">Đôi</th><th className="py-1">Cờ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="cursor-pointer border-t border-slate-100 hover:bg-emerald-500/5 dark:border-slate-800" data-player={p.id} onClick={() => navigate(`/competition/players/${p.id}`)}>
                    <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-white"><Link to={`/competition/players/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.displayName}</Link></td>
                    <td className="py-2 pr-3"><RatingCell r={ratingOf(p, 'singles')} /></td>
                    <td className="py-2 pr-3"><RatingCell r={ratingOf(p, 'doubles')} /></td>
                    <td className="py-2"><span className="flex flex-wrap gap-1">{(p.flags || []).map((f) => <Badge key={f} variant={flagVariant[f] || 'slate'}>{FLAG_LABELS[f] || f}</Badge>)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{total} người</span>
            {pages > 1 && (
              <span className="flex items-center gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => goto(page - 1)}>← Trước</Button>
                Trang {page}/{pages}
                <Button variant="secondary" disabled={page >= pages} onClick={() => goto(page + 1)}>Sau →</Button>
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
