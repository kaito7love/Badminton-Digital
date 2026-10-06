import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { Badge } from '../../../../components/UIComponents';
import { matchesApi, playersApi, sessionsApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useAction } from '../../hooks/useAction';
import { useCourts } from '../../hooks/useCourts';
import { useCourtUsage } from '../../hooks/useCourtUsage';
import { useCompetition } from '../../context/CompetitionContext';
import { permissionsFor } from '../../lib/permissions';
import { mergeLive, pickNewest } from '../../lib/live';
import { RESULT_TOAST } from '../../lib/score';
import { courtName, teamText } from '../../lib/format';
import { checkInPlan, perCourt, rosterGroups, rosterNote, roundLabel, sessionInfo, signupSummary } from '../../lib/sessionModel';
import { Button, Card, ConnectionDot, EmptyState, Notice, Spinner, StatusBadge, TeamNames, UpdateBanner } from '../../components/ui';
import { ConfirmDialog } from '../../components/Dialog';
import MoreMenu from '../../components/MoreMenu';
import PersonPicker from '../../components/PersonPicker';
import ScoreBoard from '../../components/ScoreBoard';
import ScoreForm from '../../components/ScoreForm';
import Elapsed from '../../components/Elapsed';
import { buildOptions } from '../tournaments/TabRegistration';
import { CloseDialog, FillDialog, QuickLevelDialog, SessionFormDialog } from './SessionDialogs';

// Trang một buổi giao lưu (07 mục 1.2): sân đang đánh (bảng điểm trực tiếp, bấm điểm / nhập tỉ số / xong không tỉ số / huỷ trận), điểm danh,
// hàng chờ, "Xếp sân trống", đổi luật điểm, đóng buổi. Tự cập nhật qua SSE nhưng KHÔNG tải lại khi đang mở hộp thoại / ô nhập (dải "Có cập nhật mới").

const loadAll = async (id) => {
  const [session, roster, board, matches, signups] = await Promise.all([
    sessionsApi.get(id), sessionsApi.players(id), sessionsApi.board(id), sessionsApi.matches(id),
    sessionsApi.signups(id).catch(() => ({ items: [] })) // phần phụ: lỗi thì vẫn dùng được trang
  ]);
  return { session, roster: roster.items, board, matches: matches.items, signups: signups.items || [] };
};

const SIGNUP_BADGE = {
  registered: ['sky', 'Đã giữ chỗ'],
  waitlisted: ['amber', 'Đang chờ'],
  attended: ['emerald', 'Đã đến']
};

// Một dòng đăng ký online (plan 27): khách báo trước, nhân viên điểm danh nhanh khi họ tới quầy; gỡ được (người chờ lên).
export function SignupRow({ r, open, operate, onCheckIn, onRemove, busy }) {
  const [tone, label] = SIGNUP_BADGE[r.status] || ['slate', r.status];
  const flagged = (r.flags || []).includes('quick') || (r.flags || []).includes('self_unverified');
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-1.5 text-sm" data-signup={r.id}>
      <span className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-white">{r.name || 'Người chơi'}</span>
      <small className="tabular-nums text-slate-500">{r.rating != null ? Number(r.rating).toFixed(2) : 'chưa có điểm'}</small>
      {flagged && <Badge variant="amber">chưa xác nhận trình</Badge>}
      <Badge variant={tone}>{label}{r.status === 'waitlisted' && r.waitlistPosition ? ` · thứ ${r.waitlistPosition}` : ''}</Badge>
      {operate && open && r.status === 'registered' && !r.present && (
        <button type="button" disabled={busy} onClick={() => onCheckIn(r)} className="rounded-lg bg-emerald-500 px-2.5 py-0.5 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50">Điểm danh</button>
      )}
      {operate && open && r.status !== 'attended' && (
        <button type="button" disabled={busy} onClick={() => onRemove(r)} className="text-xs font-bold text-rose-600 hover:underline disabled:opacity-50">Gỡ</button>
      )}
    </li>
  );
}

