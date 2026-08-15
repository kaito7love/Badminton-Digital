import React, { useState, useEffect } from 'react';
import { Modal, Table, Pagination } from '../../components/UIComponents';
import { supplierService } from '../../services/apiServices';

const emptyForm = { name: '', phone: '', email: '', address: '', taxCode: '', note: '' };

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const fetchSuppliers = async (targetPage = page) => {
    try {
      const res = await supplierService.getAllSuppliers({ page: targetPage });
      setSuppliers(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch (err) {
      setError(err.message || 'Không tải được danh sách nhà cung cấp');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchSuppliers(page);
      setLoading(false);
    };
    init();
  }, [page]);

  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingSupplier(item);
    setFormData({
      name: item.name || '',
      phone: item.phone || '',
      email: item.email || '',
      address: item.address || '',
      taxCode: item.taxCode || '',
      note: item.note || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await supplierService.updateSupplier(editingSupplier.id, formData);
      } else {
        await supplierService.createSupplier(formData);
      }
      setIsModalOpen(false);
      fetchSuppliers();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi lưu nhà cung cấp');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc muốn xóa nhà cung cấp "${name}"?`)) return;
    try {
      await supplierService.deleteSupplier(id);
      fetchSuppliers();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi xóa nhà cung cấp');
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải danh sách nhà cung cấp...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Danh sách nhà cung cấp dùng chung cho mọi chi nhánh khi tạo phiếu nhập kho.</p>
        <button
          onClick={handleOpenAddModal}
          className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          + Thêm nhà cung cấp
        </button>
      </div>

      {suppliers.length === 0 ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">Chưa có nhà cung cấp nào.</p>
      ) : (
        <Table headers={['Tên', 'Điện thoại', 'Email', 'Mã số thuế', '']}>
          {suppliers.map((s) => (
            <tr key={s.id}>
              <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{s.name}</td>
              <td className="px-6 py-4">{s.phone || '—'}</td>
              <td className="px-6 py-4">{s.email || '—'}</td>
              <td className="px-6 py-4">{s.taxCode || '—'}</td>
              <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                <button onClick={() => handleOpenEditModal(s)} className="rounded-lg border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-medium">✏️ Sửa</button>
                <button onClick={() => handleDelete(s.id, s.name)} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-500/20">🗑️</button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Pagination meta={meta} onPageChange={setPage} itemLabel="nhà cung cấp" />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingSupplier ? `Cập nhật: ${editingSupplier.name}` : 'Thêm nhà cung cấp'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tên nhà cung cấp *</label>
            <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Điện thoại</label>
              <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email</label>
              <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Địa chỉ</label>
            <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mã số thuế</label>
            <input type="text" value={formData.taxCode} onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ghi chú</label>
            <textarea value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} rows={2} className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">{editingSupplier ? 'Lưu thay đổi' : 'Tạo nhà cung cấp'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
