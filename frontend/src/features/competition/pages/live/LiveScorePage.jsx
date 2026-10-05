import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { liveApi, matchesApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useAction } from '../../hooks/useAction';
import { useCourts } from '../../hooks/useCourts';
import { useCompetition } from '../../context/CompetitionContext';
import { permissionsFor } from '../../lib/permissions';
import { pickNewest } from '../../lib/live';
import { courtName, teamText } from '../../lib/format';
import { backTarget, confirmMode, gameBreakOf, gamesLine, holdsCourt, loadFlip, midChangeHalf, notScorable, pointsOf, saveFlip, sidesOf, statusLine } from '../../lib/liveScoring';
import { matchTitle } from '../../lib/tournamentModel';
import { ConnectionDot, Notice, Spinner } from '../../components/ui';
import { Dialog } from '../../components/Dialog';
import Elapsed from '../../components/Elapsed';

// Bấm điểm trực tiếp (07 mục 1.2, 06 mục 1.5) — điện thoại, cầm dọc, toàn màn hình. Hai nửa là hai đội, chạm nửa nào +1 điểm cho đội đó.
// Hai nửa đi theo bên sân (`live.endsSwapped`); "⇆ Đổi bên" lật thêm riêng trên máy này (nhớ theo trận). Mỗi lần bấm gửi `revision` + Idempotency-Key;
// máy khác vừa bấm (409 LIVE_CONFLICT) → tải lại tỉ số rồi báo. Dùng cho nhân viên (`mode="staff"`) và người chơi trong trận (`mode="player"`, c5).

const SIDE_STYLE = {
  A: { bg: 'bg-emerald-600 active:bg-emerald-500', ring: 'ring-emerald-300', tag: 'text-emerald-100' },
  B: { bg: 'bg-sky-600 active:bg-sky-500', ring: 'ring-sky-300', tag: 'text-sky-100' }
};

function Half({ side, team, points, serving, serveFrom, disabled, onTap, position }) {
  const names = team && team.players ? team.players : [];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onTap}
      aria-label={`+1 điểm cho ${teamText(team) || `đội ${side}`}`}
      data-side={side}
      data-position={position}
      className={`relative flex min-h-0 flex-1 select-none flex-col items-center justify-between rounded-3xl px-2 py-4 text-white shadow-lg transition-transform ${SIDE_STYLE[side].bg} ${disabled ? 'opacity-60' : 'active:scale-[0.99]'} ${serving ? `ring-4 ${SIDE_STYLE[side].ring}` : ''}`}
    >
      <span className={`text-xs font-bold uppercase tracking-wider ${SIDE_STYLE[side].tag}`}>{position === 'left' ? 'Bên trái' : 'Bên phải'} · Đội {side}</span>
      <span className="flex flex-col items-center gap-0.5 text-center text-base font-bold leading-tight sm:text-xl">
        {names.length ? names.map((p) => <span key={p.id || p.name} className="max-w-full break-words">{p.name}</span>) : <span>Đội {side}</span>}
      </span>
      <span className="text-[7rem] font-black leading-none tabular-nums sm:text-[10rem]" data-testid={`points-${side}`}>{points}</span>
      <span className="h-12 text-center text-sm font-bold">
        {serving && <span><span className="text-2xl" aria-hidden="true">🏸</span><br />giao · ô {serveFrom === 'right' ? 'phải' : 'trái'}</span>}
      </span>
    </button>
  );
}

const barBtn = 'rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-40';

