import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { loadTournamentBundle, matchesApi, tournamentsApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useAction } from '../../hooks/useAction';
import { useCourts } from '../../hooks/useCourts';
import { useCompetition } from '../../context/CompetitionContext';
import { permissionsFor } from '../../lib/permissions';
import { buildModel, defaultTab, tabsOf } from '../../lib/tournamentModel';
import { splitBold } from '../../lib/phase';
import { mergeLive } from '../../lib/live';
import { RESULT_TOAST } from '../../lib/score';
import { courtName, teamText } from '../../lib/format';
import { FEATURES } from '../../lib/features';
import { Button, Card, ConnectionDot, EmptyState, Notice, Spinner, StatusBadge, UpdateBanner } from '../../components/ui';
import { ConfirmDialog } from '../../components/Dialog';
import MoreMenu from '../../components/MoreMenu';
import TabCourts from './TabCourts';
import TabRegistration from './TabRegistration';
import TabSchedule, { defaultFilter } from './TabSchedule';
import TabBracket from './TabBracket';
import TabResults from './TabResults';
import { AddMatchDialog, ChooseCourtDialog, CourtsDialog, DrawDialog, FinalizeDialog, KnockoutDialog, NoShowDialog, PartnerDialog, PickMatchDialog } from './TournamentDialogs';

// Trang một giải: thanh tiến trình + "việc cần làm" + một nút chính, 5 tab tự mở đúng theo giai đoạn (07 mục 2, bài học bấm thử plan 20).
// Tự cập nhật qua SSE (score → đổi số của sân; board → tải lại), nhưng KHÔNG tải lại khi đang mở hộp thoại / ô nhập tỉ số / đang gõ —
// khi đó chỉ hiện dải "Có cập nhật mới — Tải lại".

