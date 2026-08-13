import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { reportService } from '../../services/apiServices';

export default function DashboardPage() {
  const [stats, setStats] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const dashboardRes = await reportService.getDashboard();
        const revenueRes = await reportService.getRevenueReport({ period: 'week' });
        
        if (dashboardRes.success) {
          setStats(dashboardRes.data.data || []);
        }
        if (revenueRes.success) {
          setChartData(revenueRes.data.data || []);
        }
      } catch (err) {
        setError(err.message || 'Lỗi tải dữ liệu');
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
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">Theo dõi tình trạng 8 sân cầu lông, doanh thu thực tế, lịch đặt sân & cảnh báo kho vật tư.</p>
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
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span>↑ Live metric</span>
            </div>
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
              <h2 className="mt-1 text-2xl font-bold text-slate-100">Lượt Đặt Sân Trong Tuần</h2>
            </div>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-bold text-emerald-400">7 Ngày Qua</span>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#070a11', borderRadius: 16, border: '1px solid #334155', color: '#fff' }} />
                <Line type="monotone" dataKey="revenue" stroke="#00FF66" strokeWidth={4} dot={{ r: 5, fill: '#00FF66' }} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Status Cards */}
        <div className="space-y-6">
          
          {/* Live Court Quick Status */}
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mb-4">Trạng Thái Sân Hôm Nay</p>
            <div className="space-y-3">
              {['Sân 01 - BWF Arena', 'Sân 02 - VIP Lounge', 'Sân 03 - Pro Studio', 'Sân 04 - Standard Arena'].map((court) => (
                <div key={court} className="flex items-center justify-between rounded-2xl bg-slate-950/80 border border-slate-800/60 p-3.5">
                  <div>
                    <p className="text-sm font-bold text-white">{court}</p>
                    <p className="text-xs text-slate-400">Trạng thái: <span className="text-emerald-400 font-semibold">Sẵn sàng</span></p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">Hoạt động</span>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Alerts */}
          <div className="rounded-3xl border border-amber-500/30 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase font-extrabold tracking-widest text-amber-400 mb-3">⚠️ Cảnh Báo Kho Thiết Bị</p>
            <div className="space-y-2.5 text-xs font-medium text-slate-300">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <span>🥤 Nước giải khát Pocari / RedBull:</span>
                <span className="font-bold text-amber-400">Còn 12 chai</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <span>🏸 Quả cầu lông Yonex AS-50:</span>
                <span className="font-bold text-amber-400">Còn 5 ống</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <span>🎾 Vợt Astrox 99 Cho Thuê:</span>
                <span className="font-bold text-emerald-400">Đủ 8 chiếc</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
