import React, { useState, useEffect } from 'react';
import { Pagination } from '../../components/UIComponents';
import { productService, supplierService, goodsReceiptService, inventoryService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ';

const getStockStatus = (stock, threshold) => {
  if (stock <= 0) return 'Critical';
  if (stock <= (threshold || 5)) return 'Low';
  return 'Normal';
};

const statusClass = {
  Normal: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Low: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Critical: 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
};

const emptyLine = () => ({ productVariantId: '', quantity: 1, unitCost: 0 });

export default function RetailStockTab() {
  const [stocks, setStocks] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [allVariants, setAllVariants] = useState([]); // flattened { id, label, sku }
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([emptyLine()]);

  const loadStocks = async (targetPage = page) => {
    const res = await inventoryService.getProductStockLevels({ page: targetPage });
    setStocks(res.data?.data || []);
    setMeta(res.data?.meta || null);
  };

  const loadDropdowns = async () => {
    try {
      const [productsRes, suppliersRes] = await Promise.all([
        productService.getAll(),
        supplierService.getAllSuppliers(),
      ]);
      const products = productsRes.data?.data || [];
      const flattened = products.flatMap((p) =>
        (p.variants || []).map((v) => ({
          id: v.id,
          label: `${p.name} — ${v.sku}${v.size || v.color ? ` (${[v.size, v.color].filter(Boolean).join('/')})` : ''}`,
        }))
      );
      setAllVariants(flattened);
      setSuppliers(suppliersRes.data?.data || []);
    } catch (err) {
      // Danh mục có thể trống — không chặn trang.
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadStocks(1), loadDropdowns()]);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (page === 1) return;
    loadStocks(page);
  }, [page]);

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.productVariantId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      alert('Cần ít nhất 1 dòng sản phẩm hợp lệ');
      return;
    }
    setSubmitting(true);
    try {
      await goodsReceiptService.createGoodsReceipt({
        supplierId: supplierId || null,
        note: note || null,
        items: validLines.map((l) => ({
          productVariantId: Number(l.productVariantId),
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
      });
      setSupplierId('');
      setNote('');
      setLines([emptyLine()]);
      setPage(1);
      await loadStocks(1);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi tạo phiếu nhập kho');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải tồn kho...</div>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
        Tồn kho sản phẩm bán lẻ theo chi nhánh bạn đang đăng nhập — dùng chung ledger với kho phụ kiện trong sân, mỗi chi nhánh một số dư riêng.
      </p>

      {stocks.length === 0 ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">Chưa có tồn kho sản phẩm bán lẻ nào ở chi nhánh này — nhập kho bên dưới.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {stocks.map((s) => {
            const status = getStockStatus(s.quantity, s.variant?.lowStockThreshold);
            return (
              <div key={s.id} className="rounded-3xl border border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/80 dark:hover:border-slate-700 p-5 flex flex-col justify-between space-y-3 transition">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.variant?.product?.name}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[status]}`}>{status}</span>
                  </div>
                  <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-1">
                    {s.variant?.sku}{(s.variant?.size || s.variant?.color) ? ` · ${[s.variant.size, s.variant.color].filter(Boolean).join('/')}` : ''}
                  </p>
                  <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{s.quantity}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Giá bán: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatMoney(s.variant?.listPrice)}</span></p>
                  {s.averageCost != null && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Giá vốn BQ: {formatMoney(s.averageCost)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination meta={meta} onPageChange={setPage} itemLabel="sản phẩm" />

      <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nhập kho sản phẩm bán lẻ</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nhà cung cấp</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none">
              <option value="">— Không chọn —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ghi chú</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="VD: Nhập bổ sung áo size L" />
          </div>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Biến thể sản phẩm</label>
                <select value={line.productVariantId} onChange={(e) => updateLine(index, { productVariantId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none">
                  <option value="">— Chọn biến thể —</option>
                  {allVariants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Số lượng</label>
                <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Đơn giá nhập (đ)</label>
                <input type="number" min={0} value={line.unitCost} onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="col-span-1">
                <button type="button" onClick={() => removeLine(index)} disabled={lines.length === 1}
                  className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-30 transition">🗑️</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addLine}
            className="rounded-xl border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-xs font-medium transition">
            + Thêm dòng
          </button>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-300">Tổng giá trị: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(total)}</span></p>
          <button type="submit" disabled={submitting}
            className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition">
            {submitting ? 'Đang lưu...' : 'Tạo phiếu nhập'}
          </button>
        </div>
      </form>
    </div>
  );
}