function CourtCard({ court, match, live, skew, open, operate, onLive, onScore, scoreOpen, setScoreOpen, onEnd, onCancel, busy, scoreError }) {
  if (!match) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4" data-court={court}>
        <div className="flex items-center justify-between gap-2"><b className="text-base text-slate-900 dark:text-white">{courtName(court)}</b><Badge variant="emerald">Trống</Badge></div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{open ? 'Sân trống — điểm danh đủ người rồi bấm "Xếp sân trống".' : 'Không có trận.'}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4" data-court={court}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <b className="text-base text-slate-900 dark:text-white">
          {courtName(court)}
          {match.scoring.bestOf > 1 && <Badge variant="violet"> {match.scoring.bestOf} game</Badge>}
        </b>
        <Badge variant="amber">Đang đánh · <Elapsed since={match.calledAt} skew={skew} /></Badge>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{roundLabel(match)}</p>
      {live ? (
        <ScoreBoard match={match} live={live} />
      ) : (
        <div className="space-y-1 text-sm font-semibold text-slate-900 dark:text-white">
          <div><TeamNames team={match.teamA} /></div>
          <div className="text-xs font-normal text-slate-400">vs</div>
          <div><TeamNames team={match.teamB} /></div>
        </div>
      )}
      {operate && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => onLive(match)}>Bấm điểm</Button>
          <Button variant="secondary" onClick={() => setScoreOpen(!scoreOpen)}>Nhập tỉ số</Button>
          <Button variant="secondary" onClick={() => onEnd(match)}>Xong (không tỉ số)</Button>
          <Button variant="secondary" onClick={() => onCancel(match)}>Huỷ trận</Button>
        </div>
      )}
      {scoreOpen && <div className="mt-3"><ScoreForm match={match} busy={busy} error={scoreError} onSubmit={(body, outcome) => onScore(match, body, outcome)} onCancel={() => setScoreOpen(false)} /></div>}
    </div>
  );
}

