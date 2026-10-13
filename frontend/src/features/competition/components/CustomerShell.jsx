import React from 'react';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCompetition } from '../context/CompetitionContext';
import { EmptyState, Spinner } from './ui';

// Khung các trang thi đấu của khách (07 mục 1.1): vỏ CustomerLayout, theo giao diện sáng / tối của app như phần cửa hàng. Trước đây có thêm một
// khung `dark` ép các thành phần dùng chung (Card, form, RatingCards…) luôn vẽ tối; các trang đã có cặp sáng/tối nên bỏ. Tính năng thi đấu
// tắt → báo rõ, không trang trắng.

export default function CustomerShell({ title, subtitle, eyebrow = 'Thi đấu', action, children }) {
  const { enabled, loading } = useCompetition();
  return (
    <CustomerLayout eyebrow={eyebrow} title={title} subtitle={subtitle} action={action}>
      <div className="text-slate-700 dark:text-slate-200">
        {loading && <Spinner label="Đang kiểm tra tính năng thi đấu…" />}
        {!loading && !enabled && <EmptyState title="Tính năng thi đấu chưa được bật">Hệ thống chưa cấu hình dịch vụ thi đấu. Các phần khác của app vẫn dùng bình thường.</EmptyState>}
        {!loading && enabled && children}
      </div>
    </CustomerLayout>
  );
}
