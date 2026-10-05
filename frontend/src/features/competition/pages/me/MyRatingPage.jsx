import React, { Suspense, lazy, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { meApi, playersApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { selfAssessState } from '../../lib/customer';
import { ratingOf } from '../../lib/rating';
import { Card, Notice, Spinner } from '../../components/ui';
import CustomerShell from '../../components/CustomerShell';
import RatingCards from '../../components/RatingCards';
import RatingHistoryList from '../../components/RatingHistory';

// Trình độ của tôi (07 mục 1.1): hai thẻ điểm Đơn / Đôi (điểm, nhãn, độ tin cậy, đã xác nhận chưa), vị trí xếp hạng, biểu đồ điểm theo thời gian,
// "chi tiết từng trận", nút "Chấm trình ngay" / "Chấm lại" (khoá có lý do khi đã có trận hoặc nhân viên đã xác nhận).

const RatingChart = lazy(() => import('../../components/RatingChart'));

const loadAll = async () => {
  const me = await meApi.get();
  const history = await playersApi.history(me.id, null, { limit: 100 }).catch(() => ({ items: [] }));
  return { me, history: history.items };
};

const linkBtn = 'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition';

export default function MyRatingPage() {
  const load = useCallback(() => loadAll(), []);
  const { data, loading, error, reload } = useLiveResource({ load });

  return (
    <CustomerShell title="Trình độ của tôi" subtitle="Điểm Đơn / Đôi, vì sao điểm đổi, và vị trí của bạn trên bảng xếp hạng.">
      {loading && !data && <Spinner label="Đang tải trình độ…" />}
      {error && !data && <Notice error={error} onRetry={() => reload()} />}
      {data && <Body me={data.me} history={data.history} />}
    </CustomerShell>
  );
}

function Body({ me, history }) {
  const hasRating = ['singles', 'doubles'].some((d) => ratingOf(me, d));
  const assess = selfAssessState(me);
  const waiting = (me.flags || []).includes('needs_verification');
  const rank = me.ranking && me.ranking.rating ? Object.entries(me.ranking.rating) : [];

  if (!hasRating) {
    return (
      <Card>
        <h2 className="text-xl font-black text-white">Bạn chưa có điểm trình</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Trả lời 12 câu về kỹ thuật, thể lực và kinh nghiệm (khoảng 3 phút) để có điểm Đơn và Đôi. Điểm tự chấm là tạm tính — khi bạn tham gia giải hoặc buổi giao lưu có tính điểm, điểm sẽ được hiệu chỉnh theo kết quả thật.</p>
        <Link to="/my-rating/assess" className={`${linkBtn} mt-4 bg-emerald-500 text-slate-950 hover:bg-emerald-400`}>Chấm trình ngay</Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {waiting && <Notice kind="warn">Bài tự chấm của bạn đang chờ nhân viên xác nhận (điểm kỹ năng cao). Điểm hiện tại vẫn dùng được và là tạm tính.</Notice>}
      <RatingCards player={me} />

      {rank.length > 0 && (
        <Card title="Vị trí xếp hạng">
          <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="my-ranking">
            {rank.map(([cat, r]) => (
              <li key={cat}><b>{cat}</b>: {r.eligible ? `hạng ${r.rank}/${r.total}` : `chưa đủ điều kiện lên bảng — vị trí dự kiến ${r.projectedRank || '—'}/${r.total}`}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Lên bảng khi có ≥ 5 trận tính điểm (hoặc được nhân viên xác nhận trình) và có trận trong 12 tháng gần đây.</p>
        </Card>
      )}

      <Card title="Điểm theo thời gian">
        <Suspense fallback={<Spinner label="Đang vẽ biểu đồ…" />}><RatingChart history={history} /></Suspense>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {assess.can
          ? <Link to="/my-rating/assess" className={`${linkBtn} bg-emerald-500 text-slate-950 hover:bg-emerald-400`}>Chấm lại</Link>
          : <span className="max-w-xl text-sm text-slate-400" data-testid="assess-locked">{assess.reason}</span>}
        <Link to="/my-rating/profile" className={`${linkBtn} border border-white/20 text-white hover:bg-white/10`}>Hồ sơ thi đấu của tôi</Link>
        <Link to="/rankings" className={`${linkBtn} border border-white/20 text-white hover:bg-white/10`}>Bảng xếp hạng</Link>
        <Link to="/my-tournaments" className={`${linkBtn} border border-white/20 text-white hover:bg-white/10`}>Giải của tôi</Link>
      </div>

      <Card title="Sổ điểm — vì sao điểm đổi">
        <RatingHistoryList items={history} />
      </Card>
    </div>
  );
}
