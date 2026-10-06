import React, { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import PublicShell from '../../components/PublicShell';
import { Card, ConnectionDot, Notice, Spinner } from '../../components/ui';
import { Fact, Pill } from '../../components/public/atoms';
import { SessionSignupPanel } from '../../components/public/Panels';
import { ConfirmDialog } from '../../components/Dialog';
import { SessionBoardView, SignupList } from '../../components/public/Lists';
import { loadPublicSession, publicSessionsApi } from '../../api/publicApi';
import { useAction } from '../../hooks/useAction';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useCompetition } from '../../context/CompetitionContext';
import { orgName } from '../../lib/format';
import { hubPaths, liveMapReducer, SESSION_PHASE, sessionFacts, sessionPhase, sessionWhen, withLiveBoard } from '../../lib/publicHub';
import { signupToast } from '../../lib/registerFlow';

// Trang một buổi giao lưu công khai (plan 27): bảng sân trực tiếp + ai đã đăng ký + khung tham gia. Tự cập nhật qua luồng SSE công khai của buổi.

const TABS = [['san', 'Bảng sân'], ['dangky', 'Đã đăng ký']];

export default function PublicSessionPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [liveMap, setLiveMap] = useState({});
  const onEvent = useCallback((name, payload) => setLiveMap((m) => liveMapReducer(m, name, payload)), []);
  const { data, loading, error, reload, status } = useLiveResource({
    load: () => loadPublicSession(id),
    stream: { kind: 'sessions', id, public: true },
    onEvent,
    pollMs: 15000
  });
  const board = useMemo(() => withLiveBoard(data ? data.board : null, liveMap), [data, liveMap]);
  const { toast } = useCompetition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [run, { busy, error: actionError, clearError }] = useAction({ onReload: reload });

  const signUp = async () => {
    const res = await run(() => publicSessionsApi.signUp(id));
    if (!res) return;
    toast(signupToast(res.me));
    reload({ silent: true });
  };
  const cancel = async () => {
    const res = await run(() => publicSessionsApi.cancel(id));
    if (!res) return;
    setConfirmCancel(false);
    toast('Đã huỷ đăng ký');
    reload({ silent: true });
  };

  if (loading && !data) return <PublicShell><Spinner label="Đang tải buổi giao lưu…" /></PublicShell>;
  if (error && !data) {
    return (
      <PublicShell>
        <Notice error={error} onRetry={error.code === 'NOT_FOUND' ? undefined : () => reload()} />
        <p className="mt-4 text-sm"><Link to={`${hubPaths.home}#giao-luu`} className="font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Về trang giải đấu</Link></p>
      </PublicShell>
    );
  }
  const { s, signups } = data;
  const [phaseLabel, phaseTone] = SESSION_PHASE[sessionPhase(s)];
  const active = TABS.find(([key]) => key === params.get('tab')) ? params.get('tab') : TABS[0][0];
  const pickTab = (key) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next, { replace: true });
  };

  return (
    <PublicShell>
      <p className="mb-3 text-sm"><Link to={`${hubPaths.home}#giao-luu`} className="font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Tất cả buổi giao lưu</Link></p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Pill tone={phaseTone}>{phaseLabel}</Pill>
              <ConnectionDot status={status} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">{s.name}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">🕒 {sessionWhen(s.startsAt)} · 📍 {orgName(s.organizerRef)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {sessionFacts(s).map(([label, value]) => <Fact key={label} label={label}>{value}</Fact>)}
            </dl>
          </Card>

          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active === key}
                onClick={() => pickTab(key)}
                className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-bold transition ${active === key ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                {label}{key === 'dangky' && s.signup ? ` (${s.signup.registered + s.signup.waitlisted})` : ''}
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {active === 'san' && <SessionBoardView board={board} />}
            {active === 'dangky' && <SignupList signups={signups} maxPlayers={s.signup.maxPlayers} />}
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          {actionError && !confirmCancel && <Notice error={actionError} onClose={clearError} />}
          <SessionSignupPanel s={s} user={user} busy={busy} onSignUp={signUp} onCancel={() => { clearError(); setConfirmCancel(true); }} />
        </aside>
      </div>
      {confirmCancel && (
        <ConfirmDialog
          title="Huỷ đăng ký buổi này?"
          text={s.me && s.me.status === 'waitlisted' ? 'Bạn sẽ rời danh sách chờ.' : 'Chỗ của bạn được nhả ra; người đầu danh sách chờ (nếu có) sẽ được lên.'}
          confirmLabel="Huỷ đăng ký"
          danger
          busy={busy}
          error={actionError}
          onConfirm={cancel}
          onClose={() => { clearError(); setConfirmCancel(false); }}
        />
      )}
    </PublicShell>
  );
}
