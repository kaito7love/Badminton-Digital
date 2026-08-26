import React, { useState } from 'react';
import OverviewTab from './OverviewTab';
import RevenueBreakdownTab from './RevenueBreakdownTab';
import InventoryReconciliationTab from './InventoryReconciliationTab';

const TABS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'revenue', label: 'Doanh thu chi tiết' },
  { key: 'inventory', label: 'Đối chiếu kho' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">Reports &amp; Analytics</p>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Báo cáo &amp; Thống kê doanh thu</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Phân tích doanh thu sân, phụ kiện, bán lẻ và đối chiếu kho, kèm xuất dữ liệu Excel/PDF.</p>
      </div>

      <div className="hide-scrollbar flex gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === tab.key
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'revenue' && <RevenueBreakdownTab />}
      {activeTab === 'inventory' && <InventoryReconciliationTab />}
    </div>
  );
}
