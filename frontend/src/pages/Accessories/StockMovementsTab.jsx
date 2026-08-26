import React, { useState, useEffect } from 'react';
import { Modal, Table, Badge, Pagination } from '../../components/UIComponents';
import { accessoryService, inventoryService } from '../../services/apiServices';
import { formatDateTime } from '../../utils/datetime';
import { useBranch } from '../../contexts/BranchContext';

const TYPE_LABELS = {
  opening_balance: 'Số dư đầu kỳ',
  purchase_receipt: 'Nhập kho',
  sale: 'Bán hàng',
  sale_return: 'Trả hàng',
  adjustment_in: 'Điều chỉnh tăng',
  adjustment_out: 'Điều chỉnh giảm',
  damaged: 'Hàng hỏng',
  lost: 'Thất lạc',
};

const TYPE_VARIANT = {
  opening_balance: 'slate',
  purchase_receipt: 'emerald',
  sale: 'sky',
  sale_return: 'violet',
  adjustment_in: 'emerald',
  adjustment_out: 'amber',
  damaged: 'rose',
  lost: 'rose',
};

const ADJUSTMENT_TYPES = ['adjustment_in', 'adjustment_out', 'damaged', 'lost'];


const formatMoney = (n) => n == null ? '—' : new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

export default function StockMovementsTab() {
  // Mốc thời gian hiển thị theo giờ chi nhánh đang xem, không theo giờ máy người xem.
  const { activeTimezone } = useBranch();
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({ extraId: '', type: '', from: '', to: '' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ extraId: '', type: 'damaged', quantity: 1, note: '' });

  const fetchMovements = async (activeFilters = filters, targetPage = page) => {
    const params = { page: targetPage };
    if (activeFilters.extraId) params.extraId = activeFilters.extraId;
    if (activeFilters.type) params.type = activeFilters.type;
    if (activeFilters.from) params.from = activeFilters.from;
    if (activeFilters.to) params.to = activeFilters.to;
    const res = await inventoryService.getMovements(params);
    setMovements(res.data?.data || []);
    setMeta(res.data?.meta || null);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const productsRes = await accessoryService.getAllAccessories();
        setProducts(productsRes.data?.data || []);
        await fetchMovements(filters, 1);
      } catch (err) {
        // im lặng — bảng sẽ hiện rỗng
      }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (page === 1) return; // trang 1 đã tải ở init()
    fetchMovements(filters, page);
  }, [page]);

  const handleFilterChange = (patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    fetchMovements(next, 1);
  };

  const openAdjustModal = () => {
    setAdjustForm({ extraId: products[0]?.id || '', type: 'damaged', quantity: 1, note: '' });
    setIsModalOpen(true);
  };

  const handleSubmitAdjustment = async (e) => {
    e.preventDefault();
    if (!adjustForm.extraId) {
      alert('Chọn sản phẩm cần điều chỉnh');
      return;
    }
    setSubmitting(true);
    try {
      await inventoryService.createAdjustment({
        extraId: Number(adjustForm.extraId),
        type: adjustForm.type,
        quantity: Number(adjustForm.quantity),
        note: adjustForm.note,
      });
      setIsModalOpen(false);
      setPage(1);
      await fetchMovements(filters, 1);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi ghi nhận điều chỉnh kho');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải lịch sử kho...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 flex-1">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sản phẩm</label>
            <select
              value={filters.extraId}
              onChange={(e) => handleFilterChange({ extraId: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
            >
              <option value="">Tất cả sản phẩm</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Loại giao dịch</label>
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange({ type: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
            >
              <option value="">Tất cả loại</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Từ ngày</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => handleFilterChange({ from: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Đến ngày</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => handleFilterChange({ to: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        <button
          onClick={openAdjustModal}
          className="shrink-0 whitespace-nowrap rounded-3xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition"
        >
          ⚠️ Điều chỉnh kho
        </button>
      </div>

      {movements.length === 0 ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">Chưa có giao dịch kho nào khớp bộ lọc.</p>
      ) : (
        <Table headers={['Thời gian', 'Sản phẩm', 'Loại', 'Số lượng', 'Đơn giá', 'Ghi chú']}>
          {movements.map((m) => (
            <tr key={m.id}>
              <td className="px-6 py-4 whitespace-nowrap">{formatDateTime(m.createdAt, activeTimezone)}</td>
              <td className="px-6 py-4">{m.extra?.name || `#${m.extraId}`}</td>
              <td className="px-6 py-4">
                <Badge variant={TYPE_VARIANT[m.type] || 'slate'}>{TYPE_LABELS[m.type] || m.type}</Badge>
              </td>
              <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">{m.quantity}</td>
              <td className="px-6 py-4">{formatMoney(m.unitCost)}</td>
              <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{m.note || '—'}</td>
            </tr>
          ))}
        </Table>
      )}

      <Pagination meta={meta} onPageChange={setPage} itemLabel="giao dịch" />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Điều chỉnh kho thủ công">
        <form onSubmit={handleSubmitAdjustment} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sản phẩm *</label>
            <select
              required
              value={adjustForm.extraId}
              onChange={(e) => setAdjustForm({ ...adjustForm, extraId: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="">— Chọn sản phẩm —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} (tồn: {p.stockQuantity ?? 0})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Loại điều chỉnh *</label>
              <select
                value={adjustForm.type}
                onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              >
                {ADJUSTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Số lượng *</label>
              <input
                type="number"
                required
                min={1}
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Lý do *</label>
            <textarea
              required
              value={adjustForm.note}
              onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              rows={2}
              placeholder="VD: Vỡ 2 chai khi vận chuyển"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" disabled={submitting} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
              {submitting ? 'Đang lưu...' : 'Ghi nhận điều chỉnh'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
