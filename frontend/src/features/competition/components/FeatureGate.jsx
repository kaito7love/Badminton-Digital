import React from 'react';
import { useCompetition } from '../context/CompetitionContext';
import CustomerShell from './CustomerShell';
import { EmptyState, Spinner } from './ui';

// Cổng ở cấp route: tính năng thi đấu TẮT (chưa cấu hình service) thì KHÔNG dựng trang — nên không có lời gọi API nào tới cổng nối, chỉ có
// thông báo "chưa được bật". Trang của khách vẽ trong khung khách; trang của nhân viên vẽ ngay trong vỏ sidebar đang có.
export default function FeatureGate({ children, customer = false, title = 'Thi đấu' }) {
  const { enabled, loading } = useCompetition();
  if (loading) return customer ? <CustomerShell title={title} /> : <div className="p-8"><Spinner label="Đang kiểm tra tính năng thi đấu…" /></div>;
  if (enabled) return children;
  if (customer) return <CustomerShell title={title} />;
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <EmptyState title="Tính năng thi đấu chưa được bật">Hệ thống chưa cấu hình dịch vụ thi đấu (liên hệ quản trị viên). Các phần khác của app không bị ảnh hưởng.</EmptyState>
    </div>
  );
}
