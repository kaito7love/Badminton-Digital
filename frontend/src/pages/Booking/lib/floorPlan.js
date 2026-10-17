// Sơ đồ mặt bằng ở /dat-san (kế hoạch 45).
//
// Sơ đồ là file JSON tĩnh theo chi nhánh (backend/public/layouts/branch-<id>.json) do màn "Sơ đồ sân" của quản lý
// vẽ ra; nối với sân thật bằng TÊN sân (`layout.courts[i].courtName` ↔ `court.name`). Nên mọi chỗ dùng nó phải chịu được
// file thiếu, hỏng, hoặc nhắc tới sân đã đổi tên: khi đó trang đơn giản là không hiện sơ đồ.

/** Thời gian tô sáng hàng của sân vừa chạm trên sơ đồ (máy tính). */
export const PLAN_HIGHLIGHT_MS = 2500;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Dạng tối thiểu để `CourtFloorPlan` vẽ được mà không ném lỗi. */
export function isUsableLayout(layout) {
  return Boolean(
    layout &&
      layout.canvas &&
      isNum(layout.canvas.width) &&
      isNum(layout.canvas.height) &&
      Array.isArray(layout.zones) &&
      Array.isArray(layout.courts)
  );
}

/** Các sân thật mà sơ đồ nhắc tới (bỏ tên không khớp sân nào của chi nhánh). */
export function planCourts(layout, courts) {
  if (!isUsableLayout(layout) || !Array.isArray(courts)) return [];
  const byName = new Map(courts.map((c) => [c.name, c]));
  return layout.courts.map((entry) => byName.get(entry.courtName)).filter(Boolean);
}

/** Có đáng hiện sơ đồ không: dùng được và vẽ ra ít nhất một sân thật. */
export const hasFloorPlan = (layout, courts) => planCourts(layout, courts).length > 0;

/** Câu báo (đọc được bằng trình đọc màn hình) sau khi khách chạm một sân trên sơ đồ. */
export const planPickText = (court) => `${court.name} — chạm một ô trống để chọn giờ.`;

/** Dòng "Đang xem: …" dưới ô chọn chi nhánh; null khi chưa biết chi nhánh. */
export function branchLine(branches, day, branchId) {
  const id = day?.branch?.id ?? branchId;
  const found = (branches || []).find((b) => String(b.id) === String(id));
  const name = found?.name || day?.branch?.name;
  if (!name) return null;
  return { name, address: found?.address || '' };
}
