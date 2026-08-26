import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { roleOf } from '../../utils/roles';
import ProductsTab from './ProductsTab';
import GoodsReceiptTab from './GoodsReceiptTab';
import StockMovementsTab from './StockMovementsTab';
import SuppliersTab from './SuppliersTab';

const TABS = [
  { key: 'products', label: 'Sản phẩm' },
  { key: 'receipt', label: 'Nhập kho' },
  { key: 'movements', label: 'Lịch sử kho' },
  { key: 'suppliers', label: 'Nhà cung cấp', adminOnly: true },
];

export default function AccessoriesPage() {
  const { user } = useAuth();
  const isAdmin = roleOf(user) === 'admin';
  const [activeTab, setActiveTab] = useState('products');
  const branchName = user?.employee?.branch?.name;

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">Accessories</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Dịch Vụ & Kho</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Quản lý sản phẩm, nhập kho có phiếu, lịch sử tồn kho theo từng chi nhánh và nhà cung cấp.</p>
        </div>
        {branchName && (
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 whitespace-nowrap">
            🏬 Kho của: {branchName}
          </span>
        )}
      </div>

      <div className="hide-scrollbar flex gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
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

      {activeTab === 'products' && <ProductsTab onGoToReceiving={() => setActiveTab('receipt')} />}
      {activeTab === 'receipt' && <GoodsReceiptTab />}
      {activeTab === 'movements' && <StockMovementsTab />}
      {activeTab === 'suppliers' && isAdmin && <SuppliersTab />}
    </div>
  );
}
