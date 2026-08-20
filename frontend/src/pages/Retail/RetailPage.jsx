import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { roleOf } from '../../utils/roles';
import CatalogTab from './CatalogTab';
import RetailStockTab from './RetailStockTab';
import PosTab from './PosTab';
import VoucherTab from './VoucherTab';

const TABS = [
  { key: 'pos', label: 'Bán hàng' },
  { key: 'stock', label: 'Kho bán lẻ' },
  { key: 'catalog', label: 'Danh mục sản phẩm', adminOnly: true },
  { key: 'vouchers', label: 'Mã giảm giá', adminOnly: true },
];

export default function RetailPage() {
  const { user } = useAuth();
  const role = roleOf(user);
  const canManageCatalog = role === 'admin' || role === 'branch_manager';
  const [activeTab, setActiveTab] = useState('pos');
  const branchName = user?.employee?.branch?.name;

  const visibleTabs = TABS.filter((t) => !t.adminOnly || canManageCatalog);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">Retail</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Bán Lẻ Dụng Cụ</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Vợt, áo, quần, phụ kiện — bán tại quầy độc lập với luồng thuê sân. Tồn kho theo từng chi nhánh, danh mục dùng chung toàn chuỗi.
          </p>
        </div>
        {branchName && (
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 whitespace-nowrap">
            🏬 Bán tại: {branchName}
          </span>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {visibleTabs.map((tab) => (
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

      {activeTab === 'pos' && <PosTab />}
      {activeTab === 'stock' && <RetailStockTab />}
      {activeTab === 'catalog' && canManageCatalog && <CatalogTab />}
      {activeTab === 'vouchers' && canManageCatalog && <VoucherTab />}
    </div>
  );
}
