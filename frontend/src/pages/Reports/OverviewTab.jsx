import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { StatBox } from '../../components/UIComponents';
import { reportService } from '../../services/apiServices';
import { useTheme } from '../../contexts/ThemeContext';
import { getChartColors } from '../../utils/chartColors';

const formatMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

// Backend trả về [{ date, totalRevenue, totalTransactions }] theo thứ tự mới nhất trước
const toChartData = (rows) =>
  [...rows]
    .slice(0, 7)
    .reverse()
    .map((row) => ({
      date: row.date,
      revenue: Number(row.totalRevenue || 0),
      transactions: Number(row.totalTransactions || 0)
    }));

// Khi request dạng blob bị lỗi, backend vẫn trả JSON -> phải đọc blob ra text mới lấy được message
const readBlobError = async (err) => {
  const blob = err.response?.data;
  if (blob && typeof blob.text === 'function') {
    try {
      const parsed = JSON.parse(await blob.text());
      if (parsed?.message) return parsed.message;
    } catch (parseErr) {
      /* không phải JSON thì bỏ qua, dùng message mặc định */
    }
  }
  return err.message || 'Không xuất được báo cáo';
};

const fileNameFromHeaders = (response, fallback) => {
  const disposition = response.headers?.['content-disposition'];
  const match = disposition && disposition.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
};

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function OverviewTab() {
  const { theme } = useTheme();
  const chartColors = getChartColors(theme);
  const [revenueData, setRevenueData] = useState([]);
  const [topCourts, setTopCourts] = useState([]);
  const [topAccessories, setTopAccessories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [revenueRes, courtsRes, accessoriesRes, dashboardRes] = await Promise.all([
        reportService.getRevenueReport({ period: 'daily' }),
        reportService.getTopCourts(),
        reportService.getTopAccessories(),
        reportService.getDashboard()
      ]);

      setRevenueData(revenueRes.data?.data || []);
      setTopCourts(courtsRes.data?.data || []);
      setTopAccessories(accessoriesRes.data?.data || []);
      setSummary(dashboardRes.data?.data || null);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không tải được dữ liệu báo cáo');
      setLoading(false);
    }
  };

  const exportFile = async (type) => {
    setExporting(type);
    try {
      const isExcel = type === 'Excel';
      const response = isExcel
        ? await reportService.exportExcel({ period: 'daily' })
        : await reportService.exportPdf({ period: 'daily' });

      const fallbackName = `bao-cao-badminton.${isExcel ? 'xlsx' : 'pdf'}`;
      downloadBlob(response.data, fileNameFromHeaders(response, fallbackName));
    } catch (err) {
      alert(await readBlobError(err));
    } finally {
      setExporting(null);
    }
  };

  const chartData = toChartData(revenueData);
  const totalRevenue = revenueData.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0);
  const accessoriesRevenue = topAccessories.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0);

  if (loading) return <div className="p-8 text-slate-900 dark:text-slate-100">Đang tải báo cáo...</div>;
  if (error) return <div className="p-8 text-red-600 dark:text-red-400">Lỗi: {error}</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-end gap-3">
        <button
          onClick={() => exportFile('Excel')}
          disabled={exporting !== null}
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {exporting === 'Excel' ? '⏳ Đang xuất...' : '📊 Xuất Excel'}
        </button>
        <button
          onClick={() => exportFile('PDF')}
          disabled={exporting !== null}
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 disabled:opacity-60"
        >
          {exporting === 'PDF' ? '⏳ Đang xuất...' : '📄 Xuất PDF'}
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <StatBox
          label="Tổng doanh thu"
          value={formatMoney(totalRevenue)}
          subtext={`Hôm nay: ${formatMoney(summary?.todayRevenue)}`}
          highlight
        />
        <StatBox
          label="Tỷ lệ lấp đầy sân"
          value={`${Number(summary?.occupancyRate || 0)}%`}
          subtext={`${Number(summary?.activeCourts || 0)}/${Number(summary?.operatingCourts ?? summary?.totalCourts ?? 0)} sân đang khai thác`}
          highlight
        />
        <StatBox
          label="Doanh thu phụ kiện / dịch vụ"
          value={formatMoney(accessoriesRevenue)}
          subtext={topAccessories[0]?.extra?.name ? `Bán chạy nhất: ${topAccessories[0].extra.name}` : 'Chưa có dữ liệu'}
        />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">Biểu đồ doanh thu 7 kỳ gần nhất</h3>
        <div className="h-80 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Chưa có dữ liệu doanh thu để hiển thị.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.area} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={chartColors.area} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} />
                <XAxis dataKey="date" stroke={chartColors.axisTick} />
                <YAxis stroke={chartColors.axisTick} tickFormatter={(v) => (v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}K`)} />
                <Tooltip
                  formatter={(v) => [formatMoney(v), 'Doanh thu']}
                  contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder, borderRadius: '12px', color: chartColors.tooltipText }}
                />
                <Area type="monotone" dataKey="revenue" stroke={chartColors.area} strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Top sân được thuê nhiều nhất</h3>
          {topCourts.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có phiên chơi nào.</p>
          ) : (
            <ul className="space-y-3">
              {topCourts.map((court, index) => (
                <li key={court.courtId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold mr-2">#{index + 1}</span>
                    {court.court?.name || `Sân #${court.courtId}`}
                  </span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{Number(court.totalSessions || 0)} phiên</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Top phụ kiện bán chạy</h3>
          {topAccessories.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa bán phụ kiện nào.</p>
          ) : (
            <ul className="space-y-3">
              {topAccessories.map((item, index) => (
                <li key={item.extraId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold mr-2">#{index + 1}</span>
                    {item.extra?.name || `Phụ kiện #${item.extraId}`}
                  </span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {Number(item.totalQuantitySold || 0)} · {formatMoney(item.totalRevenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
