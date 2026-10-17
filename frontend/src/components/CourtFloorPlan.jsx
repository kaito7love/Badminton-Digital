import React from "react";

const formatVnd = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;

// Hai bảng lớp, viết nguyên chuỗi để Tailwind sinh được CSS:
//  - "dark": luôn là bản tối, dùng ở Trang chủ (trang chỉ có bản tối, không đọc ThemeContext nên `html.dark` có thể không có);
//  - "auto": theo giao diện sáng / tối của app (mỗi lớp có cặp `dark:`), dùng ở trang Đặt sân.
// Màu nền theo loại khu vực trang trí chỉ để phân biệt trực quan, không mang trạng thái nghiệp vụ
// nào (khác với màu sân, dựa trên court.bookable).
const TONES = {
  dark: {
    wrap: "nike-card p-4 sm:p-6",
    canvas: "border-white/10 bg-slate-950/60",
    gridLine: "rgba(255,255,255,0.03)",
    zones: {
      parking: "bg-amber-500/5 border-amber-400/20 text-amber-200/70",
      wait: "bg-sky-500/5 border-sky-400/20 text-sky-200/70",
      counter: "bg-amber-400/10 border-amber-300/30 text-amber-100/80",
      office: "bg-white/5 border-white/10 text-slate-400",
      show: "bg-fuchsia-500/5 border-fuchsia-400/20 text-fuchsia-200/70",
      entrance: "bg-transparent border-white/20 text-slate-500",
      back: "bg-white/5 border-white/10 text-slate-500",
      custom: "bg-indigo-500/5 border-indigo-400/20 text-indigo-200/70",
    },
    courtOn: "border-emerald-400/40 bg-emerald-500/10 hover:-translate-y-0.5 hover:bg-emerald-500/20 cursor-pointer",
    courtOff: "border-amber-400/40 bg-amber-500/10 cursor-not-allowed",
    name: "text-white",
    price: "text-emerald-300",
  },
  auto: {
    wrap: "nike-card-static p-4 sm:p-6",
    canvas: "border-slate-200 bg-slate-100/80 dark:border-white/10 dark:bg-slate-950/60",
    gridLine: "rgba(100,116,139,0.12)",
    zones: {
      parking: "bg-amber-500/10 border-amber-600/30 text-amber-800 dark:bg-amber-500/5 dark:border-amber-400/20 dark:text-amber-200/70",
      wait: "bg-sky-500/10 border-sky-600/30 text-sky-800 dark:bg-sky-500/5 dark:border-sky-400/20 dark:text-sky-200/70",
      counter: "bg-amber-400/15 border-amber-600/40 text-amber-900 dark:bg-amber-400/10 dark:border-amber-300/30 dark:text-amber-100/80",
      office: "bg-slate-500/10 border-slate-400/50 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-400",
      show: "bg-fuchsia-500/10 border-fuchsia-600/30 text-fuchsia-800 dark:bg-fuchsia-500/5 dark:border-fuchsia-400/20 dark:text-fuchsia-200/70",
      entrance: "bg-transparent border-slate-400/60 text-slate-600 dark:border-white/20 dark:text-slate-500",
      back: "bg-slate-500/10 border-slate-400/50 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-500",
      custom: "bg-indigo-500/10 border-indigo-600/30 text-indigo-800 dark:bg-indigo-500/5 dark:border-indigo-400/20 dark:text-indigo-200/70",
    },
    courtOn: "border-emerald-600/50 bg-emerald-500/10 hover:-translate-y-0.5 hover:bg-emerald-500/20 cursor-pointer dark:border-emerald-400/40",
    courtOff: "border-amber-600/50 bg-amber-500/10 cursor-not-allowed dark:border-amber-400/40",
    name: "text-slate-900 dark:text-white",
    price: "text-emerald-700 dark:text-emerald-300",
  },
};

/**
 * Sơ đồ mặt bằng sân, chỉ xem — vị trí/kích thước lấy từ file layout tĩnh
 * theo chi nhánh (backend/public/layouts/branch-<id>.json), còn tên/giá/khả
 * dụng của từng sân join theo courtName với danh sách sân thật (`courts`,
 * từ publicService.getCourts() hoặc lưới ngày của /dat-san) để không bao giờ
 * hiển thị sai giá hay lệch trạng thái bảo trì so với hệ thống.
 *
 * `tone`: xem TONES ở trên. `onSelectCourt(court)` gọi khi chạm một sân đang nhận đặt.
 */
export default function CourtFloorPlan({ layout, courts, onSelectCourt, tone = "dark" }) {
  if (!layout) return null;

  const t = TONES[tone] || TONES.dark;
  const courtByName = new Map(courts.map((c) => [c.name, c]));

  return (
    <div className={t.wrap}>
      {/* .nike-card đặt overflow:hidden trực tiếp trong CSS (kinetic.css),
          đè mất Tailwind overflow-x-auto nếu gắn chung 1 thẻ — nên phải bọc
          thêm 1 lớp div riêng để cuộn ngang hoạt động thật trên mobile. */}
      <div className="overflow-x-auto">
      <div
        className={`relative mx-auto rounded-2xl border ${t.canvas}`}
        style={{
          width: layout.canvas.width,
          height: layout.canvas.height,
          minWidth: layout.canvas.width,
          backgroundImage:
            `linear-gradient(${t.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${t.gridLine} 1px, transparent 1px)`,
          backgroundSize: "25px 25px",
        }}
      >
        {layout.zones.map((zone, i) => (
          <div
            key={`zone-${i}`}
            className={`absolute flex items-center justify-center rounded-md border text-[10px] font-kinetic font-bold uppercase tracking-wide text-center px-1 ${t.zones[zone.cls] || t.zones.custom}`}
            style={{
              left: zone.x,
              top: zone.y,
              width: zone.w,
              height: zone.h,
              transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
            }}
          >
            {zone.label}
          </div>
        ))}

        {layout.courts.map((entry, i) => {
          const court = courtByName.get(entry.courtName);
          if (!court) return null;
          const bookable = court.bookable;
          return (
            <button
              key={`court-${i}`}
              type="button"
              disabled={!bookable}
              onClick={() => bookable && onSelectCourt?.(court)}
              className={`absolute w-[180px] h-[105px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-transform ${
                bookable ? t.courtOn : t.courtOff
              }`}
              style={{
                left: entry.x,
                top: entry.y,
                transform: entry.rotation ? `rotate(${entry.rotation}deg)` : undefined,
              }}
            >
              <span className={`font-kinetic text-sm font-black uppercase tracking-tight px-2 text-center ${t.name}`}>
                {court.name}
              </span>
              <span className={`font-kinetic text-xs font-bold ${t.price}`}>
                {formatVnd(court.offpeakPricePerHour)}/giờ
              </span>
              <span
                className={`absolute top-2 right-2 text-[9px] font-kinetic font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  bookable ? "bg-emerald-400 text-slate-950" : "bg-amber-400 text-slate-950"
                }`}
              >
                {bookable ? "Sẵn sàng" : "Bảo trì"}
              </span>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
