import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { StatBox, Table } from '../../components/UIComponents';
import { reportService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' đ';

const formatDuration = (seconds) => {
  const hours = (Number(seconds) || 0) / 3600;
  return `${hours.toFixed(1)} giờ`;
};

export default function ReportsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [topCourts, setTopCourts] = useState([]);
  const [topAccessories, setTopAccessories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [dashboardRes, revenueRes, courtsRes, accessoriesRes] = await Promise.all([
        reportService.getDashboard(),
        reportService.getRevenueReport({ period: 'daily' }),
        reportService.getTopCourts(),
        reportService.getTopAccessories(),
      ]);

      setDashboard(dashboardRes.data?.data || null);

      const revenue = (revenueRes.data?.data || [])
        .map((row) => ({ ...row, totalRevenue: Number(row.totalRevenue) || 0 }))
        .reverse();
      setRevenueData(revenue);

      setTopCourts(courtsRes.data?.data || []);
      setTopAccessories(accessoriesRes.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  };

  const accessoryRevenue = topAccessories.reduce((sum, a) => sum + (Number(a.totalRevenue) || 0), 0);

  const notifyUnavailable = (type) => {
    alert(`Xuất báo cáo ${type} chưa được hỗ trợ ở phiên bản này.`);
  };

  if (loading) return <div className="p-8 text-slate-100">Loading reports...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-400 font-medium">Reports & Analytics</p>
          <h1 className="text-3xl font-bold text-slate-100">Báo cáo & Thống kê doanh thu</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">Phân tích doanh thu sân, phụ kiện và xuất dữ liệu báo cáo chi tiết Excel/PDF.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => notifyUnavailable('Excel')}
            className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            📊 Xuất Excel
          </button>
          <button
            onClick={() => notifyUnavailable('PDF')}
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/20"
          >
            📄 Xuất PDF
          </button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <StatBox
          label="Doanh thu hôm nay"
          value={formatMoney(dashboard?.todayRevenue)}
          subtext={`${dashboard?.activeCourts ?? 0}/${dashboard?.totalCourts ?? 0} sân đang hoạt động`}
          highlight
        />
        <StatBox
          label="Tỷ lệ lấp đầy sân"
          value={`${dashboard?.occupancyRate ?? 0}%`}
          subtext={dashboard?.lowStockCount ? `${dashboard.lowStockCount} vật tư sắp hết hàng` : 'Kho vật tư ổn định'}
          highlight
        />
        <StatBox
          label="Doanh thu phụ kiện (Top 5)"
          value={formatMoney(accessoryRevenue)}
          subtext={topAccessories[0]?.extra?.name ? `Bán chạy nhất: ${topAccessories[0].extra.name}` : 'Chưa có dữ liệu'}
        />
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
        <h3 className="text-lg font-bold text-slate-100 mb-6">Doanh thu theo ngày</h3>
        <div className="h-80 w-full">
          {revenueData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Chưa có dữ liệu doanh thu</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(v) => `${v / 1000000}M`} />
                <Tooltip formatter={(v) => [formatMoney(v), 'Doanh thu']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc' }} />
                <Area type="monotone" dataKey="totalRevenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-lg font-bold text-slate-100 mb-4">Top 5 sân hoạt động nhiều nhất</h3>
          {topCourts.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có dữ liệu</p>
          ) : (
            <Table headers={['Sân', 'Số phiên', 'Tổng thời lượng']}>
              {topCourts.map((c) => (
                <tr key={c.courtId}>
                  <td className="px-6 py-4">{c.court?.name || `#${c.courtId}`}</td>
                  <td className="px-6 py-4">{c.totalSessions}</td>
                  <td className="px-6 py-4">{formatDuration(c.totalDurationSeconds)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-100 mb-4">Top 5 phụ kiện bán chạy</h3>
          {topAccessories.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có dữ liệu</p>
          ) : (
            <Table headers={['Phụ kiện', 'Số lượng', 'Doanh thu']}>
              {topAccessories.map((a) => (
                <tr key={a.extraId}>
                  <td className="px-6 py-4">{a.extra?.name || `#${a.extraId}`}</td>
                  <td className="px-6 py-4">{a.totalQuantitySold}</td>
                  <td className="px-6 py-4">{formatMoney(a.totalRevenue)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
