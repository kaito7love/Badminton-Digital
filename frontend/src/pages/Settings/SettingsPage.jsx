import React, { useState, useEffect } from 'react';
import { settingService } from '../../services/apiServices';

const DEFAULT_HOURS = { open: '06:00', close: '22:00', peak_start: '17:00', peak_end: '21:00' };
const DEFAULT_PRICING = { peakPricePerHour: 180000, offpeakPricePerHour: 120000 };

export default function SettingsPage() {
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const res = await settingService.getAll();
        const data = res.data?.data || res.data || {};
        setHours({ ...DEFAULT_HOURS, ...(data.operating_hours || {}) });
        setPricing({ ...DEFAULT_PRICING, ...(data.pricing || {}) });
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Không tải được cài đặt');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleHoursChange = (field, value) => {
    setHours((prev) => ({ ...prev, [field]: value }));
  };

  const handlePricingChange = (field, value) => {
    setPricing((prev) => ({ ...prev, [field]: Number(value) || 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        settingService.updateOperatingHours(hours),
        settingService.updatePricing(pricing),
      ]);
      alert('Đã lưu cài đặt thành công!');
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi lưu cài đặt');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-300">⏳ Đang tải cài đặt...</div>;
  if (error) return <div className="p-8 text-rose-400">❌ {error}</div>;

  const inputClass = 'w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none focus:border-emerald-500/60';
  const labelClass = 'text-sm text-slate-400';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-400 font-medium">Settings</p>
          <h1 className="text-3xl font-bold text-slate-100">Cài đặt hệ thống</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">Thiết lập giờ mở cửa và giá khung giờ cao điểm/thấp điểm.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
          <h2 className="text-xl font-bold text-slate-100">Giờ mở cửa</h2>
          <p className="mt-2 text-xs text-slate-500">Chỉ mang tính hiển thị/tham khảo — hệ thống hiện chưa dùng giờ cao điểm ở đây để tính giá checkout (giá checkout dùng khung giờ cố định trong cấu hình backend).</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className={labelClass}>Giờ mở cửa</span>
              <input type="time" className={inputClass} value={hours.open} onChange={(e) => handleHoursChange('open', e.target.value)} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Giờ đóng cửa</span>
              <input type="time" className={inputClass} value={hours.close} onChange={(e) => handleHoursChange('close', e.target.value)} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Bắt đầu giờ cao điểm</span>
              <input type="time" className={inputClass} value={hours.peak_start} onChange={(e) => handleHoursChange('peak_start', e.target.value)} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Kết thúc giờ cao điểm</span>
              <input type="time" className={inputClass} value={hours.peak_end} onChange={(e) => handleHoursChange('peak_end', e.target.value)} />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
          <h2 className="text-xl font-bold text-slate-100">Giá khung giờ mặc định</h2>
          <p className="mt-2 text-xs text-slate-500">Giá trị lưu tham khảo — hệ thống hiện tính giá theo cấu hình riêng của từng sân ở trang Quản lý sân và chưa tự động lấy giá trị này khi tạo sân mới.</p>
          <div className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className={labelClass}>Giờ cao điểm (đ/giờ)</span>
              <input
                type="number"
                min="0"
                step="1000"
                className={inputClass}
                value={pricing.peakPricePerHour}
                onChange={(e) => handlePricingChange('peakPricePerHour', e.target.value)}
              />
            </label>
            <label className="block space-y-2">
              <span className={labelClass}>Giờ thấp điểm (đ/giờ)</span>
              <input
                type="number"
                min="0"
                step="1000"
                className={inputClass}
                value={pricing.offpeakPricePerHour}
                onChange={(e) => handlePricingChange('offpeakPricePerHour', e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
