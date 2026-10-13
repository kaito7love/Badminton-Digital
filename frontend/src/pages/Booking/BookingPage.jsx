import React from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { useAuth } from '../../contexts/AuthContext';
import { roleOf } from '../../utils/roles';

/**
 * Trang Đặt sân (/dat-san) — mới chỉ có khung cơ bản, công khai (khách chưa đăng nhập vẫn vào xem được).
 * Chỗ để làm trang đặt sân đầy đủ sau; hiện dẫn sang ô đặt nhanh ở Trang chủ và (với khách hàng) trang Lịch đặt.
 */
export default function BookingPage() {
  const { user } = useAuth();
  const isCustomer = roleOf(user) === 'customer';

  return (
    <CustomerLayout
      eyebrow="Đặt sân"
      title="Đặt sân"
      subtitle="Chọn sân, ngày và khung giờ bạn muốn chơi."
    >
      <section className="nike-card-static p-7">
        <h2 className="font-kinetic text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
          Trang đặt sân đang được hoàn thiện
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          Hiện bạn có thể đặt nhanh ngay ở Trang chủ: chọn sân, ngày, giờ rồi xác nhận.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/#booking-widget" className="btn-nike-bolt text-xs">Đặt nhanh ở Trang chủ</Link>
          {isCustomer && <Link to="/my-bookings" className="btn-nike-dark text-xs">Lịch đặt của tôi</Link>}
        </div>
      </section>
    </CustomerLayout>
  );
}
