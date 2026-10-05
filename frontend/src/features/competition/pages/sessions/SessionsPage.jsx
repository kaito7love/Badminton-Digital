import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { useBranch } from '../../../../contexts/BranchContext';
import { sessionsApi } from '../../api/tournaments';
import { useCourts } from '../../hooks/useCourts';
import { useCourtUsage } from '../../hooks/useCourtUsage';
import { useCompetition } from '../../context/CompetitionContext';
import { toCompetitionError } from '../../lib/errors';
import { permissionsFor } from '../../lib/permissions';
import { fmtDateTime, matchesQuery, orgName } from '../../lib/format';
import { sessionInfo } from '../../lib/sessionModel';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner, StatusBadge } from '../../components/ui';
import { SessionFormDialog } from './SessionDialogs';

// Danh sách buổi giao lưu (07 mục 1.2). Nhân viên tạo / điều phối buổi của chi nhánh mình.

const FILTERS = [['', 'Tất cả'], ['open', 'Đang diễn ra'], ['closed', 'Đã đóng'], ['cancelled', 'Đã huỷ']];

export default function SessionsPage() {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch() || {};
  const { toast } = useCompetition();
  const navigate = useNavigate();
  const perms = permissionsFor(user);
  const { courts } = useCourts();
  const { usage } = useCourtUsage();
  const [state, setState] = useState({ items: null, error: null });
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setState((s) => ({ ...s, error: null }));
    sessionsApi.list().then((d) => setState({ items: d.items, error: null })).catch((e) => setState({ items: null, error: toCompetitionError(e) }));
  };
  useEffect(load, []);

  const shown = useMemo(() => (state.items || []).filter((s) => (!filter || s.status === filter) && matchesQuery(query, s.name)), [state.items, filter, query]);
  const branchId = selectedBranchId || user?.employee?.branchId || null;
  const organizerRef = branchId ? `bd:branch:${branchId}` : null;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader
        title="Giao lưu"
        subtitle="Điểm danh, xếp sân trống, bấm điểm, đóng buổi."
        actions={perms.canOperate && <Button onClick={() => setCreating(true)}>+ Tạo buổi</Button>}
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
          placeholder="Tìm theo tên buổi…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 sm:w-64"
          aria-label="Tìm buổi"
        />
      </div>

      {state.error && <Notice error={state.error} onRetry={load} />}
      {!state.items && !state.error && <Spinner />}
      {state.items && !shown.length && (
        <EmptyState title={state.items.length ? 'Không có buổi nào khớp bộ lọc' : 'Chưa có buổi giao lưu nào'}>
          {perms.canOperate && !state.items.length ? 'Bấm "+ Tạo buổi" để bắt đầu.' : null}
        </EmptyState>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((s) => (
          <Link key={s.id} to={`/competition/sessions/${s.id}`} className="block">
            <Card className="h-full transition hover:border-emerald-500/50">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-base font-bold text-slate-900 dark:text-white">{s.name}</h2>
                <StatusBadge status={s.status} kind="session" />
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{sessionInfo(s)}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{orgName(s.organizerRef)} · {fmtDateTime(s.startsAt)}</p>
            </Card>
          </Link>
        ))}
      </div>

      {creating && (
        <SessionFormDialog
          organizerRef={organizerRef}
          branchCourts={courts}
          usage={usage}
          onClose={() => setCreating(false)}
          onDone={(message, created) => { setCreating(false); toast(message); navigate(`/competition/sessions/${created.id}`); }}
        />
      )}
    </div>
  );
}
