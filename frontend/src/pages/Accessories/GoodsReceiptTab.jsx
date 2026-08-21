import React, { useState, useEffect } from 'react';
import { Table, Pagination } from '../../components/UIComponents';
import { accessoryService, supplierService, goodsReceiptService } from '../../services/apiServices';
import { formatDateTime } from '../../utils/datetime';
import { useBranch } from '../../contexts/BranchContext';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ';


const emptyLine = () => ({ extraId: '', quantity: 1, unitCost: 0 });

export default function GoodsReceiptTab() {
  // Mốc thời gian hiển thị theo giờ chi nhánh đang xem, không theo giờ máy người xem.
  const { activeTimezone } = useBranch();
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [receiptsMeta, setReceiptsMeta] = useState(null);
  const [receiptsPage, setReceiptsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([emptyLine()]);

  const loadDropdowns = async () => {
    try {
      const [productsRes, suppliersRes] = await Promise.all([
        accessoryService.getAllAccessories(),
        supplierService.getAllSuppliers(),
      ]);
      setProducts(productsRes.data?.data || []);
      setSuppliers(suppliersRes.data?.data || []);
    } catch (err) {
      // Danh mục có thể trống khi mới cài đặt — không chặn form.
    }
  };

  const loadReceipts = async (targetPage = receiptsPage) => {
    const receiptsRes = await goodsReceiptService.getAllGoodsReceipts({ page: targetPage });
    setReceipts(receiptsRes.data?.data || []);
    setReceiptsMeta(receiptsRes.data?.meta || null);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadDropdowns(), loadReceipts(1)]);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (receiptsPage === 1) return; // trang 1 đã tải ở init()
    loadReceipts(receiptsPage);
  }, [receiptsPage]);

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const resetForm = () => {
    setSupplierId('');
    setNote('');
    setLines([emptyLine()]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.extraId && Number(l.quantity) > 0);
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
          extraId: Number(l.extraId),
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
      });
      resetForm();
      setReceiptsPage(1);
      await loadReceipts(1);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi tạo phiếu nhập kho');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải...</div>;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tạo phiếu nhập kho</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nhà cung cấp</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="">— Không chọn —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ghi chú</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="VD: Nhập bổ sung dịp cuối tuần"
            />
          </div>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sản phẩm</label>
                <select
                  value={line.extraId}
                  onChange={(e) => updateLine(index, { extraId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">— Chọn sản phẩm —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Số lượng</label>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Đơn giá nhập (đ)</label>
                <input
                  type="number"
                  min={0}
                  value={line.unitCost}
                  onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="col-span-1">
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  disabled={lines.length === 1}
                  className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-30 transition"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="rounded-xl border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-xs font-medium transition"
          >
            + Thêm dòng
          </button>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-300">Tổng giá trị: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(total)}</span></p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
          >
            {submitting ? 'Đang lưu...' : 'Tạo phiếu nhập'}
          </button>
        </div>
      </form>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Lịch sử phiếu nhập</h3>
        {receipts.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">Chưa có phiếu nhập kho nào.</p>
        ) : (
          <Table headers={['Mã phiếu', 'Ngày', 'Nhà cung cấp', 'Người nhập', 'Tổng tiền']}>
            {receipts.map((r) => (
              <tr key={r.id}>
                <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{r.code}</td>
                <td className="px-6 py-4">{formatDateTime(r.createdAt, activeTimezone)}</td>
                <td className="px-6 py-4">{r.supplier?.name || '—'}</td>
                <td className="px-6 py-4">{r.receivedBy?.fullName || '—'}</td>
                <td className="px-6 py-4 font-semibold text-emerald-700 dark:text-emerald-300">{formatMoney(r.totalCost)}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination meta={receiptsMeta} onPageChange={setReceiptsPage} itemLabel="phiếu nhập" />
      </div>
    </div>
  );
}
