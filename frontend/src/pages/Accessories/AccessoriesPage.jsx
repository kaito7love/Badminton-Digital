import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/UIComponents';
import { accessoryService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

const getStockStatus = (stock, threshold) => {
  if (stock <= 0) return 'Critical';
  if (stock <= (threshold || 5)) return 'Low';
  return 'Normal';
};

const statusClass = {
  Normal: 'bg-emerald-500/10 text-emerald-300',
  Low: 'bg-amber-500/10 text-amber-300',
  Critical: 'bg-rose-500/10 text-rose-300'
};

export default function AccessoriesPage() {
  const [accessories, setAccessories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccessory, setEditingAccessory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    price: 15000,
    stockQuantity: 50,
    lowStockThreshold: 5,
  });

  const fetchAccessories = async () => {
    try {
      const res = await accessoryService.getAllAccessories();
      const data = res.data?.data || res.data || [];
      setAccessories(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Không tải được danh sách phụ kiện');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchAccessories();
      setLoading(false);
    };
    init();
  }, []);

  const handleOpenAddModal = () => {
    setEditingAccessory(null);
    setFormData({
      name: '',
      price: 15000,
      stockQuantity: 50,
      lowStockThreshold: 5,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingAccessory(item);
    setFormData({
      name: item.name,
      price: Number(item.price || 0),
      stockQuantity: item.stockQuantity ?? item.stock ?? 0,
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
        stockQuantity: Number(formData.stockQuantity),
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

  if (loading) return <div className="p-8 text-slate-300">⏳ Đang tải danh sách phụ kiện...</div>;
  if (error) return <div className="p-8 text-rose-400">❌ {error}</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-400 font-medium">Accessories</p>
          <h1 className="text-3xl font-bold text-slate-100">Quản lý phụ kiện</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">Theo dõi tồn kho, cập nhật giá & số lượng và nhận cảnh báo khi cần nhập thêm hàng.</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          + Thêm phụ kiện
        </button>
      </div>

      {/* Grid Phụ Kiện */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
        {accessories.length === 0 ? (
          <p className="text-center text-slate-400 py-8">Chưa có phụ kiện nào trong kho.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {accessories.map((item) => {
              const stock = item.stockQuantity ?? item.stock ?? 0;
              const status = getStockStatus(stock, item.lowStockThreshold);
              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-slate-200">{item.name}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[status]}`}>
                        {status}
                      </span>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-slate-100">{stock}</p>
                    <p className="text-xs text-slate-400 mt-1">Đơn giá: <span className="font-semibold text-slate-200">{formatMoney(item.price || 0)}</span></p>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-slate-800/80 text-xs">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800/50 py-2 font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition"
                    >
                      ✏️ Cập nhật
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.name)}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-medium text-rose-400 hover:bg-rose-500/20 transition"
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

      {/* Modal Thêm / Sửa Phụ Kiện */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAccessory ? `Cập Nhật Phụ Kiện: ${editingAccessory.name}` : 'Thêm Phụ Kiện Mới'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Tên món vật tư / phụ kiện *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
              placeholder="VD: Nước suối Aquafina 500ml"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Đơn giá (đ) *</label>
              <input
                type="number"
                required
                min={0}
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Số lượng kho *</label>
              <input
                type="number"
                required
                min={0}
                value={formData.stockQuantity}
                onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Ngưỡng báo sắp hết</label>
              <input
                type="number"
                min={0}
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
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
