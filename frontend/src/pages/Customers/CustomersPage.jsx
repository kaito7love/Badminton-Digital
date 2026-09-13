import React, { useState, useEffect } from 'react';
import { Modal, Pagination } from '../../components/UIComponents';
import { customerService } from '../../services/apiServices';
import { formatDate } from '../../utils/datetime';

const formatMoney = (n) => {
  if (n == null) return '₫0';
  const num = Number(n);
  if (num >= 1000000) return `₫${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `₫${(num / 1000).toFixed(0)}K`;
  return `₫${num}`;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({ fullName: '', phone: '', email: '', password: '123456' });

  const fetchCustomers = async (keyword, targetPage = 1) => {
    try {
      const params = { page: targetPage };
      if (keyword) params.search = keyword;
      const res = await customerService.getAllCustomers(params);
      const data = res.data?.data || res.data || [];
      setCustomers(Array.isArray(data) ? data : []);
      setMeta(res.data?.meta || null);
    } catch (err) {
      setError(err.message || 'Không tải được danh sách khách hàng');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchCustomers(search, page);
      setLoading(false);
    };
    init();
  }, [page]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers(search, 1);
  };

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setFormData({ fullName: '', phone: '', email: '', password: '123456' });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      fullName: customer.fullName || customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await customerService.updateCustomer(editingCustomer.id, {
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email || null,
        });
      } else {
        await customerService.createCustomer({
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email || null,
          // Bỏ trống thì chỉ lập hồ sơ; khách tự đăng ký sau bằng chính số này
          // thì nhân viên xác minh rồi bấm "Gộp vào tài khoản" để nối lịch sử.
          password: formData.password || undefined,
        });
      }
      setIsModalOpen(false);
      fetchCustomers(search, page);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi lưu thông tin khách hàng');
    }
  };

  // Đăng ký online không tự nhận hồ sơ tại quầy cùng số — nhân viên phải xác
  // minh người trước mặt rồi mới gộp (backend ghi nhật ký customer.merged).
  const handleMerge = async (customer) => {
    const account = customer.pendingAccount;
    const confirmed = window.confirm(
      `Gộp hồ sơ "${customer.fullName}" (${customer.phone}) vào tài khoản online "${account.fullName}" `
      + `(đăng ký ngày ${formatDate(account.registeredAt)})?\n\n`
      + 'Chỉ gộp khi đã xác minh người trước mặt vừa là chủ số điện thoại này vừa là chủ tài khoản '
      + '(ví dụ khách mở app đang đăng nhập bằng số đó).\n\n'
      + 'Lịch sử chơi, tổng chi tiêu, hạng và số điện thoại sẽ chuyển sang tài khoản. Không hoàn tác được.'
    );
    if (!confirmed) return;
    try {
      await customerService.mergeIntoAccount(customer.id, account.customerId);
      alert(`Đã gộp hồ sơ vào tài khoản "${account.fullName}".`);
      fetchCustomers(search, page);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi gộp hồ sơ');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc muốn xóa khách hàng "${name}"?`)) return;
    try {
      await customerService.deleteCustomer(id);
      fetchCustomers(search, page);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi xóa khách hàng');
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải danh sách khách hàng...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">Customers</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Danh sách khách hàng</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Tra cứu nhanh khách hàng, cập nhật SĐT, thông tin cá nhân và lịch sử tiêu dùng.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc SĐT..."
              className="rounded-3xl border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 whitespace-nowrap rounded-3xl border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold transition"
            >
              🔍 Tìm
            </button>
          </form>
          <button
            onClick={handleOpenAddModal}
            className="shrink-0 whitespace-nowrap rounded-3xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            + Thêm khách hàng
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20">
        {customers.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8">Không tìm thấy khách hàng nào.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4 uppercase tracking-[0.24em]">Tên</th>
                <th className="px-6 py-4 uppercase tracking-[0.24em]">SĐT</th>
                <th className="px-6 py-4 uppercase tracking-[0.24em]">Email</th>
                <th className="px-6 py-4 uppercase tracking-[0.24em]">Tổng chi</th>
                <th className="px-6 py-4 uppercase tracking-[0.24em]">Hạng</th>
                <th className="px-6 py-4 uppercase tracking-[0.24em] text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950/80">
              {customers.map((customer) => {
                const name = customer.fullName || customer.name || 'N/A';
                return (
                  <tr key={customer.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/80">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">
                      {name}
                      {customer.pendingAccount && (
                        <span className="mt-1 block w-fit rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                          Có tài khoản online chưa gộp
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">{customer.phone || 'N/A'}</td>
                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">{customer.email || '—'}</td>
                    <td className="px-6 py-4 font-mono font-semibold text-slate-700 dark:text-slate-200">{formatMoney(customer.totalSpent)}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        customer.loyaltyTier === 'vip' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                        customer.loyaltyTier === 'gold' ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300' :
                        'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300'
                      }`}>
                        {(customer.loyaltyTier || 'normal').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {customer.pendingAccount && (
                        <button
                          onClick={() => handleMerge(customer)}
                          className="text-sky-600 dark:text-sky-400 hover:underline text-xs font-medium"
                        >
                          🔗 Gộp vào tài khoản
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEditModal(customer)}
                        className="text-emerald-600 dark:text-emerald-400 hover:underline text-xs font-medium"
                      >
                        ✏️ Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(customer.id, name)}
                        className="text-rose-600 dark:text-rose-400 hover:underline text-xs font-medium"
                      >
                        🗑️ Xóa
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination meta={meta} onPageChange={setPage} itemLabel="khách hàng" />

      {/* Modal Thêm / Sửa Khách Hàng */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? `Sửa Khách Hàng: ${editingCustomer.fullName || editingCustomer.name}` : 'Thêm Khách Hàng Mới'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Họ và tên *</label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Số điện thoại *</label>
            <input
              type="text"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="0901234567"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email (Tùy chọn)</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="khachhang@gmail.com"
            />
          </div>

          {!editingCustomer && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Mật khẩu đăng nhập
              </label>
              <input
                type="text"
                minLength={6}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="Tối thiểu 6 ký tự"
              />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Mặc định <span className="font-mono text-slate-500 dark:text-slate-400">123456</span> — khách đăng nhập
                bằng số điện thoại vừa nhập, đổi lại mật khẩu này nếu cần. Xoá trắng ô
                này nếu chỉ muốn lập hồ sơ, chưa tạo tài khoản đăng nhập cho khách.
              </p>
            </div>
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
              {editingCustomer ? 'Lưu Thay Đổi' : 'Tạo Khách Hàng'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
