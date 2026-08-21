import React, { useState, useEffect, useCallback } from 'react';
import { Table } from '../../components/UIComponents';
import { reportService } from '../../services/apiServices';
import { useAuth } from '../../contexts/AuthContext';
import { roleOf } from '../../utils/roles';
import { formatDateTime } from '../../utils/datetime';
import { useBranch } from '../../contexts/BranchContext';

const formatMoney = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;


const SOURCE_LABELS = {
  court: 'Tiền sân',
  session_extra: 'Phụ kiện trong sân',
  retail: 'Bán lẻ tại quầy',
  discount: 'Giảm giá',
  other: 'Khác'
};
const SOURCE_ORDER = ['court', 'session_extra', 'retail', 'discount', 'other'];

/** Gộp mảng phẳng [{bucket, source, branchId?, amount, quantity}] thành bảng theo bucket (+ branch nếu có). */
function pivotByBucket(rows, compareBranches) {
  const groups = new Map();
  for (const row of rows) {
    const key = compareBranches ? `${row.bucket}|${row.branchId}` : row.bucket;
    if (!groups.has(key)) groups.set(key, { bucket: row.bucket, branchId: row.branchId ?? null, sources: {} });
    groups.get(key).sources[row.source] = Number(row.amount);
  }
  return [...groups.values()].sort((a, b) => (a.bucket < b.bucket ? 1 : -1));
}

export default function RevenueBreakdownTab() {
  // Mốc thời gian hiển thị theo giờ chi nhánh đang xem, không theo giờ máy người xem.
  const { activeTimezone } = useBranch();
  const { user } = useAuth();
  const isAdmin = roleOf(user) === 'admin';

  const [period, setPeriod] = useState('daily');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [compareBranches, setCompareBranches] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { period };
      if (from) params.from = from;
      if (to) params.to = to;
      if (compareBranches && isAdmin) params.compareBranches = 'true';
      const res = await reportService.getRevenueBreakdown(params);
      setData(res.data?.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được báo cáo doanh thu chi tiết');
    } finally {
      setLoading(false);
    }
  }, [period, from, to, compareBranches, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows = pivotByBucket(data?.breakdown || [], compareBranches && isAdmin);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Kỳ</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none cursor-pointer">
            <option value="daily" className="bg-white dark:bg-slate-900">Ngày</option>
            <option value="monthly" className="bg-white dark:bg-slate-900">Tháng</option>
            <option value="quarterly" className="bg-white dark:bg-slate-900">Quý</option>
            <option value="yearly" className="bg-white dark:bg-slate-900">Năm</option>
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Từ</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Đến</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={compareBranches} onChange={(e) => setCompareBranches(e.target.checked)} />
            So sánh giữa các chi nhánh
          </label>
        )}
      </div>

      {data?.dataFrom && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          ⓘ Dữ liệu chi tiết theo dòng chỉ có từ {data.dataFrom} trở đi (trước đó hoá đơn chưa ghi itemized).
        </p>
      )}

      {loading ? (
        <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải...</div>
      ) : error ? (
        <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>
      ) : (
        <>
          <Table headers={[compareBranches && isAdmin ? 'Kỳ / Chi nhánh' : 'Kỳ', ...SOURCE_ORDER.map((s) => SOURCE_LABELS[s])]}>
            {rows.length === 0 ? (
              <tr><td colSpan={SOURCE_ORDER.length + 1} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">Chưa có dữ liệu trong khoảng này.</td></tr>
            ) : rows.map((row) => (
              <tr key={`${row.bucket}-${row.branchId}`}>
                <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                  {row.bucket}{row.branchId != null ? ` · CN #${row.branchId}` : ''}
                </td>
                {SOURCE_ORDER.map((s) => (
                  <td key={s} className={`px-6 py-4 ${s === 'discount' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    {row.sources[s] != null ? formatMoney(row.sources[s]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </Table>

          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Chi tiết giảm giá theo hoá đơn</h3>
            {(!data?.discounts || data.discounts.length === 0) ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">Không có giảm giá nào trong khoảng này.</p>
            ) : (
              <Table headers={['Hoá đơn', 'Thời gian', 'Nhân viên', 'Số tiền giảm']}>
                {data.discounts.map((d, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400">{d.invoiceNo}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">{formatDateTime(d.createdAt, activeTimezone)}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-200">{d.employeeName || '—'}</td>
                    <td className="px-6 py-4 font-semibold text-rose-600 dark:text-rose-400">{formatMoney(d.amount)}</td>
                  </tr>
                ))}
              </Table>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              ⓘ Chưa có trường "lý do giảm giá" — hệ thống hiện chưa lưu dữ liệu này (xem 05-backlog-nhom-b.md).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
