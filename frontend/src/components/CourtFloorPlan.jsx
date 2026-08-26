import React from "react";

const formatVnd = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;

// Màu nền theo loại khu vực trang trí — chỉ để phân biệt trực quan, không
// mang trạng thái nghiệp vụ nào (khác với màu sân, dựa trên court.bookable).
const ZONE_STYLES = {
  parking: "bg-amber-500/5 border-amber-400/20 text-amber-200/70",
  wait: "bg-sky-500/5 border-sky-400/20 text-sky-200/70",
  counter: "bg-amber-400/10 border-amber-300/30 text-amber-100/80",
  office: "bg-white/5 border-white/10 text-slate-400",
  show: "bg-fuchsia-500/5 border-fuchsia-400/20 text-fuchsia-200/70",
  entrance: "bg-transparent border-white/20 text-slate-500",
  back: "bg-white/5 border-white/10 text-slate-500",
  custom: "bg-indigo-500/5 border-indigo-400/20 text-indigo-200/70",
};

/**
 * Sơ đồ mặt bằng sân, chỉ xem — vị trí/kích thước lấy từ file layout tĩnh
 * theo chi nhánh (backend/public/layouts/branch-<id>.json), còn tên/giá/khả
 * dụng của từng sân join theo courtName với danh sách sân thật (`courts`,
 * từ publicService.getCourts()) để không bao giờ hiển thị sai giá hay lệch
 * trạng thái bảo trì so với hệ thống.
 */
export default function CourtFloorPlan({ layout, courts, onSelectCourt }) {
  if (!layout) return null;

  const courtByName = new Map(courts.map((c) => [c.name, c]));

  return (
    <div className="nike-card p-4 sm:p-6">
      {/* .nike-card đặt overflow:hidden trực tiếp trong CSS (kinetic.css),
          đè mất Tailwind overflow-x-auto nếu gắn chung 1 thẻ — nên phải bọc
          thêm 1 lớp div riêng để cuộn ngang hoạt động thật trên mobile. */}
      <div className="overflow-x-auto">
      <div
        className="relative mx-auto rounded-2xl border border-white/10 bg-slate-950/60"
        style={{
          width: layout.canvas.width,
          height: layout.canvas.height,
          minWidth: layout.canvas.width,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "25px 25px",
        }}
      >
        {layout.zones.map((zone, i) => (
          <div
            key={`zone-${i}`}
            className={`absolute flex items-center justify-center rounded-md border text-[10px] font-kinetic font-bold uppercase tracking-wide text-center px-1 ${ZONE_STYLES[zone.cls] || ZONE_STYLES.custom}`}
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
                bookable
                  ? "border-emerald-400/40 bg-emerald-500/10 hover:-translate-y-0.5 hover:bg-emerald-500/20 cursor-pointer"
                  : "border-amber-400/40 bg-amber-500/10 cursor-not-allowed"
              }`}
              style={{
                left: entry.x,
                top: entry.y,
                transform: entry.rotation ? `rotate(${entry.rotation}deg)` : undefined,
              }}
            >
              <span className="font-kinetic text-sm font-black text-white uppercase tracking-tight px-2 text-center">
                {court.name}
              </span>
              <span className="font-kinetic text-xs font-bold text-emerald-300">
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
