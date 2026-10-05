import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { tournamentsApi } from '../../api/tournaments';
import { toCompetitionError } from '../../lib/errors';
import { permissionsFor } from '../../lib/permissions';
import { disciplineText, FORMAT } from '../../lib/labels';
import { matchesQuery, orgName } from '../../lib/format';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner, StatusBadge } from '../../components/ui';

// Danh sách giải (07: "Giải đấu — danh sách"). Nhân viên xem, quản lý / admin tạo giải.

const FILTERS = [['', 'Tất cả'], ['open', 'Đang mở'], ['active', 'Đang đấu'], ['finalized', 'Đã chốt'], ['draft', 'Nháp']];
const isActive = (t) => ['drawn', 'in_progress'].includes(t.status);

export default function TournamentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const perms = permissionsFor(user);
  const [state, setState] = useState({ items: null, error: null });
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');

  const load = () => {
    setState((s) => ({ ...s, error: null }));
    tournamentsApi.list().then((d) => setState({ items: d.items, error: null })).catch((e) => setState({ items: null, error: toCompetitionError(e) }));
  };
  useEffect(load, []);

  const shown = useMemo(() => (state.items || []).filter((t) => {
    if (filter === 'active' ? !isActive(t) : filter && t.status !== filter) return false;
    return matchesQuery(query, t.name);
  }), [state.items, filter, query]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader
        title="Giải đấu"
        subtitle="Tạo giải, đăng ký, bốc thăm, vận hành ngày thi đấu."
        actions={perms.canManageTournaments && <Button onClick={() => navigate('/competition/tournaments/new')}>+ Tạo giải</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(([key, label]) => (
          <button
            key={key || 'all'}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition ${filter === key ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          placeholder="Tìm theo tên giải…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 sm:w-64"
          aria-label="Tìm giải"
        />
      </div>

      {state.error && <Notice error={state.error} onRetry={load} />}
      {!state.items && !state.error && <Spinner />}
      {state.items && !shown.length && (
        <EmptyState title={state.items.length ? 'Không có giải nào khớp bộ lọc' : 'Chưa có giải nào'}>
          {perms.canManageTournaments && !state.items.length ? 'Bấm "+ Tạo giải" để bắt đầu.' : null}
        </EmptyState>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((t) => (
          <Link key={t.id} to={`/competition/tournaments/${t.id}`} className="block">
            <Card className="h-full transition hover:border-emerald-500/50">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-base font-bold text-slate-900 dark:text-white">{t.name}</h2>
                <StatusBadge status={t.status} />
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{disciplineText(t)} · {FORMAT[t.format]}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{orgName(t.organizerRef)} · {t.startsOn}{t.startTime ? ` ${t.startTime}` : ''}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