function Stepper({ phase }) {
  if (phase.step < 0) return null;
  return (
    <ol className="mt-3 flex flex-wrap gap-2" aria-label="Tiến trình giải">
      {phase.steps.map((s, i) => (
        <li
          key={s}
          className={`rounded-full border px-3 py-1 text-xs font-bold ${i < phase.step ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : i === phase.step ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}
          aria-current={i === phase.step ? 'step' : undefined}
        >
          {i < phase.step ? '✓' : `${i + 1}.`} {s}
        </li>
      ))}
    </ol>
  );
}

export default function TournamentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useCompetition();
  const perms = permissionsFor(user);
  const { courts: branchCourts } = useCourts();

  const [live, setLive] = useState(false);
  const [liveScores, setLiveScores] = useState(new Map());
  const [skew, setSkew] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [scoreOpen, setScoreOpen] = useState(null);
  const [view, setView] = useState({ lich: null, absentOnly: false });
  const [touched, setTouched] = useState(false);
  const [highlight, setHighlight] = useState(null);

  const load = useCallback(async () => {
    const bundle = await loadTournamentBundle(id);
    setLive(['drawn', 'in_progress'].includes(bundle.t.status));
    return bundle;
  }, [id]);

  const onEvent = useCallback((name, payload) => {
    if (name === 'snapshot') {
      if (payload.serverTime) setSkew(Date.parse(payload.serverTime) - Date.now());
      setLiveScores((map) => (payload.matches || []).reduce((acc, x) => (x.live ? mergeLive(acc, x.matchId, x.live) : acc), map));
    } else if (name === 'score' && payload.live) {
      setLiveScores((map) => mergeLive(map, payload.matchId, payload.live));
    }
  }, []);

  const { data: bundle, loading, error, reload, pending, setBusy, status } = useLiveResource({
    load,
    stream: live ? { kind: 'tournaments', id } : null,
    onEvent
  });

  const [run, { busy: acting }] = useAction({ onReload: () => reload({ silent: true }) });
  const model = useMemo(() => (bundle ? buildModel(bundle) : null), [bundle]);

  // Đang thao tác dở → không tự tải lại.
  useEffect(() => { setBusy(Boolean(dialog || confirm || scoreOpen || touched)); }, [dialog, confirm, scoreOpen, touched, setBusy]);

  const tabs = model ? tabsOf(model) : [];
  const tabParam = search.get('tab');
  const current = model ? (tabs.some(([k]) => k === tabParam) ? tabParam : defaultTab(model.t)) : null;
  const setTab = useCallback((tab) => { const next = new URLSearchParams(search); next.set('tab', tab); setSearch(next, { replace: true }); setTouched(false); }, [search, setSearch]);
  const lichFilter = view.lich || (model ? defaultFilter(model.ms) : 'all');
  const viewFull = { ...view, lich: lichFilter };

  const exec = useCallback(async (fn, success, { tab } = {}) => {
    const res = await run(fn, { onError: (e) => toast(e.message, 'error') });
    if (res === undefined) return undefined;
    const message = typeof success === 'function' ? success(res) : success;
    if (message) toast(message);
    if (tab) setTab(tab);
    await reload({ silent: true });
    return res;
  }, [run, toast, reload, setTab]);

  const closeAnd = (message, opts = {}) => {
    setDialog(null);
    if (message) toast(message);
    if (opts.tab) setTab(opts.tab);
    reload({ silent: true });
  };

  const askConfirm = (c) => setConfirm(c);

  const callToCourt = async (m, court) => {
    const res = await run(() => matchesApi.call(m.id, court), { onError: (e) => { setDialog(null); toast(e.message, 'error'); } });
    if (res === undefined) return;
    setDialog(null);
    toast(`Đã gọi ra ${courtName(court)}: ${teamText(m.teamA)} vs ${teamText(m.teamB)}`);
    await reload({ silent: true });
  };

  const saveScore = (m, body, outcome) => exec(() => matchesApi.result(m.id, body, m.version), RESULT_TOAST[outcome] || 'Đã ghi tỉ số').then((res) => { if (res !== undefined) setScoreOpen(null); });

  const openLive = FEATURES.liveScoring ? (m) => navigate(`/competition/live/${m.id}`) : null;

  const onBracketMatch = (matchId) => {
    const m = model.ms.find((x) => x.id === matchId);
    if (!m) return;
    if (m.status === 'in_play' && perms.canOperate && model.live && openLive) { openLive(m); return; }
    setView({ ...view, lich: m.status === 'completed' || m.status === 'cancelled' ? 'xong' : m.status === 'in_play' ? 'dang' : 'sap' });
    setTab('lich');
    setHighlight(matchId);
    setTimeout(() => {
      const row = document.querySelector(`[data-match="${matchId}"]`);
      if (row) row.scrollIntoView({ block: 'center' });
    }, 80);
  };

  if (loading && !bundle) return <div className="mx-auto max-w-6xl p-4 sm:p-8"><Spinner label="Đang tải giải…" /></div>;
  if (error && !bundle) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-4 sm:p-8">
        <Notice error={error} onRetry={() => reload()} />
        <Link to="/competition/tournaments" className="text-sm font-bold text-emerald-600 hover:underline">← Danh sách giải</Link>
      </div>
    );
  }
  if (!model) return null;

  const { t, phase } = model;
  const manage = perms.canManageTournaments;
  const operate = perms.canOperate || manage;
  const notDone = !['finalized', 'cancelled'].includes(t.status);
  const more = [
    manage && t.status === 'drawn' && !model.hasResults ? ['draw', 'Bốc thăm lại…'] : null,
    manage && t.status === 'drawn' && !model.hasResults ? ['reopen', 'Mở lại đăng ký'] : null,
    operate && model.live ? ['noshow', 'Xử W.O. đội vắng…'] : null,
    manage && model.live ? ['add-match', 'Thêm trận tay…'] : null,
    manage && model.live && phase.primary && phase.primary.id !== 'fin' ? ['fin', 'Xem trước khi chốt…'] : null,
    manage && notDone ? ['courts', 'Sân của giải…'] : null,
    manage && t.status === 'finalized' ? ['unfin', 'Huỷ chốt'] : null,
    manage && notDone ? ['cancel', 'Huỷ giải'] : null
  ].filter(Boolean);
  const canPrimary = (key) => {
    if (!key) return false;
    if (key.startsWith('goto:')) return true;
    if (['open', 'draw', 'ko', 'fin'].includes(key)) return manage;
    return operate;
  };

  const doAction = (key) => {
    if (key.startsWith('goto:')) { setTab(key.slice(5)); return; }
    const actions = {
      open: () => exec(() => tournamentsApi.action(id, 'open'), 'Đã mở đăng ký', { tab: 'dangky' }),
      draw: () => setDialog({ type: 'draw' }),
      ko: () => setDialog({ type: 'ko' }),
      fin: () => setDialog({ type: 'fin' }),
      noshow: () => setDialog({ type: 'noshow' }),
      'add-match': () => setDialog({ type: 'addmatch' }),
      courts: () => setDialog({ type: 'courts' }),
      reopen: () => askConfirm({
        title: 'Mở lại đăng ký',
        text: 'Huỷ kết quả bốc thăm (đội, bảng, lịch). Người vào danh sách chờ lúc bốc thăm (lẻ người / vắng) trở lại danh sách đăng ký.',
        confirmLabel: 'Mở lại',
        action: async () => { await tournamentsApi.action(id, 'reopen'); return { message: 'Đã mở lại đăng ký', tab: 'dangky' }; }
      }),
      unfin: () => askConfirm({
        title: 'Huỷ chốt giải',
        text: 'Điểm trình, điểm BXH, thống kê của giải được hoàn tác (bị chặn nếu có người đã đổi điểm sau giải).',
        confirmLabel: 'Huỷ chốt',
        danger: true,
        action: async () => { await tournamentsApi.action(id, 'unfinalize'); return { message: 'Đã huỷ chốt', tab: 'san' }; }
      }),
      cancel: () => askConfirm({
        title: 'Huỷ giải',
        text: 'Trận chưa đánh bị huỷ, giải không tính điểm. Không hoàn tác được.',
        confirmLabel: 'Huỷ giải',
        danger: true,
        action: async () => { await tournamentsApi.action(id, 'cancel'); return { message: 'Đã huỷ giải' }; }
      })
    };
    if (actions[key]) actions[key]();
  };

  const runConfirm = async () => {
    const c = confirm;
    const res = await exec(c.action, (r) => (typeof r === 'string' ? r : r && r.message), { tab: undefined });
    if (res !== undefined) {
      setConfirm(null);
      if (res && res.tab) setTab(res.tab);
    } else {
      setConfirm(null);
    }
  };

  const scoreProps = { busy: acting };
  const showPrimary = phase.primary && canPrimary(phase.primary.id) && phase.primary.id !== `goto:${current}`;
  const showSecondary = phase.secondary && canPrimary(phase.secondary.id) && phase.secondary.id !== `goto:${current}`;
  const chooseCourt = dialog && dialog.type === 'choose';

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-8">
      <Link to="/competition/tournaments" className="mb-3 inline-block text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Danh sách giải</Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-black text-slate-900 dark:text-white">{t.name} <StatusBadge status={t.status} /></h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{model.info}</p>
          </div>
          <ConnectionDot status={live ? status : 'idle'} />
        </div>
        <Stepper phase={phase} />
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-500/10 px-4 py-3" data-testid="todo">
          <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100">
            {splitBold(phase.todo).map((part, i) => (part.bold ? <b key={i}>{part.text}</b> : <React.Fragment key={i}>{part.text}</React.Fragment>))}
          </span>
          {showSecondary && <Button variant="secondary" onClick={() => doAction(phase.secondary.id)}>{phase.secondary.label}</Button>}
          {showPrimary && <Button onClick={() => doAction(phase.primary.id)}>{phase.primary.label}</Button>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {model.drawn && FEATURES.tournamentBoard && <Button variant="secondary" onClick={() => window.open(`/competition/tournaments/${id}/board`, '_blank')}>Màn hình TV ↗</Button>}
          <MoreMenu items={more} onPick={doAction} />
          <Button variant="secondary" onClick={() => reload()}>Tải lại</Button>
        </div>
      </Card>

      <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === current}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-4 px-3 py-2.5 text-sm font-bold transition ${key === current ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {pending && <UpdateBanner onReload={() => { setTouched(false); setScoreOpen(null); reload({ silent: true }); }} />}
        {error && bundle && <div className="mb-3"><Notice error={error} onRetry={() => reload({ silent: true })} /></div>}
        {t.status === 'cancelled' && <EmptyState title="Giải đã huỷ" />}
        {current === 'san' && (
          <TabCourts
            model={model} perms={perms} liveScores={liveScores} skew={skew}
            onCall={(m, court) => callToCourt(m, court)}
            onPick={(court) => setDialog({ type: 'pick', court })}
            onScore={saveScore} onLiveScore={openLive}
            scoreOpen={scoreOpen} setScoreOpen={setScoreOpen} scoreProps={scoreProps}
          />
        )}
        {current === 'dangky' && (
          <TabRegistration
            t={t} model={model} perms={perms} view={viewFull} setView={setView} reload={reload} askConfirm={(c) => askConfirm(c)} setTouched={setTouched}
            onChangePartner={(entry) => setDialog({ type: 'partner', entry })}
          />
        )}
        {current === 'lich' && (
          <TabSchedule
            model={model} perms={perms} view={viewFull} setView={setView} liveScores={liveScores}
            onCall={(m) => setDialog({ type: 'choose', match: m })}
            onScore={saveScore} onLiveScore={openLive}
            scoreOpen={scoreOpen} setScoreOpen={setScoreOpen} scoreProps={scoreProps} highlight={highlight}
          />
        )}
        {current === 'bang' && <TabBracket model={model} t={t} onBracketMatch={onBracketMatch} />}
        {current === 'ketqua' && <TabResults model={model} />}
      </div>

      {dialog && dialog.type === 'draw' && <DrawDialog t={t} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'ko' && <KnockoutDialog t={t} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'fin' && <FinalizeDialog t={t} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'noshow' && <NoShowDialog t={t} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'addmatch' && <AddMatchDialog t={t} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'courts' && <CourtsDialog t={t} branchCourts={branchCourts} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'partner' && <PartnerDialog t={t} entry={dialog.entry} entries={model.es} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {chooseCourt && (
        <ChooseCourtDialog
          match={dialog.match}
          freeCourts={model.freeCourts}
          blockedBy={model.blocked.has(dialog.match.id) ? model.blockedText(dialog.match) : ''}
          onClose={() => setDialog(null)}
          onCall={callToCourt}
        />
      )}
      {dialog && dialog.type === 'pick' && <PickMatchDialog t={t} court={dialog.court} onClose={() => setDialog(null)} onCall={callToCourt} />}
      {confirm && <ConfirmDialog title={confirm.title} text={confirm.text} confirmLabel={confirm.confirmLabel} danger={confirm.danger} busy={acting} onClose={() => setConfirm(null)} onConfirm={runConfirm} />}
    </div>
  );
}
