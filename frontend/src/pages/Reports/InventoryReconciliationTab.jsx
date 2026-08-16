import React, { useState, useEffect, useCallback } from 'react';
import { Table, Badge } from '../../components/UIComponents';
import { reportService } from '../../services/apiServices';

export default function InventoryReconciliationTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await reportService.getInventoryReconciliation(params);
      setData(res.data?.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được báo cáo đối chiếu kho');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const items = data?.items || [];
  const flagged = items.filter((i) => i.soldDiscrepancy !== 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Từ</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Đến</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
        <div className="ml-auto text-xs text-slate-500 font-semibold">
          {items.length} sản phẩm có phát sinh · {flagged.length} sản phẩm lệch bán
        </div>
      </div>

      {data?.dataFrom && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          ⓘ Sổ kho (nhập/bán/điều chỉnh) đầy đủ từ {data.dataFrom.ledger}. Đối chiếu với hoá đơn chỉ tính được
          từ {data.dataFrom.invoiceComparison} (trước đó hoá đơn chưa ghi itemized) — chênh lệch bán ở giai đoạn
          trước mốc này là do giới hạn dữ liệu, không phải thất thoát thật.
        </p>
      )}

      {loading ? (
        <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải...</div>
      ) : error ? (
        <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>
      ) : items.length === 0 ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">
          Không có phát sinh nhập/bán/điều chỉnh nào trong khoảng này.
        </p>
      ) : (
        <Table headers={['Sản phẩm', 'Loại', 'Nhập', 'Bán (sổ kho)', 'Trả lại', 'Điều chỉnh', 'Bán (hoá đơn)', 'Chênh lệch bán', 'Tồn hiện tại']}>
          {items.map((item) => (
            <tr key={`${item.itemType}-${item.itemId}`} className={item.soldDiscrepancy !== 0 ? 'bg-amber-500/5' : ''}>
              <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{item.name || `#${item.itemId}`}</td>
              <td className="px-6 py-4">
                <Badge variant={item.itemType === 'extra' ? 'sky' : 'violet'}>
                  {item.itemType === 'extra' ? 'Phụ kiện sân' : 'Bán lẻ'}
                </Badge>
              </td>
              <td className="px-6 py-4">{item.qtyIn}</td>
              <td className="px-6 py-4">{item.qtySoldLedger}</td>
              <td className="px-6 py-4">{item.qtyReturned}</td>
              <td className="px-6 py-4">{item.qtyAdjustedNet}</td>
              <td className="px-6 py-4">{item.qtySoldInvoice}</td>
              <td className={`px-6 py-4 font-bold ${item.soldDiscrepancy !== 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-600'}`}>
                {item.soldDiscrepancy !== 0 ? `⚠️ ${item.soldDiscrepancy}` : '0'}
              </td>
              <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">{item.currentQuantity ?? '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