function RosterRow({ r, note, next, operate, onLeave, busy }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-1.5 text-sm ${next ? 'bg-emerald-500/10' : ''}`} data-player={r.playerId}>
      <span className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-white">{r.name}</span>
      {r.pairingRating != null && <small className="tabular-nums text-slate-500">{Number(r.pairingRating).toFixed(2)}</small>}
      <small className="text-slate-500">{r.gamesPlayed} trận</small>
      <small className="text-slate-500">{note}</small>
      {next && <Badge variant="emerald">vào sân tới</Badge>}
      {operate && r.status === 'present' && !r.onCourt && <button type="button" disabled={busy} onClick={() => onLeave(r)} className="text-xs font-bold text-rose-600 hover:underline disabled:opacity-50">Rời buổi</button>}
    </li>
  );
}

export default function SessionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useCompetition();
  const perms = permissionsFor(user);
  const operate = perms.canOperate;
  const { courts: branchCourts } = useCourts();
  const { usage } = useCourtUsage();

  const [liveScores, setLiveScores] = useState(new Map());
  const [skew, setSkew] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [scoreOpen, setScoreOpen] = useState(null);
  const [people, setPeople] = useState(null);
  const [pick, setPick] = useState(null);
  const [pickKey, setPickKey] = useState(0);
  const [touched, setTouched] = useState(false);
  const [showMatches, setShowMatches] = useState(false);

  const load = useCallback(() => loadAll(id), [id]);
  const onEvent = useCallback((name, payload) => {
    if (name === 'snapshot') {
      if (payload.serverTime) setSkew(Date.parse(payload.serverTime) - Date.now());
      setLiveScores((map) => (payload.matches || []).reduce((acc, x) => (x.live ? mergeLive(acc, x.matchId, x.live) : acc), map));
    } else if (name === 'score' && payload.live) {
      setLiveScores((map) => mergeLive(map, payload.matchId, payload.live));
    }
  }, []);
  const { data, loading, error, reload, pending, setBusy, status } = useLiveResource({ load, stream: { kind: 'sessions', id }, onEvent });
  const [run, { busy: acting, error: actionError, clearError }] = useAction({ onReload: () => reload({ silent: true }) });

  useEffect(() => { setBusy(Boolean(dialog || confirm || scoreOpen || touched)); }, [dialog, confirm, scoreOpen, touched, setBusy]);

  const session = data ? data.session : null;
  const open = session && session.status === 'open';
  const discipline = session && session.format === 'singles' ? 'singles' : 'doubles';

  // Danh sách người để điểm danh: tải một lần khi buổi mở.
  useEffect(() => {
    if (!open || !operate) return undefined;
    let alive = true;
    playersApi.list().then((r) => { if (alive) setPeople(r.items); }).catch(() => { if (alive) setPeople([]); });
    return () => { alive = false; };
  }, [open, operate]);

  const groups = useMemo(() => (data ? rosterGroups(data.roster) : null), [data]);
  const nextIds = useMemo(() => new Set(data ? data.board.queue.filter((q) => q.next).map((q) => q.playerId) : []), [data]);
  const options = useMemo(() => {
    if (!people || !data) return [];
    const taken = new Set(data.roster.filter((r) => r.status === 'present').map((r) => r.playerId));
    return buildOptions(people, taken, discipline, new Map());
  }, [people, data, discipline]);

  const exec = useCallback(async (fn, success, opts = {}) => {
    const res = await run(fn, { onError: (e) => { if (!opts.silentError) toast(e.message, 'error'); opts.onError?.(e); } });
    if (res === undefined) return undefined;
    const message = typeof success === 'function' ? success(res) : success;
    if (message) toast(message);
    await reload({ silent: true });
    return res;
  }, [run, toast, reload]);

  const closeAnd = (message) => { setDialog(null); if (message) toast(message); reload({ silent: true }); };

  const checkIn = async (person, quickLevel) => {
    const res = await exec(() => sessionsApi.checkIn(id, person.id, quickLevel), () => (quickLevel ? `Đã chấm nhanh và điểm danh ${person.label}` : `Đã điểm danh ${person.label}`), {
      silentError: true,
      onError: (e) => {
        const plan = checkInPlan(e);
        if (plan.kind === 'quick') { setDialog({ type: 'quick', person }); return; }
        if (plan.kind === 'elsewhere') {
          setConfirm({
            title: 'Rời buổi kia rồi điểm danh?',
            text: `${person.label} đang có mặt ở buổi "${plan.sessionName}". Cho rời buổi đó rồi điểm danh ở buổi này?`,
            confirmLabel: 'Rời buổi kia và điểm danh',
            action: async () => {
              await sessionsApi.leave(plan.sessionId, person.id);
              await sessionsApi.checkIn(id, person.id, quickLevel);
              return `Đã chuyển ${person.label} sang buổi này`;
            }
          });
          return;
        }
        toast(e.message, 'error');
      }
    });
    if (res !== undefined) { setDialog(null); setPick(null); setPickKey((k) => k + 1); setTouched(false); }
  };

  const removeSignup = (r) => setConfirm({
    title: `Gỡ đăng ký online — ${r.name || 'người chơi'}`,
    text: 'Gỡ khỏi danh sách đăng ký; người đầu danh sách chờ (nếu có) được lên. Người này vẫn điểm danh được tại quầy.',
    confirmLabel: 'Gỡ đăng ký',
    danger: true,
    action: async () => { await sessionsApi.removeSignup(id, r.id); return `Đã gỡ ${r.name || 'người chơi'}`; }
  });

  const leave = (r) => setConfirm({
    title: `Rời buổi — ${r.name}`,
    text: 'Người này không còn trong hàng chờ. Quay lại điểm danh được; số trận đã đánh được giữ.',
    confirmLabel: 'Rời buổi',
    danger: true,
    action: async () => { await sessionsApi.leave(id, r.playerId); return `${r.name} đã rời buổi`; }
  });

  const runConfirm = async () => {
    const c = confirm;
    const res = await exec(c.action, (r) => (typeof r === 'string' ? r : r && r.message));
    setConfirm(null);
    if (res !== undefined) { setPick(null); setPickKey((k) => k + 1); setTouched(false); }
  };

  const saveScore = (m, body, outcome) => exec(() => matchesApi.result(m.id, body, m.version), RESULT_TOAST[outcome] || 'Đã ghi tỉ số').then((res) => { if (res !== undefined) setScoreOpen(null); });
  const endMatch = (m) => setConfirm({
    title: 'Xong, không tỉ số',
    text: `${teamText(m.teamA)} vs ${teamText(m.teamB)} kết thúc không ghi tỉ số — sân trống ngay, trận không tính điểm.`,
    confirmLabel: 'Xong',
    action: async () => { await matchesApi.end(m.id); return 'Đã kết thúc trận (không tỉ số)'; }
  });
  const cancelMatch = (m) => setConfirm({
    title: 'Huỷ trận',
    text: `Huỷ trận ${teamText(m.teamA)} vs ${teamText(m.teamB)}: sân trống, mọi người về hàng chờ, số trận đã đánh được trừ lại.`,
    confirmLabel: 'Huỷ trận',
    danger: true,
    action: async () => { await matchesApi.cancel(m.id); return 'Đã huỷ trận'; }
  });

  if (loading && !data) return <div className="mx-auto max-w-6xl p-4 sm:p-8"><Spinner label="Đang tải buổi giao lưu…" /></div>;
  if (error && !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-4 sm:p-8">
        <Notice error={error} onRetry={() => reload()} />
        <Link to="/competition/sessions" className="text-sm font-bold text-emerald-600 hover:underline">← Danh sách buổi</Link>
      </div>
    );
  }
  if (!data) return null;

  const { board, matches } = data;
  const need = perCourt(session.format);
  const freeCourts = board.courts.filter((c) => c.status === 'free').length;
  const canFill = open && operate && freeCourts > 0 && groups.waiting.length >= need;
  const more = [
    operate && open ? ['edit', 'Sửa buổi / đổi luật điểm…'] : null,
    operate && open ? ['close', 'Đóng buổi…'] : null,
    operate && open ? ['cancel', 'Huỷ buổi'] : null
  ].filter(Boolean);
  const doMore = (key) => {
    if (key === 'edit') setDialog({ type: 'edit' });
    else if (key === 'close') setDialog({ type: 'close' });
    else if (key === 'cancel') {
      setConfirm({
        title: 'Huỷ buổi giao lưu',
        text: 'Các trận đang đánh bị huỷ, không tính điểm. Không hoàn tác được.',
        confirmLabel: 'Huỷ buổi',
        danger: true,
        action: async () => { await sessionsApi.cancel(id); return 'Đã huỷ buổi'; }
      });
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-8">
      <Link to="/competition/sessions" className="mb-3 inline-block text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Danh sách buổi</Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-black text-slate-900 dark:text-white">{session.name} <StatusBadge status={session.status} kind="session" /></h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sessionInfo(session)}</p>
          </div>
          <ConnectionDot status={status} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-500/10 px-4 py-3" data-testid="todo">
          <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100">
            {open
              ? `${board.counts.present} người có mặt · ${board.counts.onCourt} đang trên sân · ${board.counts.waiting} đang chờ · ${freeCourts} sân trống. ${canFill ? 'Đủ người cho sân trống — bấm "Xếp sân trống".' : board.counts.present < need ? `Cần ít nhất ${need} người có mặt — điểm danh bên dưới.` : 'Chờ sân trống hoặc thêm người.'}`
              : session.status === 'closed' ? 'Buổi đã đóng.' : 'Buổi đã huỷ.'}
          </span>
          {canFill && <Button onClick={() => setDialog({ type: 'fill' })}>Xếp sân trống…</Button>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => window.open(`/competition/sessions/${id}/board`, '_blank')}>Màn hình TV ↗</Button>
          {open && operate && !canFill && freeCourts > 0 && <Button variant="secondary" onClick={() => setDialog({ type: 'fill' })}>Xếp sân trống…</Button>}
          <MoreMenu items={more} onPick={doMore} />
          <Button variant="secondary" onClick={() => reload()}>Tải lại</Button>
        </div>
      </Card>

      <div className="mt-4">
        {pending && <UpdateBanner onReload={() => { setTouched(false); setScoreOpen(null); reload({ silent: true }); }} />}
        {error && <div className="mb-3"><Notice error={error} onRetry={() => reload({ silent: true })} /></div>}

        <Card title="Sân">
          <div className="grid gap-3 md:grid-cols-2">
            {board.courts.map((c) => (
              <CourtCard
                key={c.courtRef}
                court={c.courtRef}
                match={c.match}
                live={c.match ? pickNewest(c.match.live, liveScores.get(c.match.id)) : null}
                skew={skew}
                open={open}
                operate={operate && open}
                onLive={(m) => navigate(`/competition/live/${m.id}`)}
                onScore={saveScore}
                scoreOpen={Boolean(c.match) && scoreOpen === c.match.id}
                setScoreOpen={(o) => { clearError(); setScoreOpen(o && c.match ? c.match.id : null); }}
                onEnd={endMatch}
                onCancel={cancelMatch}
                busy={acting}
                scoreError={actionError}
              />
            ))}
          </div>
        </Card>

        {(data.signups.length > 0 || session.maxPlayers) && (
          <Card title={`Đăng ký online (${signupSummary(data.signups, session.maxPlayers)})`} className="mt-4">
            {data.signups.length === 0 && <EmptyState>Chưa có khách nào đăng ký online.</EmptyState>}
            <ul className="space-y-0.5" data-testid="signups">
              {data.signups.map((r) => (
                <SignupRow key={r.id} r={r} open={open} operate={operate} busy={acting} onRemove={removeSignup} onCheckIn={(row) => checkIn({ id: row.playerId, label: row.name || 'người chơi' })} />
              ))}
            </ul>
            {open && operate && data.signups.length > 0 && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Khách tới quầy: bấm "Điểm danh" ngay trên dòng — không cần gõ tên ở ô điểm danh bên dưới.</p>}
          </Card>
        )}

        <Card title={open ? `Điểm danh · hàng chờ (${groups.present.length} người có mặt)` : `Người chơi (${data.roster.length})`} className="mt-4">
          {open && operate && (
            <form
              aria-label="Điểm danh"
              className="mb-4 flex flex-wrap items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); if (pick) checkIn(pick); }}
              onChangeCapture={() => setTouched(true)}
              onBlurCapture={(e) => { if (e.target.value === '') setTouched(false); }}
            >
              <PersonPicker key={pickKey} people={options} value={pick} onChange={setPick} placeholder={people ? 'Gõ tên để điểm danh…' : 'Đang tải danh sách người chơi…'} disabled={acting || !people} />
              <Button type="submit" busy={acting} disabled={!pick}>Điểm danh</Button>
            </form>
          )}
          {data.roster.length === 0 && <EmptyState>{open ? 'Chưa ai có mặt.' : 'Buổi không có ai điểm danh.'}</EmptyState>}
          {!open && groups.present.length > 0 && (
            <ul className="space-y-0.5">{groups.present.map((r) => <RosterRow key={r.playerId} r={r} note="" operate={false} />)}</ul>
          )}
          {open && groups.waiting.length > 0 && (
            <>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Đang chờ — theo thứ tự ưu tiên xếp sân</h4>
              <ol className="mb-3 space-y-0.5">
                {board.queue.map((q) => {
                  const r = data.roster.find((x) => x.playerId === q.playerId);
                  return r ? <RosterRow key={q.playerId} r={r} note={rosterNote(r)} next={q.next} operate={operate && open} onLeave={leave} busy={acting} /> : null;
                })}
              </ol>
            </>
          )}
          {open && groups.onCourt.length > 0 && (
            <>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Đang trên sân</h4>
              <ul className="mb-3 space-y-0.5">{groups.onCourt.map((r) => <RosterRow key={r.playerId} r={r} note={rosterNote(r)} operate={false} />)}</ul>
            </>
          )}
          {groups.left.length > 0 && (
            <>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Đã rời</h4>
              <ul className="space-y-0.5 opacity-70">{groups.left.map((r) => <RosterRow key={r.playerId} r={r} note={rosterNote(r)} operate={false} />)}</ul>
            </>
          )}
        </Card>

        <Card title={`Các trận (${matches.filter((m) => m.status !== 'cancelled').length})`} className="mt-4" actions={<button type="button" className="text-xs font-bold text-emerald-600 hover:underline" onClick={() => setShowMatches(!showMatches)}>{showMatches ? 'Thu gọn' : 'Xem tất cả'}</button>}>
          {matches.length === 0 && <EmptyState>Chưa xếp trận nào.</EmptyState>}
          <ul className="space-y-1 text-sm">
            {(showMatches ? matches : matches.slice(-6)).map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-2" data-match={m.id}>
                <small className="w-16 text-slate-500">{roundLabel(m)}</small>
                <span className="font-semibold"><TeamNames team={m.teamA} /> <span className="font-normal text-slate-400">vs</span> <TeamNames team={m.teamB} /></span>
                <small className="text-slate-500">{m.courtRef ? courtName(m.courtRef) : ''}</small>
                {m.status === 'completed' ? <b className="tabular-nums">{m.games.map((g) => g.join('–')).join(', ')}</b> : <StatusBadge status={m.status} kind="match" />}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {dialog && dialog.type === 'edit' && (
        <SessionFormDialog session={session} branchCourts={branchCourts} usage={usage} formatLocked={matches.some((m) => m.status !== 'cancelled')} onClose={() => setDialog(null)} onDone={closeAnd} />
      )}
      {dialog && dialog.type === 'fill' && <FillDialog session={session} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'close' && <CloseDialog session={session} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'quick' && (
        <QuickLevelDialog person={dialog.person} discipline={discipline} busy={acting} error={actionError} onClose={() => setDialog(null)} onPick={(level) => checkIn(dialog.person, level)} />
      )}
      {confirm && <ConfirmDialog title={confirm.title} text={confirm.text} confirmLabel={confirm.confirmLabel} danger={confirm.danger} busy={acting} onConfirm={runConfirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
