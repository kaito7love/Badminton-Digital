import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { reportService, courtService, inventoryService } from '../../services/apiServices';
import { useTheme } from '../../contexts/ThemeContext';
import { getChartColors } from '../../utils/chartColors';

const formatMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

// Backend trả về [{ date, totalRevenue, totalTransactions }] theo thứ tự mới nhất trước
const toChartData = (rows) =>
  [...rows]
    .slice(0, 7)
    .reverse()
    .map((row) => ({ date: row.date, revenue: Number(row.totalRevenue || 0) }));

const COURT_STATE_META = {
  PLAYING: { label: 'Đang chơi', badge: 'Đang chơi', cls: 'text-sky-600 dark:text-sky-400', badgeCls: 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400' },
  AVAILABLE: { label: 'Sẵn sàng', badge: 'Trống', cls: 'text-emerald-600 dark:text-emerald-400', badgeCls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' },
  MAINTENANCE: { label: 'Bảo trì', badge: 'Bảo trì', cls: 'text-amber-600 dark:text-amber-400', badgeCls: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400' },
  INACTIVE: { label: 'Ngưng khai thác', badge: 'Ngưng', cls: 'text-slate-500 dark:text-slate-400', badgeCls: 'bg-slate-500/10 border-slate-500/30 text-slate-500 dark:text-slate-400' }
};

export default function DashboardPage() {
  const { theme } = useTheme();
  const chartColors = getChartColors(theme);
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [courts, setCourts] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [dashboardRes, revenueRes, courtsRes, extraStockRes, productStockRes] = await Promise.all([
          reportService.getDashboard(),
          reportService.getRevenueReport({ period: 'daily' }),
          courtService.getAllCourts(),
          inventoryService.getStockLevels({ limit: 100 }),
          inventoryService.getProductStockLevels({ limit: 100 })
        ]);

        setSummary(dashboardRes.data?.data || null);
        setChartData(toChartData(revenueRes.data?.data || []));
        setCourts(courtsRes.data?.data || []);

        // Bỏ qua dòng tồn kho của sản phẩm/phụ kiện đã bị xoá (extra/variant
        // null do soft-delete) — không phải cảnh báo thật, chỉ là rác còn
        // sót lại từ sản phẩm không còn bán nữa.
        const lowExtras = (extraStockRes.data?.data || [])
          .filter((s) => s.extra && s.quantity <= (s.extra.lowStockThreshold ?? 5))
          .map((s) => ({ name: s.extra.name, quantity: s.quantity }));
        const lowProducts = (productStockRes.data?.data || [])
          .filter((s) => s.variant && s.quantity <= (s.variant.lowStockThreshold ?? 5))
          .map((s) => ({ name: `${s.variant.product?.name || ''} (${s.variant.sku || ''})`, quantity: s.quantity }));
        setLowStockItems([...lowExtras, ...lowProducts].sort((a, b) => a.quantity - b.quantity));
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Lỗi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-8 text-slate-500 dark:text-slate-400 font-semibold animate-pulse">⚡ Đang kết nối dữ liệu vận hành...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400 font-semibold">❌ Lỗi: {error}</div>;

  const stats = summary
    ? [
        { label: 'Doanh thu hôm nay', value: formatMoney(summary.todayRevenue) },
        { label: 'Tỷ lệ lấp đầy sân', value: `${Number(summary.occupancyRate || 0)}%`, sub: `${summary.activeCourts}/${summary.operatingCourts} sân đang khai thác` },
        { label: 'Tổng số sân', value: summary.totalCourts },
        { label: 'Cảnh báo tồn kho thấp', value: summary.lowStockCount }
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Top Welcome Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">Live System Dashboard</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">Tổng Quan Vận Hành</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Theo dõi tình trạng sân cầu lông, doanh thu thực tế, lịch đặt sân & cảnh báo kho vật tư.</p>
        </div>
        <div className="shrink-0 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl backdrop-blur-xl text-sm text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white mb-1">
            <span className="text-emerald-600 dark:text-emerald-400">⚡</span> Badminton Digital Core
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tối ưu hóa đặt sân & quản lý thiết bị thời gian thực.</p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl hover:border-emerald-500/40 transition">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 font-medium">{item.label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-slate-100">{item.value}</p>
            {item.sub && <p className="mt-3 text-xs font-semibold text-slate-400 dark:text-slate-500">{item.sub}</p>}
          </div>
        ))}
      </div>

      {/* Main Charts & Side Cards */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.8fr_1fr]">

        {/* Revenue Line Chart */}
        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/80 p-6 md:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 font-medium">Biểu Đồ Doanh Thu</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">Doanh Thu Theo Ngày</h2>
            </div>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">7 Kỳ Gần Nhất</span>
          </div>

          <div className="h-[320px] w-full">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Chưa có dữ liệu doanh thu để hiển thị.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 4" />
                  <XAxis dataKey="date" tick={{ fill: chartColors.axisTick, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: chartColors.axisTick, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}K`)} />
                  <Tooltip formatter={(v) => [formatMoney(v), 'Doanh thu']} contentStyle={{ backgroundColor: chartColors.tooltipBg, borderRadius: 16, border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.tooltipText }} />
                  <Line type="monotone" dataKey="revenue" stroke={chartColors.line} strokeWidth={4} dot={{ r: 5, fill: chartColors.line }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right Status Cards */}
        <div className="space-y-6">

          {/* Live Court Status */}
          <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase font-extrabold tracking-widest text-slate-500 dark:text-slate-400 mb-4">Trạng Thái Sân Hôm Nay</p>
            {courts.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có sân nào.</p>
            ) : (
              <div className="space-y-3">
                {courts.map((court) => {
                  const meta = COURT_STATE_META[court.state] || COURT_STATE_META.AVAILABLE;
                  return (
                    <div key={court.id} className="flex items-center justify-between rounded-2xl bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/60 p-3.5">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{court.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Trạng thái: <span className={`font-semibold ${meta.cls}`}>{meta.label}</span></p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${meta.badgeCls}`}>{meta.badge}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inventory Alerts */}
          <div className="rounded-3xl border border-amber-500/30 bg-white dark:bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase font-extrabold tracking-widest text-amber-600 dark:text-amber-400 mb-3">⚠️ Cảnh Báo Kho Thiết Bị</p>
            {lowStockItems.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Không có sản phẩm nào sắp hết hàng.</p>
            ) : (
              <div className="space-y-2.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                {lowStockItems.slice(0, 5).map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span>{item.name}:</span>
                    <span className={`font-bold ${item.quantity <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {item.quantity <= 0 ? 'Hết hàng' : `Còn ${item.quantity}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
