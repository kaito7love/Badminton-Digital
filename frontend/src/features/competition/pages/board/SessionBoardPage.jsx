import React, { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sessionsApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useCourts } from '../../hooks/useCourts';
import { mergeLive, pickNewest } from '../../lib/live';
import { resultLine } from '../../lib/board';
import { courtName } from '../../lib/format';
import { Notice, Spinner } from '../../components/ui';
import { TvCourt, TvSection, TvShell } from '../../components/TvShell';

// Màn hình lớn của buổi giao lưu (07 mục 1.2): sân – ai với ai – đã đánh bao lâu, bảng điểm trực tiếp, hàng chờ (tô sáng người vào sân lượt tới),
// "sắp vào sân" (đúng kết quả nếu bấm "Xếp sân trống" ngay), kết quả gần nhất. Chỉ đọc, tự cập nhật qua SSE.

const names = (side) => side.map((p) => p.name || '—').join(' + ');

export default function SessionBoardPage() {
  const { id } = useParams();
  useCourts();
  const [liveScores, setLiveScores] = useState(new Map());
  const [skew, setSkew] = useState(0);

  const load = useCallback(() => sessionsApi.board(id), [id]);
  const onEvent = useCallback((name, payload) => {
    if (name === 'snapshot') {
      if (payload.serverTime) setSkew(Date.parse(payload.serverTime) - Date.now());
      setLiveScores((map) => (payload.matches || []).reduce((acc, x) => (x.live ? mergeLive(acc, x.matchId, x.live) : acc), map));
    } else if (name === 'score' && payload.live) {
      setLiveScores((map) => mergeLive(map, payload.matchId, payload.live));
    }
  }, []);
  const { data: board, loading, error, reload, status } = useLiveResource({ load, stream: { kind: 'sessions', id }, onEvent });

  if (!board && loading) return <TvShell title="Đang tải…" status="idle"><Spinner label="Đang tải buổi giao lưu…" /></TvShell>;
  if (!board) {
    return (
      <TvShell title="Màn hình lớn" status="idle">
        <div className="max-w-xl space-y-3"><Notice error={error} onRetry={() => reload()} /><Link to="/competition/sessions" className="text-lg font-bold text-emerald-400">← Danh sách buổi</Link></div>
      </TvShell>
    );
  }

  const { session, courts, upcoming, queue, recent, counts } = board;
  const open = session.status === 'open';

  return (
    <TvShell
      title={session.name}
      subtitle={open ? `${counts.present} người có mặt · ${counts.onCourt} đang trên sân · ${counts.waiting} đang chờ` : session.status === 'closed' ? 'Buổi đã đóng' : 'Buổi đã huỷ'}
      status={status}
    >
      <div className="grid gap-5 xl:grid-cols-2">
        {courts.map((c) => (
          <TvCourt
            key={c.courtRef}
            courtRef={c.courtRef}
            match={c.match}
            live={c.match ? pickNewest(c.match.live, liveScores.get(c.match.id)) : null}
            skew={skew}
            emptyText="Sân trống"
          />
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {open && (
          <TvSection title="Hàng chờ">
            {queue.length === 0 ? <p className="text-xl text-slate-400">Không có ai đang chờ.</p> : (
              <ol className="space-y-1.5 text-2xl">
                {queue.map((q) => (
                  <li key={q.playerId} className={`flex items-baseline gap-3 rounded-xl px-3 py-1 ${q.next ? 'bg-emerald-400/20 font-black text-emerald-200' : ''}`} data-next={q.next ? 'true' : undefined}>
                    <span className="w-8 tabular-nums text-slate-400">{q.position}</span>
                    <span className="flex-1">{q.name}</span>
                    <span className="text-lg font-normal text-slate-400">{q.gamesPlayed} trận</span>
                    {q.next && <span className="text-lg">vào sân tới</span>}
                  </li>
                ))}
              </ol>
            )}
          </TvSection>
        )}
        {open && upcoming.length > 0 && (
          <TvSection title="Sắp vào sân">
            <ul className="space-y-2 text-2xl">
              {upcoming.map((u) => (
                <li key={u.courtRef}><b className="mr-3 text-amber-300">{courtName(u.courtRef)}</b>{names(u.sideA)} <span className="text-slate-500">vs</span> {names(u.sideB)}</li>
              ))}
            </ul>
          </TvSection>
        )}
        {recent.length > 0 && (
          <TvSection title="Kết quả gần nhất">
            <ul className="space-y-2 text-xl">{recent.map((m) => <li key={m.id}>{resultLine(m)}</li>)}</ul>
          </TvSection>
        )}
      </div>
    </TvShell>
  );
}
