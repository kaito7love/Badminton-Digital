import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { StatBox } from '../../components/UIComponents';
import { reportService } from '../../services/apiServices';

export default function ReportsPage() {
  const [revenueData, setRevenueData] = useState([]);
  const [topCourts, setTopCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [revenueRes, courtsRes] = await Promise.all([
        reportService.getRevenueReport({ period: 'week' }),
        reportService.getTopCourts()
      ]);
      
      if (revenueRes.data && revenueRes.data.data) {
        setRevenueData(revenueRes.data.data);
      }
      if (courtsRes.data && courtsRes.data.data) {
        setTopCourts(courtsRes.data.data);
      }
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to fetch report data');
      setLoading(false);
    }
  };

  const exportFile = (type) => {
    alert(`Đang xuất file báo cáo định dạng ${type}...`);
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
            onClick={() => exportFile('Excel')}
            className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            📊 Xuất Excel
          </button>
          <button
            onClick={() => exportFile('PDF')}
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/20"
          >
            📄 Xuất PDF
          </button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <StatBox label="Tổng doanh thu tuần" value="19.200.000 đ" subtext="+18.5% so với tuần trước" highlight />
        <StatBox label="Tỷ lệ lấp đầy sân" value="78.4%" subtext="Giờ cao điểm: 95%" highlight />
        <StatBox label="Doanh thu phụ kiện / dịch vụ" value="3.450.000 đ" subtext="Nước uống & Cầu lông" />
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
        <h3 className="text-lg font-bold text-slate-100 mb-6">Biểu đồ doanh thu 7 ngày gần nhất</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="day" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(v) => `${v / 1000000}M`} />
              <Tooltip formatter={(v) => [`${v.toLocaleString()} đ`, 'Doanh thu']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc' }} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
