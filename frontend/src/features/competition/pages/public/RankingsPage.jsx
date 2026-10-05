import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { roleOf } from '../../../../utils/roles';
import { Badge } from '../../../../components/UIComponents';
import { meApi, playersApi, rankingApi } from '../../api/tournaments';
import { useBranches } from '../../hooks/useBranches';
import { toCompetitionError } from '../../lib/errors';
import { AGE_GROUPS, defaultCategory, LEVEL_FILTERS, movementText, POINT_CATEGORIES, RATING_CATEGORIES } from '../../lib/customer';
import { fmtNumber, fmtDate, orgName } from '../../lib/format';
import { Button, Card, EmptyState, Notice, Spinner } from '../../components/ui';
import { inputClass } from '../../components/form';
import CustomerShell from '../../components/CustomerShell';

// Bảng xếp hạng (07 mục 1.1) — công khai, chưa đăng nhập cũng xem được (người ở chế độ "Thành viên" bị che tên). Hai tab: Trình độ / Thành tích; lọc theo
// hạng mục, chi nhánh, nhóm tuổi, trình. Dòng của mình được đánh dấu; chưa đủ điều kiện thì hiện "vị trí dự kiến" thay vì hạng.

const LIMIT = 20;

function Row({ row, points }) {
  const [open, setOpen] = useState(false);
  const masked = row.player.masked || !row.player.id;
  const name = masked ? <span className="italic text-slate-500">Thành viên</span> : <Link to={`/players/${row.player.id}`} className="font-bold text-white hover:underline">{row.player.nickname || row.player.name}</Link>;
  return (
    <>
      <tr className={`border-t border-slate-800 ${row.isMe ? 'bg-emerald-500/10' : ''}`} data-rank={row.rank} data-me={row.isMe ? 'true' : undefined}>
        <td className="py-2 pr-3 text-lg font-black tabular-nums text-emerald-400">{row.rank}</td>
        <td className="py-2 pr-3 text-xs text-slate-400">{movementText(row.movement)}</td>
        <td className="py-2 pr-3">{name}{row.isMe && <Badge variant="emerald"> bạn</Badge>}</td>
        {points ? (
          <>
            <td className="py-2 pr-3 font-black tabular-nums">{row.points} <small className="font-normal text-slate-500">điểm</small></td>
            <td className="py-2 text-xs text-slate-400">{row.countedResults} kết quả {row.results && row.results.length > 0 && <button type="button" className="ml-2 font-bold text-emerald-400 hover:underline" onClick={() => setOpen(!open)}>{open ? 'Ẩn' : 'Chi tiết'}</button>}</td>
          </>
        ) : (
          <>
            <td className="py-2 pr-3 font-black tabular-nums">{fmtNumber(row.rating)} <small className="font-normal text-emerald-400">{row.level}</small></td>
            <td className="py-2 text-xs text-slate-400">{row.ratedMatches} trận{row.verified ? ' · đã xác nhận' : ''}</td>
          </>
        )}
      </tr>
      {open && (
        <tr className="bg-slate-900/60"><td colSpan={5} className="px-3 py-2 text-xs text-slate-300">
          {row.results.map((r) => <div key={r.tournamentId}>{r.placement} · {r.tournament} · <b>{r.points}</b> điểm · {fmtDate(r.awardedAt)}</div>)}
        </td></tr>
      )}
    </>
  );
}

