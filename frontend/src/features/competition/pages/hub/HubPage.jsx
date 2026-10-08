import React, { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import PublicShell from '../../components/PublicShell';
import { EmptyState, Notice, Spinner } from '../../components/ui';
import { SectionTitle } from '../../components/public/atoms';
import { SessionCard, TournamentCard } from '../../components/public/Cards';
import { loadHub } from '../../api/publicApi';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useBranches } from '../../hooks/useBranches';
import { orgName } from '../../lib/format';
import { branchRef, feeText, sortOpenTournaments } from '../../lib/publicHub';
import { inputClass } from '../../components/form';

// Trang chủ khu công khai /thi-dau (plan 27): giải đang mở đăng ký, đang diễn ra, buổi giao lưu sắp tới, kết quả gần đây. Xem không cần đăng nhập.
// Không có luồng SSE ở trang chủ: tải lại mỗi 30 giây khi tab đang mở (và khi đổi chi nhánh).

const REFRESH_MS = 30000;

const Grid = ({ children }) => <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;

function Hero({ openCount, sessionCount }) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-emerald-500/20 bg-gradient-to-br from-emerald-700 via-emerald-600 to-lime-500 p-6 text-white shadow-lg sm:p-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/90">Giải đấu &amp; giao lưu cầu lông</p>
      <h1 className="mt-2 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">Đăng ký thi đấu, theo dõi tỉ số — ngay trên điện thoại.</h1>
      <p className="mt-3 max-w-xl text-sm font-semibold text-white sm:text-base">
        Xem giải đang mở, đăng ký cả cặp trong một lần, báo trước buổi giao lưu và theo dõi bảng, sơ đồ, tỉ số trực tiếp. Lệ phí dự kiến {feeText()}, thanh toán tại quầy.
      </p>
      <div className="mt-5 flex flex-wrap gap-3 text-sm font-black">
        <a href="#giai" className="rounded-xl bg-slate-950 px-5 py-2.5 text-white hover:bg-slate-800">{openCount > 0 ? `${openCount} giải đang mở` : 'Xem các giải'}</a>
        <a href="#giao-luu" className="rounded-xl bg-white/80 px-5 py-2.5 text-slate-950 hover:bg-white">{sessionCount > 0 ? `${sessionCount} buổi giao lưu` : 'Buổi giao lưu'}</a>
        <Link to="/rankings" className="rounded-xl border border-white/70 px-5 py-2.5 text-white hover:bg-white/15">Bảng xếp hạng</Link>
      </div>
    </section>
  );
}

export default function HubPage() {
  const branches = useBranches();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const branchId = params.get('cs') || '';
  const organizerRef = branchRef(branchId);
  const { data, loading, error, reload } = useLiveResource({ load: () => loadHub({ organizerRef }), stream: null });

  // Đổi chi nhánh → tải lại (lần tải đầu do hook lo).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    reload();
  }, [organizerRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // Làm mới định kỳ khi tab đang mở.
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload({ silent: true }); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  // Nhảy tới #giai / #giao-luu sau khi dữ liệu đã dựng (react-router không tự cuộn tới neo).
  useEffect(() => {
    if (!data || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ block: 'start' });
  }, [data, location.hash]);

  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useMemo(() => sortOpenTournaments(data ? data.open : []), [data]);
  const setBranch = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('cs', id); else next.delete('cs');
    setParams(next, { replace: true });
  };

  const none = data && !data.open.length && !data.live.length && !data.done.length && !data.sessionsOpen.length && !data.sessionsDone.length;

  return (
    <PublicShell>
      <Hero openCount={open.length} sessionCount={data ? data.sessionsOpen.length : 0} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
          📍 Chi nhánh
          <select value={branchId} onChange={(e) => setBranch(e.target.value)} className={`${inputClass} !w-auto min-w-[12rem]`} aria-label="Lọc theo chi nhánh">
            <option value="">Tất cả chi nhánh</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        {organizerRef && <span className="text-xs text-slate-500 dark:text-slate-400">Đang xem: {orgName(organizerRef)}</span>}
      </div>

      {loading && !data && <Spinner label="Đang tải giải đấu…" />}
      {error && !data && <div className="mt-4"><Notice error={error} onRetry={() => reload()} /></div>}
      {data && data.partial && <div className="mt-4"><Notice kind="warn" onRetry={() => reload()}>Một phần dữ liệu chưa tải được — danh sách có thể chưa đầy đủ.</Notice></div>}

      {data && (
        <>
          <SectionTitle id="giai" title="Giải đang mở đăng ký" hint="Đăng ký cả cặp trong một lần; hết chỗ thì vào danh sách chờ." />
          {open.length ? <Grid>{open.map((t) => <TournamentCard key={t.id} t={t} now={now} />)}</Grid> : <EmptyState title="Chưa có giải nào đang mở đăng ký">Hãy quay lại sau — hoặc xem các buổi giao lưu bên dưới.</EmptyState>}

          {data.live.length > 0 && (
            <>
              <SectionTitle title="Đang diễn ra / sắp thi đấu" hint="Theo dõi lịch, bảng và tỉ số trực tiếp." />
              <Grid>{data.live.map((t) => <TournamentCard key={t.id} t={t} now={now} />)}</Grid>
            </>
          )}

          <SectionTitle id="giao-luu" title="Buổi giao lưu" hint="Báo trước để sân giữ chỗ — nhân viên điểm danh tại quầy khi bạn tới." />
          {data.sessionsOpen.length ? <Grid>{data.sessionsOpen.map((s) => <SessionCard key={s.id} s={s} now={now} />)}</Grid> : <EmptyState title="Chưa có buổi giao lưu nào đang mở">Các buổi sắp tới sẽ hiện ở đây.</EmptyState>}

          {(data.done.length > 0 || data.sessionsDone.length > 0) && (
            <>
              <SectionTitle title="Kết quả gần đây" />
              <Grid>
                {data.done.map((t) => <TournamentCard key={t.id} t={t} now={now} />)}
                {data.sessionsDone.map((s) => <SessionCard key={s.id} s={s} now={now} />)}
              </Grid>
            </>
          )}
          {none && <div className="mt-8"><EmptyState title="Chưa có giải hay buổi giao lưu nào">Ban tổ chức chưa công bố nội dung nào cho khu vực này.</EmptyState></div>}
        </>
      )}
    </PublicShell>
  );
}
