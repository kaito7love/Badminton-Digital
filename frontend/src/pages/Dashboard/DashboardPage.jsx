import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { reportService, courtService, accessoryService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + 'đ';

const courtStateLabel = (state) => {
  if (state === 'PLAYING') return { text: 'Đang chơi', tone: 'busy' };
  if (state === 'MAINTENANCE') return { text: 'Bảo trì', tone: 'maintenance' };
  if (state === 'INACTIVE') return { text: 'Ngừng hoạt động', tone: 'maintenance' };
  return { text: 'Sẵn sàng', tone: 'open' };
};

export default function DashboardPage() {
  const [stats, setStats] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [courts, setCourts] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [dashboardRes, revenueRes, courtsRes, accessoriesRes] = await Promise.all([
          reportService.getDashboard(),
          reportService.getRevenueReport({ period: 'week' }),
          courtService.getAllCourts(),
          accessoryService.getAllAccessories(),
        ]);

        const summary = dashboardRes.data?.data || {};
        setStats([
          { label: 'Doanh thu hôm nay', value: formatMoney(summary.todayRevenue) },
          { label: 'Sân đang hoạt động', value: `${summary.activeCourts ?? 0}/${summary.totalCourts ?? 0}` },
          { label: 'Tỷ lệ lấp đầy sân', value: `${summary.occupancyRate ?? 0}%` },
          { label: 'Vật tư sắp hết hàng', value: summary.lowStockCount ?? 0 },
        ]);

        const revenue = (revenueRes.data?.data || [])
          .map((row) => ({ name: row.date, revenue: Number(row.totalRevenue) || 0 }))
          .reverse();
        setChartData(revenue);

        const courtList = courtsRes.data?.data || [];
        setCourts(Array.isArray(courtList) ? courtList : []);

        const accessories = accessoriesRes.data?.data || [];
        const lowStock = (Array.isArray(accessories) ? accessories : [])
          .filter((a) => Number(a.stockQuantity) <= Number(a.lowStockThreshold));
        setLowStockItems(lowStock);
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Lỗi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-8 text-slate-400 font-semibold animate-pulse">⚡ Đang kết nối dữ liệu vận hành...</div>;
  if (error) return <div className="p-8 text-rose-400 font-semibold">❌ Lỗi: {error}</div>;

  return (
    <div className="space-y-8">
      {/* Top Welcome Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-400 font-medium">Live System Dashboard</p>
          <h1 className="text-3xl font-bold text-slate-100 mt-1">Tổng Quan Vận Hành</h1>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">Theo dõi tình trạng sân cầu lông, doanh thu thực tế & cảnh báo kho vật tư.</p>
        </div>
        <div className="rounded-3xl bg-slate-900/80 border border-slate-800 p-5 shadow-2xl backdrop-blur-xl text-sm text-slate-300">
          <div className="flex items-center gap-2 font-bold text-white mb-1">
            <span className="text-emerald-400">⚡</span> Badminton Digital Core
          </div>
          <p className="text-xs text-slate-400">Tối ưu hóa đặt sân & quản lý thiết bị thời gian thực.</p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid gap-5 xl:grid-cols-4 lg:grid-cols-2">
        {stats.map((item, idx) => (
          <div key={item.label || idx} className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl hover:border-emerald-500/40 transition">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-medium">{item.label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Main Charts & Side Cards */}
      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">

        {/* Revenue Line Chart */}
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 md:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-medium">Biểu Đồ Doanh Thu</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-100">Doanh Thu Theo Ngày</h2>
            </div>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-bold text-emerald-400">7 Ngày Qua</span>
          </div>

          <div className="h-[320px] w-full">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Chưa có dữ liệu doanh thu</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [formatMoney(v), 'Doanh thu']} contentStyle={{ backgroundColor: '#070a11', borderRadius: 16, border: '1px solid #334155', color: '#fff' }} />
                  <Line type="monotone" dataKey="revenue" stroke="#00FF66" strokeWidth={4} dot={{ r: 5, fill: '#00FF66' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right Status Cards */}
        <div className="space-y-6">

          {/* Live Court Quick Status */}
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mb-4">Trạng Thái Sân Hôm Nay</p>
            <div className="space-y-3">
              {courts.length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có sân nào</p>
              ) : courts.map((court) => {
                const { text, tone } = courtStateLabel(court.state);
                const toneClass = tone === 'busy'
                  ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                  : tone === 'maintenance'
                    ? 'text-slate-400 border-slate-600/30 bg-slate-600/10'
                    : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
                return (
                  <div key={court.id} className="flex items-center justify-between rounded-2xl bg-slate-950/80 border border-slate-800/60 p-3.5">
                    <div>
                      <p className="text-sm font-bold text-white">{court.name}</p>
                      <p className="text-xs text-slate-400">Trạng thái: <span className={toneClass.split(' ')[0] + ' font-semibold'}>{text}</span></p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${toneClass}`}>{text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inventory Alerts */}
          <div className="rounded-3xl border border-amber-500/30 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase font-extrabold tracking-widest text-amber-400 mb-3">⚠️ Cảnh Báo Kho Thiết Bị</p>
            <div className="space-y-2.5 text-xs font-medium text-slate-300">
              {lowStockItems.length === 0 ? (
                <p className="text-slate-500">Không có vật tư nào sắp hết hàng</p>
              ) : lowStockItems.map((item) => (
                <div key={item.id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <span>{item.name}:</span>
                  <span className="font-bold text-amber-400">Còn {item.stockQuantity}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
