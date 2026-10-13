import React, { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { roleOf } from '../../../../utils/roles';
import { Badge } from '../../../../components/UIComponents';
import { meApi, playersApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { headToHeadText } from '../../lib/customer';
import { DISCIPLINE_LABEL } from '../../lib/rating';
import { fmtDate, gamesText, orgName, teamText } from '../../lib/format';
import { Card, EmptyState, Notice, Spinner } from '../../components/ui';
import PublicShell from '../../components/PublicShell';
import RatingCards from '../../components/RatingCards';

// Hồ sơ người khác (07 mục 1.1): rút gọn theo quyền riêng tư của người đó (service quyết định ai thấy gì — người "Ẩn" không mở được); khách đã đăng nhập có
// thêm "Đối đầu với tôi".

const CONTEXT = { tournament: 'Giải đấu', session: 'Giao lưu' };
const HAND = { right: 'tay phải', left: 'tay trái' };
const PLAY = { singles: 'thường đánh đơn', doubles: 'thường đánh đôi', both: 'đánh cả đơn lẫn đôi' };
const POSITION = { front: 'gần lưới', back: 'cuối sân', both: 'linh hoạt' };

export default function PublicProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isCustomer = roleOf(user) === 'customer';
  const load = useCallback(async () => {
    const opt = (p) => p.catch(() => null);
    const [player, stats, matches, me] = await Promise.all([
      playersApi.publicProfile(id),
      opt(playersApi.stats(id)),
      opt(playersApi.matches(id, { limit: 6 })),
      isCustomer ? opt(meApi.get()) : null
    ]);
    const h2h = me && me.id !== id ? await opt(playersApi.headToHead(me.id, id)) : null;
    return { player, stats: stats ? stats.items : [], matches: matches ? matches.items : [], me, h2h };
  }, [id, isCustomer]);
  const { data, loading, error, reload } = useLiveResource({ load });

  return (
    <PublicShell title={data ? (data.player.nickname || data.player.name) : 'Hồ sơ người chơi'} subtitle="Hồ sơ thi đấu công khai.">
      <Link to="/rankings" className="mb-4 inline-block text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline">← Bảng xếp hạng</Link>
      {loading && !data && <Spinner label="Đang tải hồ sơ…" />}
      {error && !data && (error.status === 404
        ? <EmptyState title="Không mở được hồ sơ này">Người chơi này đã ẩn hồ sơ hoặc không tồn tại.</EmptyState>
        : <Notice error={error} onRetry={() => reload()} />)}
      {data && (
        <div className="space-y-5">
          <Card>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {[data.player.gender === 'male' ? 'Nam' : data.player.gender === 'female' ? 'Nữ' : '', data.player.ageGroup ? `nhóm tuổi ${data.player.ageGroup}` : '', HAND[data.player.dominantHand] || '', PLAY[data.player.preferredPlay] || '', data.player.doublesPosition ? `đánh đôi ${POSITION[data.player.doublesPosition]}` : '', data.player.homeOrganizerRef ? orgName(data.player.homeOrganizerRef) : ''].filter(Boolean).join(' · ')}
            </p>
          </Card>
          <RatingCards player={data.player} />
          {data.player.ranking && (
            <Card title="Xếp hạng">
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {Object.entries(data.player.ranking.rating || {}).map(([cat, r]) => <li key={cat}><b>{cat}</b> (trình độ): {r.eligible ? `hạng ${r.rank}/${r.total}` : 'chưa đủ điều kiện'}</li>)}
                {Object.entries(data.player.ranking.points || {}).map(([cat, r]) => <li key={`p${cat}`}><b>{cat}</b> (thành tích): hạng {r.rank}/{r.total} · {r.points} điểm</li>)}
              </ul>
            </Card>
          )}
          {data.h2h && (
            <Card title="Đối đầu với tôi">
              <p className="text-sm font-bold text-slate-900 dark:text-white" data-testid="h2h">{headToHeadText(data.h2h)}</p>
              {(data.h2h.items || []).length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">{data.h2h.items.map((m) => <li key={m.matchId || m.id}>{fmtDate(m.completedAt)} · {m.label || ''} · <b className="tabular-nums">{gamesText(m.games || [])}</b> · {m.won ? 'bạn thắng' : 'bạn thua'}</li>)}</ul>
              )}
            </Card>
          )}
          {data.stats.length > 0 && (
            <Card title="Thống kê">
              <ul className="space-y-1 text-sm">
                {data.stats.map((s) => <li key={`${s.discipline}-${s.context}`}><b>{DISCIPLINE_LABEL[s.discipline]} · {CONTEXT[s.context] || s.context}</b>: {s.matches} trận, thắng {Math.round(s.winRate * 100)}%{s.titles ? ` · ${s.titles} lần vô địch` : ''}</li>)}
              </ul>
            </Card>
          )}
          {data.matches.length > 0 && (
            <Card title="Trận gần đây">
              <ul className="space-y-1 text-sm">
                {data.matches.map((m) => {
                  const side = (m.teamA.players || []).some((p) => p.id === id) ? 'A' : 'B';
                  const won = m.winnerSide === side;
                  return <li key={m.id}><Badge variant={won ? 'emerald' : 'rose'}>{won ? 'Thắng' : 'Thua'}</Badge> {teamText(side === 'A' ? m.teamA : m.teamB)} <span className="text-slate-600 dark:text-slate-500">vs</span> {teamText(side === 'A' ? m.teamB : m.teamA)} · <b className="tabular-nums">{gamesText(m.games.map((g) => (side === 'A' ? g : [g[1], g[0]])))}</b></li>;
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
    </PublicShell>
  );
}
