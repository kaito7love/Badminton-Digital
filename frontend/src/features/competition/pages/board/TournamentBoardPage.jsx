import React, { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadTournamentBundle } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useCourts } from '../../hooks/useCourts';
import { buildModel, matchTitle } from '../../lib/tournamentModel';
import { mergeLive, pickNewest } from '../../lib/live';
import { recentResults, resultLine } from '../../lib/board';
import { teamText } from '../../lib/format';
import { Notice, Spinner } from '../../components/ui';
import BracketView from '../../components/BracketView';
import { TvCourt, TvSection, TvShell } from '../../components/TvShell';

// Màn hình lớn của giải (07 mục 1.2, plan 20): mọi sân (đang đánh: trận + bảng điểm trực tiếp; trống: "chờ gọi trận kế tiếp"), Sắp tới kèm giờ dự kiến,
// bảng xếp hạng từng bảng, sơ đồ loại trực tiếp dạng hình, kết quả gần đây. Chỉ đọc, tự cập nhật qua SSE (score → đổi số ngay, board → tải lại).

function Standings({ standings }) {
  if (!standings || !standings.groups.length) return null;
  return (
    <TvSection title="Bảng xếp hạng">
      <div className="grid gap-5 lg:grid-cols-2">
        {standings.groups.map((g) => (
          <div key={g.groupNo}>
            {standings.groups.length > 1 && <b className="mb-1 block text-xl text-slate-300">Bảng {g.groupNo}</b>}
            <table className="w-full text-left text-xl">
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.team.id || r.rank} className="border-t border-white/10">
                    <td className="w-10 py-1.5 font-black text-emerald-300">{r.rank}</td>
                    <td className="py-1.5 pr-3 font-bold">{teamText(r.team)}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{r.played} trận</td>
                    <td className="py-1.5 tabular-nums">{r.wins}–{r.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </TvSection>
  );
}

export default function TournamentBoardPage() {
  const { id } = useParams();
  useCourts();
  const [live, setLive] = useState(false);
  const [liveScores, setLiveScores] = useState(new Map());
  const [skew, setSkew] = useState(0);

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

  const { data: bundle, loading, error, reload, status } = useLiveResource({ load, stream: live ? { kind: 'tournaments', id } : null, onEvent });
  const model = useMemo(() => (bundle ? buildModel(bundle) : null), [bundle]);

  if (!model && loading) return <TvShell title="Đang tải…" status="idle"><Spinner label="Đang tải giải…" /></TvShell>;
  if (!model) {
    return (
      <TvShell title="Màn hình lớn" status="idle">
        <div className="max-w-xl space-y-3"><Notice error={error} onRetry={() => reload()} /><Link to="/competition/tournaments" className="text-lg font-bold text-emerald-400">← Danh sách giải</Link></div>
      </TvShell>
    );
  }

  const { t, courts, onCourt, candidates, bracket, standings, placements } = model;
  const rounds = bracket && bracket.rounds ? bracket.rounds : [];
  const recent = recentResults(model.ms, 6);
  const upcoming = candidates.slice(0, 5);

  return (
    <TvShell title={t.name} subtitle={model.info} status={status}>
      {model.live ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {courts.map((c) => {
            const m = onCourt.get(c);
            return <TvCourt key={c} courtRef={c} match={m} live={m ? pickNewest(m.live, liveScores.get(m.id)) : null} skew={skew} />;
          })}
        </div>
      ) : (
        <p className="mb-5 rounded-3xl border border-white/10 bg-slate-900/60 p-6 text-2xl text-slate-300">
          {t.status === 'finalized' ? 'Giải đã kết thúc.' : t.status === 'cancelled' ? 'Giải đã huỷ.' : 'Giải chưa bắt đầu thi đấu.'}
        </p>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {model.live && upcoming.length > 0 && (
          <TvSection title="Sắp tới">
            <ul className="space-y-2 text-2xl">
              {upcoming.map((it) => (
                <li key={it.match.id} className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-black tabular-nums text-amber-300">{it.match.expectedTime || '—'}</span>
                  <span className="font-bold">{teamText(it.match.teamA) || '—'} <span className="font-normal text-slate-500">vs</span> {teamText(it.match.teamB) || '—'}</span>
                  <span className="text-lg text-slate-400">{matchTitle(it.match)}</span>
                </li>
              ))}
            </ul>
          </TvSection>
        )}
        {recent.length > 0 && (
          <TvSection title="Kết quả gần đây">
            <ul className="space-y-2 text-xl">{recent.map((m) => <li key={m.id}>{resultLine(m)} <span className="text-slate-500">· {matchTitle(m)}</span></li>)}</ul>
          </TvSection>
        )}
        {t.status === 'finalized' && placements && placements.items.length > 0 && (
          <TvSection title="Kết quả chung cuộc">
            <ul className="space-y-1 text-2xl">{placements.items.slice(0, 8).map((p) => <li key={`${p.from}-${p.teamId}`}><b className="mr-3 text-emerald-300">{p.label}</b>{p.players.map((x) => x.name).join(' + ')}</li>)}</ul>
          </TvSection>
        )}
      </div>

      {t.format !== 'knockout' && <div className="mt-5"><Standings standings={standings} /></div>}
      {rounds.length > 0 && (
        <TvSection title="Sơ đồ loại trực tiếp" className="mt-5">
          <BracketView rounds={rounds} title={t.name} tools={false} />
        </TvSection>
      )}
    </TvShell>
  );
}
