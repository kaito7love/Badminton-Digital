import React, { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import PublicShell from '../../components/PublicShell';
import { Card, ConnectionDot, EmptyState, Notice, Spinner } from '../../components/ui';
import { Fact, Pill } from '../../components/public/atoms';
import { RegistrationPanel } from '../../components/public/Panels';
import RegisterDialog from '../../components/public/RegisterDialog';
import { ConfirmDialog } from '../../components/Dialog';
import { BracketCard, EntriesList, PlacementsCard, ScheduleList, StandingsTables } from '../../components/public/Lists';
import { loadPublicTournament, publicTournamentsApi } from '../../api/publicApi';
import { useAction } from '../../hooks/useAction';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useCompetition } from '../../context/CompetitionContext';
import { orgName } from '../../lib/format';
import { hubPaths, liveMapReducer, registrationState, tournamentFacts, tournamentTabs, tournamentWhen, withLiveList } from '../../lib/publicHub';
import { registerToast, withdrawText } from '../../lib/registerFlow';

// Trang một giải công khai (plan 27): thông tin, khung đăng ký, và các tab theo giai đoạn (đăng ký · lịch & kết quả · bảng / sơ đồ · kết quả chung cuộc).
// Tự cập nhật qua luồng SSE công khai của giải (không cần đăng nhập); mất luồng thì poll dự phòng.

export default function PublicTournamentPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // Tỉ số trực tiếp từ SSE (snapshot / score) ghép vào lịch mà không phải tải lại cả trang.
  const [liveMap, setLiveMap] = useState({});
  const onEvent = useCallback((name, payload) => setLiveMap((m) => liveMapReducer(m, name, payload)), []);
  const { data, loading, error, reload, status } = useLiveResource({
    load: () => loadPublicTournament(id),
    stream: { kind: 'tournaments', id, public: true },
    onEvent,
    pollMs: 15000
  });
  const matches = useMemo(() => withLiveList(data ? data.matches : [], liveMap), [data, liveMap]);
  const { toast } = useCompetition();
  const [dialog, setDialog] = useState(null); // 'register' | 'withdraw' | null
  const [run, { busy, error: actionError, clearError }] = useAction({ onReload: reload });
  const closeDialog = () => { clearError(); setDialog(null); };

  const t = data ? data.t : null;
  const tabs = useMemo(() => (t ? tournamentTabs(t) : []), [t]);
  const active = tabs.find(([key]) => key === params.get('tab')) ? params.get('tab') : tabs.length ? tabs[0][0] : 'dangky';
  const pickTab = (key) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next, { replace: true });
  };

  if (loading && !data) return <PublicShell><Spinner label="Đang tải giải…" /></PublicShell>;
  if (error && !data) {
    return (
      <PublicShell>
        <Notice error={error} onRetry={error.code === 'NOT_FOUND' ? undefined : () => reload()} />
        <p className="mt-4 text-sm"><Link to={hubPaths.home} className="font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Về trang giải đấu</Link></p>
      </PublicShell>
    );
  }
  const state = registrationState(t);
  const roundRobin = t.format === 'round_robin';
  const needsPartner = Boolean(t.registration.needsPartner);

  const onRegistered = (detail) => {
    setDialog(null);
    toast(registerToast(detail.me, needsPartner));
    reload({ silent: true });
  };
  const withdraw = async () => {
    const res = await run(() => publicTournamentsApi.withdraw(id));
    if (!res) return;
    setDialog(null);
    toast('Đã rút khỏi giải');
    reload({ silent: true });
  };

  return (
    <PublicShell>
      <p className="mb-3 text-sm"><Link to={hubPaths.home} className="font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Tất cả giải đấu</Link></p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Pill tone={state.tone}>{state.label}</Pill>
              <ConnectionDot status={status} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">{t.name}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">📅 {tournamentWhen(t)} · 📍 {orgName(t.organizerRef)}</p>
            {t.description && <p className="mt-3 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{t.description}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {tournamentFacts(t).map(([label, value]) => <Fact key={label} label={label}>{value}</Fact>)}
            </dl>
          </Card>

          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active === key}
                onClick={() => pickTab(key)}
                className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-bold transition ${active === key ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {active === 'dangky' && <EntriesList entries={data.entries} needsPartner={t.registration.needsPartner} />}
            {active === 'lich' && <ScheduleList matches={matches} />}
            {active === 'bang' && (
              <div className="space-y-4">
                {!roundRobin || data.standings.length ? <StandingsTables groups={data.standings} roundRobin={roundRobin} /> : null}
                <BracketCard rounds={data.bracket} title={t.name} />
                {!data.standings.length && !data.bracket.length && <EmptyState title="Chưa có bảng hay sơ đồ">Có sau khi ban tổ chức bốc thăm.</EmptyState>}
              </div>
            )}
            {active === 'ketqua' && <PlacementsCard placements={data.placements} />}
          </div>
        </div>

        <aside className="min-w-0">
          <RegistrationPanel t={t} user={user} busy={busy} onRegister={() => setDialog('register')} onWithdraw={() => setDialog('withdraw')} />
        </aside>
      </div>
      {dialog === 'register' && <RegisterDialog t={t} onClose={closeDialog} onDone={onRegistered} />}
      {dialog === 'withdraw' && (
        <ConfirmDialog title="Rút khỏi giải?" text={withdrawText(t.me, needsPartner)} confirmLabel="Rút khỏi giải" danger busy={busy} error={actionError} onConfirm={withdraw} onClose={closeDialog} />
      )}
    </PublicShell>
  );
}