export default function LiveScorePage({ mode = 'staff' }) {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useCompetition();
  const perms = permissionsFor(user);
  const isStaff = mode === 'staff' && perms.canOperate;
  useCourts();

  const [live, setLive] = useState(null);
  const [skew, setSkew] = useState(0);
  const [ack, setAck] = useState(0);
  const [flip, setFlip] = useState(() => loadFlip(matchId));
  const [dialog, setDialog] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [match, current] = await Promise.all([matchesApi.get(matchId), liveApi.get(matchId)]);
    setLive((known) => pickNewest(known && known.matchId === matchId ? known : null, current));
    return match;
  }, [matchId]);

  const [stream, setStream] = useState(null);
  const onEvent = useCallback((name, payload) => {
    if (name === 'snapshot') {
      if (payload.serverTime) setSkew(Date.parse(payload.serverTime) - Date.now());
      const mine = (payload.matches || []).find((x) => x.matchId === matchId);
      if (mine && mine.live) setLive((known) => pickNewest(known, mine.live));
    } else if (name === 'score' && payload.matchId === matchId && payload.live) {
      setLive((known) => pickNewest(known, payload.live));
    }
  }, [matchId]);

  const { data: match, loading, error, reload, status } = useLiveResource({ load, stream, onEvent });
  useEffect(() => {
    if (match) setStream((s) => {
      const next = { kind: match.contextType === 'session' ? 'sessions' : 'tournaments', id: match.contextId };
      return s && s.kind === next.kind && s.id === next.id ? s : next;
    });
  }, [match]);

  const [run, { busy }] = useAction({ onReload: () => reload({ silent: true }) });

  // Giữ màn hình sáng trong lúc bấm điểm (không phải trình duyệt nào cũng có).
  useEffect(() => {
    let lock = null;
    let cancelled = false;
    const acquire = () => {
      if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((l) => { if (cancelled) l.release(); else lock = l; }).catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', acquire); if (lock) lock.release().catch(() => {}); };
  }, []);

  // Hoàn tác về trước điểm cuối game → số game xong giảm: nhớ lại mốc "Tiếp tục" cho khớp.
  const doneGames = live ? live.games.length : 0;
  useEffect(() => { setAck((a) => (a > doneGames ? doneGames : a)); }, [doneGames]);

  const sides = useMemo(() => sidesOf(live, flip), [live, flip]);
  const teamOf = (side) => (match ? (side === 'A' ? match.teamA : match.teamB) : null);

  if (!match && loading) return <Shell><Spinner label="Đang tải trận…" /></Shell>;
  if (!match) {
    return (
      <Shell>
        <div className="space-y-3 p-4">
          <Notice error={error} onRetry={() => reload()} />
          <Link to="/competition" className="text-sm font-bold text-emerald-400 hover:underline">← Về trang Thi đấu</Link>
        </div>
      </Shell>
    );
  }

  const back = backTarget(match);
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(back.to));
  const blocked = notScorable(match);
  const current = live || { games: [], current: [0, 0], gameNo: 1, gamesWon: [0, 0], server: 'A', serveFrom: 'right', endsSwapped: false, decided: false, revision: 0, rallies: '' };
  const brk = gameBreakOf(current, ack);
  const half = midChangeHalf(match, current);
  const scoring = !blocked && !current.decided && !brk;
  const started = current.rallies.length > 0;
  const rated = match.contextType === 'tournament';
  const apply = (fn) => run(async () => { const next = await fn(); setLive((known) => pickNewest(known, next)); }, { onError: (e) => toast(e.message, 'error') });

  const tap = (side) => { if (scoring) apply(() => liveApi.rally(matchId, side, current.revision)); };
  const undo = () => apply(() => liveApi.undo(matchId, current.revision));
  const setFirst = (side) => apply(() => liveApi.setServer(matchId, side, current.revision));
  const flipSides = () => { const next = !flip; setFlip(next); saveFlip(matchId, next); };
  const confirm = async () => {
    const res = await run(() => liveApi.confirm(matchId, current.revision), { onError: (e) => toast(e.message, 'error') });
    if (res === undefined) return;
    setSaved(true);
    toast('Đã lưu kết quả');
    await reload({ silent: true });
  };
  const retire = async (side) => {
    const res = await run(() => liveApi.retire(matchId, side, current.revision), { onError: (e) => { setDialog(null); toast(e.message, 'error'); } });
    if (res === undefined) return;
    setDialog(null);
    setSaved(true);
    toast(`${teamText(side === 'A' ? match.teamA : match.teamB)} không đánh tiếp được — đối thủ thắng`);
    await reload({ silent: true });
  };

  const leftSide = sides[0];
  const mode2 = confirmMode({ isStaff, rated: rated && !isStaff });
  const finished = saved || match.status === 'completed' || match.status === 'ended';

  return (
    <Shell>
      <header className="flex items-center gap-2 px-3 pt-3 text-white">
        <button type="button" onClick={goBack} className="rounded-xl border border-white/20 px-3 py-2 text-sm font-bold hover:bg-white/10" aria-label="Quay lại">←</button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            {match.courtRef ? courtName(match.courtRef) : 'Chưa ra sân'}
            {match.status === 'in_play' && match.calledAt && <span className="ml-2 font-normal text-white/60">· <Elapsed since={match.calledAt} skew={skew} /></span>}
          </div>
          <div className="truncate text-xs text-white/60">{matchTitle(match)}</div>
        </div>
        <span className="text-white"><ConnectionDot status={status} /></span>
      </header>

      <div className="px-3 pt-2 text-center text-white">
        <p className="text-sm font-bold" data-testid="status-line">{statusLine(match, current, sides)}</p>
        {current.games.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-xs">
            {current.games.map((g, i) => (
              <span key={i} className="rounded-full bg-white/15 px-2.5 py-0.5 font-bold tabular-nums">G{i + 1} {pointsOf(g, sides[0])}–{pointsOf(g, sides[1])}</span>
            ))}
          </p>
        )}
      </div>

      {blocked && <div className="px-3 pt-2"><Notice kind="warn">{blocked}</Notice></div>}

      {brk && (
        <div className="mx-3 mt-2 rounded-2xl border-2 border-amber-400 bg-amber-400/15 p-3 text-center text-sm font-semibold text-amber-100" data-testid="game-break">
          Hết game {brk.endedNo}: {brk.score[0]}–{brk.score[1]} — sang game {brk.nextNo}, <b>đổi sân</b>{holdsCourt(match, current) ? ', chưa nhả sân' : ''}.
          <br />
          <span className="text-amber-200">{teamText(teamOf(leftSide)) || `Đội ${leftSide}`} bên trái.</span>
          <div className="mt-2"><button type="button" onClick={() => setAck(brk.endedNo)} className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-black text-slate-950">Tiếp tục</button></div>
        </div>
      )}

      {!brk && half && (
        <div className="mx-3 mt-2 rounded-2xl border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-center text-xs font-semibold text-amber-100" data-testid="mid-change">
          Game quyết định: có đội chạm {half} — <b>đổi sân</b> ({teamText(teamOf(leftSide)) || `Đội ${leftSide}`} bên trái).
        </div>
      )}

      {!blocked && !started && !current.decided && (
        <div className="mx-3 mt-2 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-white" data-testid="first-server">
          <span>Đội giao trước:</span>
          {['A', 'B'].map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => current.firstServer !== s && setFirst(s)}
              aria-pressed={current.firstServer === s}
              className={`rounded-full px-3 py-1 font-bold ${current.firstServer === s ? 'bg-white text-slate-900' : 'border border-white/30 text-white hover:bg-white/10'}`}
            >
              {teamText(teamOf(s)) || `Đội ${s}`}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {sides.map((side, i) => (
          <Half
            key={side}
            side={side}
            team={teamOf(side)}
            points={current.decided ? pointsOf(current.games[current.games.length - 1] || [0, 0], side) : pointsOf(current.current, side)}
            serving={!current.decided && current.server === side}
            serveFrom={current.serveFrom}
            disabled={!scoring || busy}
            onTap={() => tap(side)}
            position={i === 0 ? 'left' : 'right'}
          />
        ))}
      </div>

      {current.decided && !finished && (
        <div className="mx-3 mb-2 rounded-2xl border-2 border-emerald-400 bg-emerald-400/15 p-3 text-center text-white" data-testid="decided">
          <p className="text-sm font-bold">Trận đã xong: {gamesLine(current)}</p>
          <p className="text-xs text-emerald-100">{teamText(teamOf(current.winnerSide)) || `Đội ${current.winnerSide}`} thắng.</p>
          {mode2 === 'wait-staff'
            ? <p className="mt-2 text-sm font-bold text-amber-200">Chờ nhân viên xác nhận kết quả.</p>
            : <button type="button" onClick={confirm} disabled={busy} className="mt-2 w-full rounded-2xl bg-emerald-400 px-5 py-3 text-base font-black text-slate-950 disabled:opacity-60">{busy ? 'Đang lưu…' : 'Xác nhận kết quả'}</button>}
        </div>
      )}

      {finished && (
        <div className="mx-3 mb-2 rounded-2xl border-2 border-emerald-400 bg-emerald-400/15 p-3 text-center text-white" data-testid="saved">
          <p className="text-sm font-bold">Đã lưu kết quả{match.games && match.games.length ? `: ${match.games.map((g) => g.join('–')).join(', ')}` : ''}.</p>
          {isStaff && (
            <button type="button" onClick={goBack} className="mt-2 w-full rounded-2xl bg-white px-5 py-3 text-base font-black text-slate-950">{back.label}</button>
          )}
        </div>
      )}
      {!finished && blocked && isStaff && (
        <div className="mx-3 mb-2"><button type="button" onClick={goBack} className="w-full rounded-2xl bg-white px-5 py-3 text-base font-black text-slate-950">{back.label}</button></div>
      )}

      <footer className="flex flex-wrap items-center justify-center gap-2 px-3 pb-4">
        <button type="button" className={barBtn} disabled={busy || !started || Boolean(blocked) || finished} onClick={undo}>↶ Hoàn tác</button>
        <button type="button" className={barBtn} onClick={flipSides} aria-pressed={flip}>⇆ Đổi bên{flip ? ' (đang lật)' : ''}</button>
        {isStaff && !blocked && !finished && rated && !current.decided && (
          <button type="button" className={barBtn} disabled={busy} onClick={() => setDialog('retire')}>Không đánh tiếp được…</button>
        )}
        {isStaff && !blocked && !finished && (
          <Link to={`/competition/score/${matchId}`} className={`${barBtn} inline-block`}>Nhập tỉ số tay</Link>
        )}
      </footer>

      {dialog === 'retire' && (
        <Dialog title="Không đánh tiếp được" onClose={() => setDialog(null)}>
          <p>Đội nào không đánh tiếp được (đau, có việc phải về)? Đội đó thua; các game đã xong được giữ, game đang dở bỏ; đối thủ thắng / đi tiếp.</p>
          <div className="grid gap-2">
            {['A', 'B'].map((s) => (
              <button key={s} type="button" disabled={busy} onClick={() => retire(s)} className="rounded-2xl border border-slate-300 px-4 py-3 text-left font-bold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800" data-retire={s}>
                {teamText(teamOf(s)) || `Đội ${s}`} không đánh tiếp được
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </Shell>
  );
}

// Toàn màn hình, nền tối: che luôn thanh menu để không bấm nhầm khi đang bấm điểm. Dựng thẳng vào <body> (portal): nằm trong khung của
// SidebarLayout thì z-index bị nhốt trong khung đó và thanh menu dưới của điện thoại vẫn đè lên.
function Shell({ children }) {
  const el = <div className="fixed inset-0 z-[45] flex flex-col overflow-y-auto bg-slate-950" data-testid="live-shell">{children}</div>;
  return typeof document === 'undefined' ? el : createPortal(el, document.body);
}
