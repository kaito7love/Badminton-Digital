import React, { useState, useEffect } from 'react';
import { Modal, Badge } from '../../components/UIComponents';
import { voucherService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ';

const emptyForm = () => ({
  code: '',
  discountType: 'percent',
  discountValue: '',
  maxDiscountAmount: '',
  minOrderAmount: '',
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  perCustomerLimit: '',
});

const describeVoucher = (v) => {
  const value = v.discountType === 'percent'
    ? `Giảm ${Number(v.discountValue)}%${v.maxDiscountAmount ? ` (tối đa ${formatMoney(v.maxDiscountAmount)})` : ''}`
    : `Giảm ${formatMoney(v.discountValue)}`;
  const minOrder = Number(v.minOrderAmount) > 0 ? ` — đơn tối thiểu ${formatMoney(v.minOrderAmount)}` : '';
  return value + minOrder;
};

export default function VoucherTab() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await voucherService.getAll();
      setVouchers(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được danh sách mã giảm giá');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await load();
      setLoading(false);
    };
    init();
  }, []);

  const openCreateModal = () => {
    setForm(emptyForm());
    setIsModalOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !(Number(form.discountValue) > 0)) {
      alert('Cần mã và giá trị giảm hợp lệ');
      return;
    }
    setSaving(true);
    try {
      await voucherService.create({
        code: form.code.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscountAmount: form.discountType === 'percent' && form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : 0,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
      });
      setIsModalOpen(false);
      await load();
    } catch (err) {
      alert(err.response?.data?.errors?.[0]?.message || err.response?.data?.message || 'Lỗi tạo mã giảm giá');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (voucher) => {
    if (!window.confirm(`Ngừng áp dụng mã "${voucher.code}"? Đơn cũ đã dùng mã này không bị ảnh hưởng.`)) return;
    try {
      await voucherService.deactivate(voucher.id);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi ngừng áp dụng mã');
    }
  };

  const handleReactivate = async (voucher) => {
    try {
      await voucherService.update(voucher.id, { isActive: true });
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi kích hoạt lại mã');
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải mã giảm giá...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
          Mã giảm giá dùng chung toàn chuỗi — áp được cho cả đơn khách tự đặt online lẫn đơn bán tại quầy (POS).
        </p>
        <button
          onClick={openCreateModal}
          className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 whitespace-nowrap"
        >
          + Thêm mã giảm giá
        </button>
      </div>

      {vouchers.length === 0 ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">
          Chưa có mã giảm giá nào.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vouchers.map((v) => (
            <div key={v.id} className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-5 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{v.code}</p>
                <Badge variant={v.isActive ? 'emerald' : 'slate'}>{v.isActive ? 'Đang áp dụng' : 'Đã ngừng'}</Badge>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{describeVoucher(v)}</p>
              <div className="space-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                {(v.startsAt || v.endsAt) && (
                  <p>
                    {v.startsAt ? new Date(v.startsAt).toLocaleDateString('vi-VN') : 'Không giới hạn'}
                    {' → '}
                    {v.endsAt ? new Date(v.endsAt).toLocaleDateString('vi-VN') : 'Không giới hạn'}
                  </p>
                )}
                {v.usageLimit != null && <p>Tối đa {v.usageLimit} lượt dùng toàn chuỗi</p>}
                {v.perCustomerLimit != null && <p>Tối đa {v.perCustomerLimit} lượt / khách</p>}
              </div>
              <button
                onClick={() => (v.isActive ? handleDeactivate(v) : handleReactivate(v))}
                className={`w-full rounded-xl py-2 text-xs font-medium transition ${
                  v.isActive
                    ? 'border border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-400'
                    : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400'
                }`}
              >
                {v.isActive ? 'Ngừng áp dụng' : 'Kích hoạt lại'}
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Thêm Mã Giảm Giá">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mã *</label>
              <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm uppercase focus:border-emerald-500 focus:outline-none"
                placeholder="VD: SALE10" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Kiểu giảm</label>
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none">
                <option value="percent">Theo % </option>
                <option value="flat">Số tiền cố định</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                {form.discountType === 'percent' ? 'Phần trăm giảm (%) *' : 'Số tiền giảm (đ) *'}
              </label>
              <input type="number" required min={0} max={form.discountType === 'percent' ? 100 : undefined}
                value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            {form.discountType === 'percent' && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Giảm tối đa (đ)</label>
                <input type="number" min={0} value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Đơn tối thiểu (đ)</label>
              <input type="number" min={0} value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Bắt đầu</label>
              <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Kết thúc</label>
              <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tổng lượt dùng tối đa</label>
              <input type="number" min={1} value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                placeholder="Không giới hạn"
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Lượt dùng / khách</label>
              <input type="number" min={1} value={form.perCustomerLimit} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })}
                placeholder="Không giới hạn"
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {saving ? 'Đang tạo...' : 'Tạo mã'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
