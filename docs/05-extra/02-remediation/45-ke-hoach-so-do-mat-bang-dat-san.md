# Kế hoạch 45: sơ đồ mặt bằng và địa chỉ chi nhánh ở trang Đặt sân

- **Ngày:** 17/10/2026.
- **Trạng thái:** **đã làm xong, chờ chủ dự án duyệt merge.** Nhánh `feat/so-do-mat-bang-dat-san`, tách từ `main` (`0f0bcc0`). Chưa push.
- **Phạm vi:** chỉ phía khách, trang `/dat-san` (+ `CourtFloorPlan` dùng chung với Trang chủ nhưng Trang chủ không đổi). Không đổi API, DB, luật đặt sân.

## 1. Yêu cầu

Chủ dự án (17/10/2026), kèm ảnh chụp khối "Đang xem: Chi nhánh Quận 7 — … / Đổi chi nhánh" và sơ đồ mặt bằng ở Trang chủ: "cập nhật thêm vào trang đặt sân giúp tôi".

## 2. Ba quyết định (đã hỏi, chủ dự án chọn đều theo gợi ý)

| Câu hỏi | Chốt |
|---|---|
| Thêm gì | **Sơ đồ mặt bằng + địa chỉ chi nhánh.** Dòng "Đang xem: tên — địa chỉ" nằm dưới ô chọn chi nhánh có sẵn; **không** làm ô "Đổi chi nhánh" thứ hai (`/dat-san` đã có) |
| Chạm một sân trên sơ đồ | **Chọn sân đó ở lưới giờ**, không tự chọn giờ: máy tính cuộn tới lưới và tô sáng hàng của sân; điện thoại (lưới từng sân một) chuyển sang tab sân đó |
| Đặt ở đâu | **Dưới lưới giờ**, trước chân trang |

## 3. Đã làm

| Nơi | Thay đổi |
|---|---|
| `pages/Booking/lib/floorPlan.js` (mới, thuần) | `isUsableLayout`, `planCourts` (nối sơ đồ với sân thật theo tên), `hasFloorPlan`, `planPickText`, `branchLine`, `PLAN_HIGHLIGHT_MS` |
| `pages/Booking/useBranchLayout.js` (mới) | tải `branch-<id>.json` của chi nhánh **đang hiện trong lưới**; trả `null` khi chưa về / không có file / lỗi mạng — sơ đồ chỉ là phần "xem thêm", không bao giờ làm hỏng trang |
| `components/CourtFloorPlan.jsx` | thêm `tone`: `"dark"` (mặc định — Trang chủ, **giữ nguyên bộ lớp cũ**) và `"auto"` (cặp sáng / tối, thẻ tĩnh) cho `/dat-san` |
| `BookingPage.jsx` | dòng "Đang xem"; mục "Sơ đồ mặt bằng" dưới lưới; `pickFromPlan` + hiệu ứng cuộn / tiêu điểm; lưới có `scroll-mt` chừa header cố định |
| `CourtGrid.jsx` | `highlightCourtId` (vòng sáng 2,5 giây), ô tên sân nhận tiêu điểm lập trình (`data-court-title`, `tabIndex=-1`) |
| `PhoneGrid.jsx` | `data-court-tab` cho mỗi tab sân |

Chi tiết hành vi:
- Sơ đồ chỉ hiện khi lưới đang hiện (trạng thái "còn chỗ" hoặc "kín"), có file sơ đồ dùng được và vẽ ra ít nhất một sân khớp tên. Thiếu, hỏng, lệch tên → không hiện gì.
- Chạm sân trên sơ đồ: có thông báo `role="status"` "Sân … — chạm một ô trống để chọn giờ."; tiêu điểm chuyển tới tên sân (máy tính) hoặc tab sân (điện thoại, tab được đưa ra giữa dải cuộn ngang). Máy tính: lựa chọn giờ đang có **được giữ**; điện thoại: đổi tab thì bỏ lựa chọn như mọi lần đổi tab.
- Sân đang bảo trì trên sơ đồ bị khoá như ở Trang chủ.
- Điện thoại: sơ đồ là một khung cuộn ngang (canvas 800–1000 px, chữ giữ cỡ đọc được), kèm câu "Vuốt ngang để xem hết sơ đồ."

## 4. Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| Vitest | 547/547 (43 file): `floorPlan.test.js` (kể cả đọc **file sơ đồ thật** của backend để bắt file bị sửa sai dạng), `CourtFloorPlan.test.jsx`, 3 ca ở `booking-ui.test.jsx`; ca cũ "không có `text-white` trần" vẫn đạt |
| `vite build` | sạch |
| Chrome thật, 29 ca | **máy tính:** dòng "Đang xem" đúng tên + địa chỉ từ `/public/branches`, chỉ một ô chọn chi nhánh; sơ đồ nằm sau lưới trước chân trang, 3 sân, sân bảo trì bị khoá; chạm Sân số 2 từ chỗ cuộn xa → lưới lên sát dưới header, hàng sân 2 có vòng sáng, tiêu điểm ở tên sân, có thông báo, **không** tự chọn giờ, vòng sáng tắt sau ~2,5 s; chạm sân bảo trì không làm gì; đã chọn giờ rồi chạm sơ đồ → lựa chọn giữ nguyên; 0 `POST /bookings`; giao diện sáng (chữ tối, nền sáng) và tối (chữ trắng, nền tối); đổi chi nhánh → sơ đồ và địa chỉ đổi theo; file sơ đồ lỗi hoặc lệch tên → không hiện mục sơ đồ, lưới vẫn dùng được. **điện thoại 390 và 768 px:** không tràn ngang, chạm Sân số 2 → tab sân 2 được chọn, lưới giờ của sân 2, trang cuộn tới lưới, tiêu điểm ở tab; sân VIP (tab nằm cuối dải cuộn) được đưa vào vùng nhìn thấy; sân bảo trì không đổi tab. Đăng nhập khách và quản trị: sơ đồ hiện và chạm vẫn tô sáng. **Trang chủ** (kể cả khi app đặt giao diện sáng): sơ đồ vẫn là bản tối như cũ, chạm sân vẫn tới `/dat-san`. Không lỗi JS |
| Hồi quy lưới giờ (9 ca) | chạm ô → thanh tóm tắt; ĐẶT SÂN mở hộp xác nhận đủ chi nhánh / sân / giờ; Esc đóng; 0 POST — ở 1440 và 390 px |

## 5. Điều cần biết

- Chi nhánh chưa có địa chỉ trong dữ liệu (ví dụ "Chi nhánh chính" ở DB dev) thì dòng "Đang xem" chỉ có tên.
- Trên điện thoại phải vuốt ngang sơ đồ để thấy hết các sân rồi mới chạm được (đã có lời nhắc); thu nhỏ vừa màn hình thì chữ trong ô sân chỉ còn ~6 px nên không làm.
- `CourtFloorPlan` không còn là file chỉ dành cho Trang chủ: sửa nó phải đo cả hai nơi (Trang chủ luôn tối; `/dat-san` theo giao diện).
- Chưa làm (chưa được duyệt): cập nhật `CLAUDE.md` và `00-tien-do.md`.
- Khi push: chỉ frontend, không migration, không đổi API.
