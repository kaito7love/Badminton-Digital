import React, { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { Badge } from '../../../../components/UIComponents';
import { playersApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useAction } from '../../hooks/useAction';
import { useCompetition } from '../../context/CompetitionContext';
import { permissionsFor } from '../../lib/permissions';
import { changeText, calcRows, DISCIPLINE_LABEL, FLAG_LABELS, ratingOf, SOURCE_LABEL, ASSESSMENT_STATUS } from '../../lib/rating';
import { fmtDate, fmtDateTime, fmtNumber, gamesText, teamText } from '../../lib/format';
import { Button, Card, EmptyState, Notice, Spinner } from '../../components/ui';
import { ConfirmDialog } from '../../components/Dialog';
import RatingCards from '../../components/RatingCards';
import { AdjustDialog, QuickAssessDialog } from './PlayerDialogs';

// Hồ sơ người chơi (nhân viên) — 07 mục 1.2: điểm Đơn / Đôi, chấm trình (đầy đủ / nhanh), xác nhận trình, chỉnh điểm (quản lý), sổ điểm kèm
// "chi tiết từng trận", thống kê, trận gần đây, đồng đội hay đánh. Mọi con số điểm đều giải thích được (sổ điểm → E, K, kết quả).

const loadAll = async (id) => {
  const optional = (p) => p.catch(() => null);
  const [player, history, matches, partners, stats] = await Promise.all([
    playersApi.get(id),
    optional(playersApi.history(id, null, { limit: 100 })),
    optional(playersApi.matches(id, { limit: 8 })),
    optional(playersApi.partners(id)),
    optional(playersApi.stats(id))
  ]);
  return { player, history: history ? history.items : [], matches: matches ? matches.items : [], partners: partners ? partners.items : [], stats: stats ? stats.items : [] };
};

const CONTEXT = { tournament: 'Giải đấu', session: 'Giao lưu' };

function HistoryRow({ c }) {
  const [open, setOpen] = useState(false);
  const rows = calcRows(c);
  return (
    <li className="border-t border-slate-100 py-2 text-sm dark:border-slate-800" data-change={c.id}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <small className="w-24 text-slate-500">{fmtDate(c.createdAt)}</small>
        <Badge>{DISCIPLINE_LABEL[c.discipline]}</Badge>
        <span className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-white">{changeText(c)}</span>
        {rows.length > 0 && <button type="button" className="text-xs font-bold text-emerald-600 hover:underline" onClick={() => setOpen(!open)}>{open ? 'Ẩn chi tiết' : 'Chi tiết từng trận'}</button>}
      </div>
      {c.note && <p className="mt-0.5 text-xs text-slate-500">Lý do: {c.note}</p>}
      {open && (
        <table className="mt-2 w-full text-left text-xs">
          <thead><tr className="text-slate-500"><th className="pr-3">Kết quả</th><th className="pr-3">Kỳ vọng (E)</th><th className="pr-3">Hệ số K</th><th className="pr-3">Hệ số trận</th><th>Điểm</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.matchId} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-3">{m.S >= 1 ? 'Thắng' : m.S <= 0 ? 'Thua' : fmtNumber(m.S)}</td>
                <td className="pr-3 tabular-nums">{fmtNumber(m.E)}</td>
                <td className="pr-3 tabular-nums">{fmtNumber(m.K)}</td>
                <td className="pr-3 tabular-nums">{fmtNumber(m.m)} × {fmtNumber(m.w)}</td>
                <td className="tabular-nums font-bold">{m.delta > 0 ? '+' : ''}{fmtNumber(m.delta, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}

export default function PlayerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useCompetition();
  const perms = permissionsFor(user);
  const load = useCallback(() => loadAll(id), [id]);
  const { data, loading, error, reload } = useLiveResource({ load });
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [run, { busy }] = useAction({ onReload: () => reload({ silent: true }) });

  if (loading && !data) return <div className="mx-auto max-w-5xl p-4 sm:p-8"><Spinner label="Đang tải hồ sơ…" /></div>;
  if (error && !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-3 p-4 sm:p-8">
        <Notice error={error} onRetry={() => reload()} />
        <Link to="/competition/players" className="text-sm font-bold text-emerald-600 hover:underline">← Danh sách người chơi</Link>
      </div>
    );
  }
  if (!data) return null;

  const { player, history, matches, partners, stats } = data;
  const hasRating = ['singles', 'doubles'].some((d) => ratingOf(player, d));
  const closeAnd = (message) => { setDialog(null); toast(message); reload({ silent: true }); };
  const verify = (d) => setConfirm({
    title: `Xác nhận trình ${DISCIPLINE_LABEL[d]}`,
    text: `Xác nhận điểm ${DISCIPLINE_LABEL[d]} ${fmtNumber(ratingOf(player, d).rating)} của ${player.displayName} là đúng trình thực tế (bỏ cờ "chưa xác thực").`,
    confirmLabel: 'Xác nhận',
    action: async () => { await playersApi.verify(player.id, d); return `Đã xác nhận trình ${DISCIPLINE_LABEL[d]}`; }
  });
  const runConfirm = async () => {
    const c = confirm;
    const res = await run(c.action, { onError: (e) => toast(e.message, 'error') });
    setConfirm(null);
    if (res !== undefined) { toast(res); reload({ silent: true }); }
  };

  const footers = Object.fromEntries(['singles', 'doubles'].map((d) => {
    const r = ratingOf(player, d);
    return [d, r && !r.verified && perms.canAssessAny ? <div className="mt-3"><Button variant="secondary" onClick={() => verify(d)} data-verify={d}>Xác nhận trình {DISCIPLINE_LABEL[d]}</Button></div> : null];
  }));

  const outcomeFor = (m) => {
    const side = (m.teamA.players || []).some((p) => p.id === player.id) ? 'A' : 'B';
    const own = side === 'A' ? m.teamA : m.teamB;
    const other = side === 'A' ? m.teamB : m.teamA;
    const won = m.winnerSide === side;
    return { own, other, won, text: m.outcome === 'walkover' ? 'W.O.' : gamesText(m.games.map((g) => (side === 'A' ? g : [g[1], g[0]]))) };
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-8">
      <Link to="/competition/players" className="inline-block text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Danh sách người chơi</Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black text-slate-900 dark:text-white">
              {player.displayName}
              {(player.flags || []).map((f) => <Badge key={f} variant={f === 'needs_verification' ? 'rose' : f === 'quick' ? 'violet' : 'amber'}>{FLAG_LABELS[f] || f}</Badge>)}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {[player.nickname ? `“${player.nickname}”` : '', player.gender === 'male' ? 'Nam' : player.gender === 'female' ? 'Nữ' : '', player.ageGroup ? `nhóm tuổi ${player.ageGroup}` : '', player.dominantHand === 'left' ? 'tay trái' : player.dominantHand === 'right' ? 'tay phải' : '', player.homeOrganizerRef ? player.homeOrganizerRef.replace('bd:branch:', 'chi nhánh ') : ''].filter(Boolean).join(' · ')}
            </p>
            {player.latestAssessment && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="latest-assessment">
                Bài chấm gần nhất: {SOURCE_LABEL[player.latestAssessment.source] || player.latestAssessment.source} · {ASSESSMENT_STATUS[player.latestAssessment.status] || player.latestAssessment.status} · {fmtDateTime(player.latestAssessment.createdAt)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/competition/players/${player.id}/assess`)}>Chấm trình…</Button>
            {!hasRating && <Button variant="secondary" onClick={() => setDialog('quick')}>Chấm nhanh…</Button>}
            {perms.canAdjustRating && <Button variant="secondary" onClick={() => setDialog('adjust')}>Chỉnh điểm…</Button>}
          </div>
        </div>
      </Card>

      <RatingCards player={player} footers={footers} />

      {player.ranking && (player.ranking.rating.MS || player.ranking.rating.MD || player.ranking.rating.WS || player.ranking.rating.WD) && (
        <Card title="Xếp hạng">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(player.ranking.rating).map(([cat, r]) => (
              <li key={cat}><b>{cat}</b> (trình độ): {r.eligible ? `hạng ${r.rank}/${r.total}` : r.projectedRank ? `chưa đủ điều kiện · vị trí dự kiến ${r.projectedRank}` : 'chưa đủ điều kiện'}</li>
            ))}
            {Object.entries(player.ranking.points || {}).map(([cat, r]) => (
              <li key={`p${cat}`}><b>{cat}</b> (thành tích): hạng {r.rank}/{r.total} · {r.points} điểm</li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Sổ điểm">
        {history.length === 0 ? <EmptyState>Chưa có thay đổi điểm nào.</EmptyState> : <ul data-testid="history">{[...history].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((c) => <HistoryRow key={c.id} c={c} />)}</ul>}
      </Card>

      {stats.length > 0 && (
        <Card title="Thống kê">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead><tr className="text-xs text-slate-500"><th className="py-1 pr-3">Nội dung</th><th className="py-1 pr-3">Trận</th><th className="py-1 pr-3">T–B</th><th className="py-1 pr-3">Tỉ lệ thắng</th><th className="py-1">5 trận gần nhất</th></tr></thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={`${s.discipline}-${s.context}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-3 font-semibold">{DISCIPLINE_LABEL[s.discipline]} · {CONTEXT[s.context] || s.context}</td>
                    <td className="pr-3 tabular-nums">{s.matches}</td>
                    <td className="pr-3 tabular-nums">{s.wins}–{s.losses}</td>
                    <td className="pr-3 tabular-nums">{Math.round(s.winRate * 100)}%</td>
                    <td className="tracking-widest">{s.last5.map((x, i) => <span key={i} className={x === 'W' ? 'text-emerald-600' : 'text-rose-600'}>{x === 'W' ? 'T' : 'B'}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {matches.length > 0 && (
        <Card title="Trận gần đây">
          <ul className="space-y-1 text-sm">
            {matches.map((m) => {
              const o = outcomeFor(m);
              return (
                <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                  <Badge variant={o.won ? 'emerald' : 'rose'}>{o.won ? 'Thắng' : 'Thua'}</Badge>
                  <span>{teamText(o.own)} <span className="text-slate-400">vs</span> {teamText(o.other)}</span>
                  <b className="tabular-nums">{o.text}</b>
                  <small className="text-slate-500">{CONTEXT[m.contextType] || ''}{m.label ? ` · ${m.label}` : ''} · {fmtDate(m.completedAt)}</small>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {partners.length > 0 && (
        <Card title="Đồng đội hay đánh">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {partners.map((p) => <li key={p.playerId}><b>{p.name}</b> · {p.matches} trận · thắng {Math.round(p.winRate * 100)}%</li>)}
          </ul>
        </Card>
      )}

      {dialog === 'quick' && <QuickAssessDialog player={player} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog === 'adjust' && <AdjustDialog player={player} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {confirm && <ConfirmDialog title={confirm.title} text={confirm.text} confirmLabel={confirm.confirmLabel} busy={busy} onConfirm={runConfirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
