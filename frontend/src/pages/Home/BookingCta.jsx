import React from "react";
import { Link } from "react-router-dom";

const formatVnd = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;

/**
 * Giá một giờ thấp nhất trong các sân đang nhận đặt (giờ thường), hoặc null khi
 * chưa có sân nào. Sân đang bảo trì không tính: ô này chào bán, không nên hứa
 * một mức giá mà khách không đặt được.
 */
export function lowestOffpeakPrice(courts) {
  const prices = (courts || [])
    .filter((c) => c.bookable)
    .map((c) => Number(c.offpeakPricePerHour))
    .filter((p) => Number.isFinite(p));
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Thẻ "FAST BOOKING" ở hero Trang chủ (kế hoạch 30). Trang chủ không còn tự đặt
 * sân: mọi lối đặt đều dẫn tới `/dat-san`, nơi có lưới sân × giờ thật — thẻ này
 * chỉ giới thiệu và dẫn đi, nên không giữ trạng thái ngày/giờ/sân nào.
 */
export default function BookingCta({ operatingHours, fromPrice, error }) {
  return (
    <div className="nike-card p-8 border-emerald-500/40">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h3 className="font-kinetic text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm">
            ⚡
          </span>
          FAST BOOKING
        </h3>
        <span className="font-kinetic text-[10px] font-black text-slate-950 bg-emerald-400 px-3 py-1 rounded-full uppercase tracking-widest">
          LIVE INSTANT
        </span>
      </div>

      <p className="text-slate-300 font-medium leading-relaxed">
        Xem lưới sân theo giờ của cả ngày, chọn khung còn trống rồi xác nhận ngay trên trang Đặt sân.
      </p>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/90 px-5 py-4 font-kinetic text-sm">
        <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">GIÁ SÂN</span>
        <strong className="text-emerald-400 font-black">
          {fromPrice != null ? `từ ${formatVnd(fromPrice)}/giờ` : "—"}
        </strong>
      </div>

      {error && <p className="mt-3 text-xs font-bold text-rose-400">{error}</p>}

      <p className="mt-5 text-center font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-500">
        Nhận đặt sân {operatingHours.open}–{operatingHours.close} hằng ngày
      </p>

      <Link to="/dat-san" className="w-full btn-nike-bolt justify-center py-4 text-sm mt-4">
        ĐẶT SÂN ⚡
      </Link>
    </div>
  );
}