export default function RankingsPage() {
  const { user } = useAuth();
  const branches = useBranches();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') === 'points' ? 'points' : 'rating';
  const [me, setMe] = useState(null);
  const cats = tab === 'points' ? POINT_CATEGORIES : RATING_CATEGORIES;
  const catParam = search.get('cat');
  const category = cats.some(([k]) => k === catParam) ? catParam : defaultCategory(me && me.gender);
  const [organizerRef, setOrganizerRef] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [projected, setProjected] = useState(null);
  const [tick, setTick] = useState(0);

  const isCustomer = roleOf(user) === 'customer';
  useEffect(() => {
    if (!isCustomer) { setMe(null); return undefined; }
    let alive = true;
    meApi.get().then((m) => { if (alive) setMe(m); }).catch(() => {});
    return () => { alive = false; };
  }, [isCustomer]);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    const params = { category, page, limit: LIMIT, ...(organizerRef ? { organizerRef } : {}), ...(tab === 'rating' && ageGroup ? { ageGroup } : {}), ...(tab === 'rating' && level ? { level } : {}) };
    (tab === 'points' ? rankingApi.points(params) : rankingApi.rating(params))
      .then((data) => { if (alive) setState({ data, error: null, loading: false }); })
      .catch((e) => { if (alive) setState({ data: null, error: toCompetitionError(e), loading: false }); });
    return () => { alive = false; };
  }, [tab, category, organizerRef, ageGroup, level, page, tick]);

  // Chưa đủ điều kiện lên bảng → "vị trí dự kiến" của mình ở hạng mục đang xem.
  useEffect(() => {
    setProjected(null);
    if (!me || tab !== 'rating') return undefined;
    let alive = true;
    playersApi.ranking(me.id).then((r) => { if (alive && r.rating && r.rating[category]) setProjected(r.rating[category]); }).catch(() => {});
    return () => { alive = false; };
  }, [me, tab, category]);

  const setTabParam = (next) => { const p = new URLSearchParams(search); p.set('tab', next); p.delete('cat'); setSearch(p, { replace: true }); setPage(1); };
  const setCat = (next) => { const p = new URLSearchParams(search); p.set('cat', next); setSearch(p, { replace: true }); setPage(1); };
  const items = state.data ? state.data.items : [];
  const pages = state.data ? state.data.totalPages || 1 : 1;
  const chipClass = (on) => `rounded-full border px-3 py-1 text-xs font-bold transition ${on ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`;
  const myRow = useMemo(() => items.find((r) => r.isMe), [items]);

  return (
    <CustomerShell title="Bảng xếp hạng" subtitle="Trình độ và thành tích thi đấu của cả chuỗi sân.">
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {[['rating', 'Trình độ'], ['points', 'Thành tích']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTabParam(key)} className={`rounded-xl px-5 py-2 text-sm font-black uppercase tracking-wider transition ${tab === key ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}>{label}</button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {cats.map(([key, label]) => <button key={key} type="button" data-cat={key} aria-pressed={category === key} className={chipClass(category === key)} onClick={() => setCat(key)}>{label}</button>)}
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <select className={inputClass} aria-label="Chi nhánh" value={organizerRef} onChange={(e) => { setOrganizerRef(e.target.value); setPage(1); }}>
          <option value="">Mọi chi nhánh</option>
          {branches.map((b) => <option key={b.id} value={`bd:branch:${b.id}`}>{b.name}</option>)}
        </select>
        {tab === 'rating' && (
          <>
            <select className={inputClass} aria-label="Nhóm tuổi" value={ageGroup} onChange={(e) => { setAgeGroup(e.target.value); setPage(1); }}>{AGE_GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select className={inputClass} aria-label="Trình" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>{LEVEL_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </>
        )}
      </div>

      {projected && !projected.eligible && (
        <Notice kind="info">Bạn chưa đủ điều kiện lên bảng này (cần ≥ 5 trận tính điểm hoặc được nhân viên xác nhận trình) — vị trí dự kiến: <b>{projected.projectedRank || '—'}/{projected.total}</b>.</Notice>
      )}
      {state.error && <Notice error={state.error} onRetry={() => setTick((t) => t + 1)} />}
      {state.loading && !state.data && <Spinner />}
      {state.data && !items.length && <EmptyState title="Chưa có ai trên bảng này">Bảng cập nhật khi có người đủ điều kiện (≥ 5 trận tính điểm hoặc đã xác nhận trình).</EmptyState>}
      {items.length > 0 && (
        <Card className={state.loading ? 'opacity-60' : ''}>
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <b className="text-sm text-white">{state.data.label}</b>
            <span>{state.data.total} người{organizerRef ? ` · ${orgName(organizerRef)}` : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm" data-testid="leaderboard">
              <tbody>{items.map((r) => <Row key={`${r.rank}-${r.player.id || r.rating || r.points}`} row={r} points={tab === 'points'} />)}</tbody>
            </table>
          </div>
          {user && !myRow && isCustomer && <p className="mt-2 text-xs text-slate-500">Dòng của bạn không ở trang này.</p>}
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-400">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</Button>
              Trang {page}/{pages}
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau →</Button>
            </div>
          )}
        </Card>
      )}
      {!user && <p className="mt-4 text-sm text-slate-400"><Link to="/login" className="font-bold text-emerald-400 hover:underline">Đăng nhập</Link> để xem tên đầy đủ, đối đầu và vị trí của bạn.</p>}
    </CustomerShell>
  );
}
