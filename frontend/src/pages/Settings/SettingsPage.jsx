import React, { useState, useEffect } from 'react';
import { settingService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetchSettings = async () => {
    try {
      const res = await settingService.getAll();
      const data = res.data?.data || res.data || {};
      setSettings(data);
    } catch (err) {
      setError(err.message || 'Không tải được cài đặt');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchSettings();
      setLoading(false);
    };
    init();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.pricing) await settingService.updatePricing(settings.pricing);
      if (settings.operating_hours) await settingService.updateOperatingHours(settings.operating_hours);
      if (settings.branding) await settingService.updateBranding(settings.branding);
      alert('Đã lưu cài đặt thành công!');
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi lưu cài đặt');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải cài đặt...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>;

  // Extract settings with fallbacks
  const hours = settings?.operating_hours || [
    { day: 'Monday - Friday', open: '06:00', close: '22:00' },
    { day: 'Saturday - Sunday', open: '07:00', close: '23:00' }
  ];
  const pricing = settings?.pricing || {};
  const peakPrice = pricing.peakPricePerHour || 180000;
  const offpeakPrice = pricing.offpeakPricePerHour || 120000;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">Settings</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Cài đặt hệ thống</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Thiết lập giờ mở cửa và giá khung giờ cao điểm/thấp điểm.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 whitespace-nowrap rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Giờ mở cửa</h2>
          <div className="mt-6 space-y-4">
            {(Array.isArray(hours) ? hours : []).map((item, idx) => (
              <div key={idx} className="rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/80 p-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">{item.day}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{item.open} - {item.close}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Giá khung giờ</h2>
          <div className="mt-6 space-y-4 text-slate-600 dark:text-slate-300">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/80 p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">Giờ cao điểm</p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatMoney(peakPrice)} / giờ</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/80 p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">Giờ thấp điểm</p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatMoney(offpeakPrice)} / giờ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
