import React, { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { meApi } from '../../api/tournaments';
import { publicSessionsApi } from '../../api/publicApi';
import { useLiveResource } from '../../hooks/useLiveResource';
import { groupByTournament, myLiveMatch, myTournamentState } from '../../lib/customer';
import { courtName, gamesText, orgName, teamText } from '../../lib/format';
import { matchTitle } from '../../lib/tournamentModel';
import { hubPaths, sessionWhen } from '../../lib/publicHub';
import { Badge } from '../../../../components/UIComponents';
import { Card, EmptyState, Notice, Spinner } from '../../components/ui';
import CustomerShell from '../../components/CustomerShell';

// Giải của tôi (07 mục 1.1): giải đang đánh / đã đánh, lịch trận của mình (lượt, sân), kết quả, thứ hạng. Trận đang đánh có nút "Bấm điểm" (tự bấm điểm trận của mình;
// trận tính điểm thì nhân viên xác nhận).

const TONE = { live: 'amber', wait: 'amber', open: 'sky', done: 'emerald', bad: 'rose' };

function TournamentCard({ item, matches, done = [] }) {
  const t = item.tournament;
  const state = myTournamentState(item);
  const live = myLiveMatch(matches);
  const upcoming = matches.filter((m) => m.status !== 'in_play');
  return (
    <div data-tournament={t.id}>
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">{t.name}</h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{orgName(t.organizerRef)} · {t.startsOn}{t.startTime ? ` ${t.startTime}` : ''}</p>
        </div>
        <Badge variant={TONE[state.tone] || 'slate'}>{state.label}</Badge>
      </div>
      <p className="mt-1 text-xs"><Link to={hubPaths.tournament(t.id)} className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline" data-testid="my-public-link">{t.status === 'open' ? 'Xem trang giải / rút đăng ký →' : 'Xem trang giải →'}</Link></p>

      {live && (
        <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3" data-testid="my-live-match">
          <p className="text-sm font-bold text-amber-200">Bạn đang thi đấu{live.courtRef ? ` ở ${courtName(live.courtRef)}` : ''}</p>
          <p className="text-sm text-slate-800 dark:text-slate-200">{teamText(live.teamA)} <span className="text-slate-600 dark:text-slate-500">vs</span> {teamText(live.teamB)}</p>
          <Link to={`/my-matches/${live.id}/score`} className="mt-2 inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-emerald-400">Bấm điểm trận này</Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Lịch trận sắp tới</h3>
          <ul className="space-y-1 text-sm">
            {upcoming.map((m) => (
              <li key={m.id}><b>{matchTitle(m)}</b> · {teamText(m.teamA) || 'chờ xác định'} <span className="text-slate-600 dark:text-slate-500">vs</span> {teamText(m.teamB) || 'chờ xác định'}{m.expectedTime ? ` · dự kiến ${m.expectedTime}` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        {item.playedMatches > 0 ? `Đã đánh ${item.playedMatches} trận` : 'Chưa đánh trận nào'}{item.upcomingMatches > 0 ? ` · còn ${item.upcomingMatches} trận` : ''}
        {item.partnerPlayerId ? ' · đánh đôi cặp đăng ký sẵn' : ''}
      </p>
      {done.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Kết quả các trận của bạn</h3>
          <ul className="space-y-1 text-sm">
            {done.map((m) => (
              <li key={m.id}><b>{matchTitle(m)}</b> · {teamText(m.teamA)} <span className="text-slate-600 dark:text-slate-500">vs</span> {teamText(m.teamB)} · <b className="tabular-nums">{m.outcome === 'walkover' ? 'W.O.' : gamesText(m.games)}</b></li>
            ))}
          </ul>
        </div>
      )}
    </Card>
    </div>
  );
}

function SessionCard({ item }) {
  const s = item.session;
  const wait = item.signup.status === 'waitlisted';
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3" data-session={s.id}>
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-900 dark:text-white">{s.name}</h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{orgName(s.organizerRef)} · {sessionWhen(s.startsAt)}</p>
        </div>
        <Badge variant={wait ? 'amber' : 'emerald'}>{wait ? `Chờ chỗ${item.signup.waitlistPosition ? ` · thứ ${item.signup.waitlistPosition}` : ''}` : 'Đã giữ chỗ'}</Badge>
      </div>
      <p className="mt-2 text-xs"><Link to={hubPaths.session(s.id)} className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline">Xem buổi giao lưu / huỷ đăng ký →</Link></p>
    </Card>
  );
}

const loadAll = async () => {
  const [tournaments, upcoming, history, sessions] = await Promise.all([
    meApi.tournaments(),
    meApi.matches({ scope: 'upcoming', limit: 100 }).catch(() => ({ items: [] })),
    meApi.matches({ scope: 'history', limit: 100 }).catch(() => ({ items: [] })),
    publicSessionsApi.mine().catch(() => ({ items: [] }))
  ]);
  return { items: tournaments.items, sessions: sessions.items || [], upcoming: groupByTournament(upcoming.items), history: groupByTournament(history.items) };
};

export default function MyTournamentsPage() {
  const load = useCallback(() => loadAll(), []);
  const { data, loading, error, reload } = useLiveResource({ load });
  // Khách không mở được luồng SSE của giải → tự tải lại mỗi 8 giây để thấy trận vừa được gọi ra sân.
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload({ silent: true }); }, 8000);
    return () => clearInterval(timer);
  }, [reload]);
  const items = data ? data.items : [];
  const current = items.filter((i) => !['finalized', 'cancelled'].includes(i.tournament.status));
  const past = items.filter((i) => ['finalized', 'cancelled'].includes(i.tournament.status));

  return (
    <CustomerShell title="Giải của tôi" subtitle="Giải và buổi giao lưu bạn đã đăng ký: lịch trận, sân, kết quả.">
      {loading && !data && <Spinner label="Đang tải…" />}
      {error && !data && <Notice error={error} onRetry={() => reload()} />}
      {data && items.length === 0 && data.sessions.length === 0 && (
        <EmptyState title="Bạn chưa đăng ký giải nào">
          Xem các giải và buổi giao lưu đang mở rồi đăng ký ngay tại <Link to={hubPaths.home} className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline">trang Giải đấu</Link> — hoặc nhờ nhân viên thêm bạn ở quầy.
        </EmptyState>
      )}
      <div className="space-y-4">
        {current.map((i) => <TournamentCard key={i.tournament.id} item={i} matches={data.upcoming.get(i.tournament.id) || []} done={data.history.get(i.tournament.id) || []} />)}
        {past.length > 0 && <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Đã kết thúc</h2>}
        {past.map((i) => <TournamentCard key={i.tournament.id} item={i} matches={[]} done={data.history.get(i.tournament.id) || []} />)}
        {data && data.sessions.length > 0 && <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Buổi giao lưu đã đăng ký</h2>}
        {data && data.sessions.map((i) => <SessionCard key={i.session.id} item={i} />)}
      </div>
    </CustomerShell>
  );
}
