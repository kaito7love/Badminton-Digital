import React, { useState, useEffect } from 'react';
import { Modal, Pagination } from '../../components/UIComponents';
import { accessoryService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

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

export default function ProductsTab({ onGoToReceiving }) {
  const [accessories, setAccessories] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccessory, setEditingAccessory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    price: 15000,
    lowStockThreshold: 5,
  });

  const fetchAccessories = async (targetPage = page) => {
    try {
      const res = await accessoryService.getAllAccessories({ page: targetPage });
      const data = res.data?.data || res.data || [];
      setAccessories(Array.isArray(data) ? data : []);
      setMeta(res.data?.meta || null);
    } catch (err) {
      setError(err.message || 'Không tải được danh sách phụ kiện');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchAccessories(page);
      setLoading(false);
    };
    init();
  }, [page]);

  const handleOpenAddModal = () => {
    setEditingAccessory(null);
    setFormData({ name: '', price: 15000, lowStockThreshold: 5 });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingAccessory(item);
    setFormData({
      name: item.name,
      price: Number(item.price || 0),
      lowStockThreshold: item.lowStockThreshold ?? 5,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        price: Number(formData.price),
        lowStockThreshold: Number(formData.lowStockThreshold),
      };

      if (editingAccessory) {
        await accessoryService.updateAccessory(editingAccessory.id, payload);
      } else {
        await accessoryService.createAccessory(payload);
      }
      setIsModalOpen(false);
      fetchAccessories();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi lưu phụ kiện');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc muốn xóa phụ kiện "${name}"?`)) return;
    try {
      await accessoryService.deleteAccessory(id);
      fetchAccessories();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi xóa phụ kiện');
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải danh sách phụ kiện...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Danh mục sản phẩm dùng chung mọi chi nhánh. Tồn kho hiển thị bên dưới là của chi nhánh bạn đang đăng nhập.</p>
        <div className="flex gap-2">
          <button
            onClick={onGoToReceiving}
            className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-500/20"
          >
            📥 Nhập kho
          </button>
          <button
            onClick={handleOpenAddModal}
            className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            + Thêm phụ kiện
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20">
        {accessories.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8">Chưa có phụ kiện nào trong danh mục.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {accessories.map((item) => {
              const stock = item.stockQuantity ?? 0;
              const status = getStockStatus(stock, item.lowStockThreshold);
              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/80 dark:hover:border-slate-700 p-5 flex flex-col justify-between space-y-4 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{item.name}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[status]}`}>
                        {status}
                      </span>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{stock}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Đơn giá: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatMoney(item.price || 0)}</span></p>
                    {item.averageCost != null && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Giá vốn BQ: {formatMoney(item.averageCost)}</p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-slate-200 dark:border-slate-800/80 text-xs">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="flex-1 rounded-xl border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 py-2 font-medium transition"
                    >
                      ✏️ Cập nhật
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.name)}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 transition"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Pagination meta={meta} onPageChange={setPage} itemLabel="sản phẩm" />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAccessory ? `Cập Nhật Phụ Kiện: ${editingAccessory.name}` : 'Thêm Phụ Kiện Mới'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tên món vật tư / phụ kiện *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="VD: Nước suối Aquafina 500ml"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Đơn giá bán (đ) *</label>
              <input
                type="number"
                required
                min={0}
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ngưỡng báo sắp hết</label>
              <input
                type="number"
                min={0}
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {!editingAccessory && (
            <p className="text-xs text-slate-400 dark:text-slate-500">Sản phẩm mới khởi tạo với tồn kho = 0. Dùng nút "Nhập kho" để nhập số lượng thực tế.</p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              {editingAccessory ? 'Lưu Thay Đổi' : 'Tạo Phụ Kiện'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
