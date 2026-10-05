import React, { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { matchesApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useAction } from '../../hooks/useAction';
import { useCourts } from '../../hooks/useCourts';
import { useCompetition } from '../../context/CompetitionContext';
import { RESULT_TOAST } from '../../lib/score';
import { backTarget } from '../../lib/liveScoring';
import { courtName } from '../../lib/format';
import { matchTitle } from '../../lib/tournamentModel';
import { Card, Notice, PageHeader, Spinner } from '../../components/ui';
import ScoreForm from '../../components/ScoreForm';

// Nhập tỉ số nhanh (07 mục 1.2) — tối ưu điện thoại: hai cột A / B, ô số lớn; trận giải có thêm "Bỏ cuộc giữa trận" / "W.O.".
// Mở từ nút "Nhập tỉ số tay" của màn hình bấm điểm hoặc đường dẫn trực tiếp. Ghi bằng If-Match (hai máy không đè nhau).

export default function QuickScorePage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useCompetition();
  useCourts();
  const load = useCallback(() => matchesApi.get(matchId), [matchId]);
  const { data: match, loading, error, reload } = useLiveResource({ load });
  const [run, { busy, error: actionError, clearError }] = useAction({ onReload: () => reload({ silent: true }) });
  const [done, setDone] = useState(false);

  if (!match && loading) return <div className="mx-auto max-w-xl p-4"><Spinner label="Đang tải trận…" /></div>;
  if (!match) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <Notice error={error} onRetry={() => reload()} />
        <Link to="/competition" className="text-sm font-bold text-emerald-600 hover:underline">← Về trang Thi đấu</Link>
      </div>
    );
  }

  const back = backTarget(match);
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(back.to));
  const editable = match.status === 'in_play' || match.status === 'completed';
  const tournament = match.contextType === 'tournament';

  const submit = async (body, outcome) => {
    const res = await run(() => matchesApi.result(match.id, body, match.version));
    if (res === undefined) return;
    toast(RESULT_TOAST[outcome] || 'Đã ghi tỉ số');
    setDone(true);
    await reload({ silent: true });
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-8">
      <Link to={back.to} className="text-sm font-bold text-emerald-600 hover:underline dark:text-emerald-400">{back.label}</Link>
      <PageHeader title="Nhập tỉ số" subtitle={`${match.courtRef ? `${courtName(match.courtRef)} · ` : ''}${matchTitle(match)}`} />
      {!editable && <Notice kind="warn">{match.status === 'cancelled' ? 'Trận đã huỷ.' : 'Trận chưa được gọi ra sân — gọi ra sân rồi mới nhập tỉ số.'}</Notice>}
      {match.status === 'completed' && !done && (
        <Notice kind="info">Trận đã có kết quả ({match.games.map((g) => g.join('–')).join(', ')}). Lưu lại sẽ sửa kết quả — chỉ làm được khi chưa có trận sau bắt đầu.</Notice>
      )}
      {done ? (
        <Card>
          <p className="font-bold text-slate-900 dark:text-white">Đã ghi tỉ số: {match.games.map((g) => g.join('–')).join(', ') || 'W.O.'}.</p>
          <button type="button" onClick={goBack} className="mt-3 w-full rounded-2xl bg-emerald-500 px-5 py-3 text-base font-black text-slate-950">{back.label}</button>
        </Card>
      ) : (
        editable && (
          <ScoreForm
            key={`${match.id}:${match.version}`}
            match={match}
            outcomes={tournament}
            busy={busy}
            error={actionError}
            onSubmit={(body, outcome) => { clearError(); return submit(body, outcome); }}
            onCancel={goBack}
          />
        )
      )}
    </div>
  );
}
