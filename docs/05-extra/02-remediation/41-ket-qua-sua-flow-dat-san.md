# Kết quả sửa — kế hoạch 41 (F1, F2, F7–F11 của báo cáo 40)

**Ngày 2026-10-16 · nhánh `fix/flow-dat-san-f1-f2-nho` · kế hoạch: [41](41-ke-hoach-sua-flow-dat-san.md) · nguồn: [báo cáo 40](40-ket-qua-kiem-thu-flow-dat-san.md)**
Duyệt theo đề xuất mặc định Q1–Q7. Chưa push, chưa merge `main`.

## 1. Đã làm gì

| Mục | Kết quả | Thay đổi chính |
|---|---|---|
| **F1** `GET /bookings?date=abc` → 500 | ✅ 400 | `listBookingsRules` trong `bookingValidation.js` gắn vào `router.get('/')`: `date` đúng `YYYY-MM-DD` và có thật, `courtId` số nguyên, `status` thuộc 4 giá trị ENUM, `sort` = `asc`\|`desc` |
| **F2** SĐT rác khi đặt hộ/mở sân | ✅ 400 | `customerPhone` (đặt sân) và `guestPhone` (mở sân) kiểm bằng `isValidPhone`; **và** kiểm lại trong `CustomerService.resolveWalkIn` nên gọi thẳng service cũng bị chặn. Để trống vẫn được; `+84 …` vẫn được và chuẩn hoá |
| **F7** `alert()` | ✅ banner | `components/InlineNotice.jsx`; trang nhân viên `/bookings`: lỗi lưu lịch hiện **trong modal** (giữ dữ liệu đang gõ), lỗi duyệt/huỷ hiện banner trang; `/my-bookings`: lỗi huỷ. Dùng `utils/serverMessage.js` nên hiện đúng lỗi từng trường ("Số điện thoại không hợp lệ.") thay vì "Validation failed" |
| **F8** thông báo sai chi nhánh | ✅ câu chữ | "Không tìm thấy sân trong chi nhánh đang chọn — hãy đổi chi nhánh rồi thử lại." / "Booking thuộc chi nhánh khác — hãy đổi chi nhánh đang chọn rồi thử lại." Mã 404/403 giữ nguyên |
| **F9** booking `completed` sau khi huỷ hoá đơn | ℹ️ giữ nguyên có chủ đích | Ghi vào `CLAUDE.md` (mục Money flows) |
| **F10** Lịch của tôi | ✅ | Backend: `sort=asc\|desc` (mặc định `asc`, trang nhân viên không đổi) — sửa luôn lỗi "khách >100 lịch chỉ thấy 100 lịch cũ nhất". Frontend: nhóm **Sắp tới** / **Lịch sử** (hàm thuần `groupMyBookings.js`), lịch sử mở 6 dòng + "Xem thêm N lịch". Postman + `docs:build` đã cập nhật (115/115 route khớp) |
| **F11** thanh tóm tắt điện thoại | ✅ | `truncate` → `line-clamp-2`; nút ↑ là thiết kế (đã chừa chỗ), giữ nguyên |

Phát hiện thêm khi sửa: `HistoryPage` cũng gọi `GET /bookings` (với `status`/`date`/`page`) — đã kiểm vẫn trả 200 sau khi siết validator.

## 2. Kiểm chứng

| Bộ kiểm | Kết quả |
|---|---|
| Backend `npm test` | 59 suite, **843 pass**; đỏ chỉ ở 2 chỗ **có từ trước, không liên quan**: `bcryptCompat.test.js` (node_modules của máy này còn bản cũ — đã ghi từ vòng bảo mật, cần `npm ci`) và `competitionGateway.test.js` (ca flaky `/public` rate-limit/SSE đã biết, chạy riêng thì xanh) |
| Test mới backend | `tests/bookingListValidation.test.js` — 29 ca (query hợp lệ/sai, SĐT đặt hộ, `guestPhone`, `resolveWalkIn`) |
| `npm run test:security` (DB tạm `bd_sectest_flow`) | **7 suite, 129/129 pass**; trong `booking-flow.security.test.js` 2 `test.failing` đã đổi thành `test` và thêm ca cho `sort=asc/desc`, 4 SĐT rác, `+84`, SĐT trống, mở sân, thông điệp admin |
| Frontend Vitest | **500/500 pass** (+7: `InlineNotice`, `groupMyBookings`); `npm run build` OK |
| Chrome headless (server mã mới `:5062`, laptop 1366×768 + điện thoại 390×844) | **10/10**, 0 lỗi console — bảng dưới |

| Mã | Kiểm | Kết quả |
|---|---|---|
| V1 | Nhân viên gõ SĐT `123` → POST 400, banner "Số điện thoại không hợp lệ." trong modal, modal mở, giữ dữ liệu, không `alert` | ✅ |
| V1b | Sửa SĐT hợp lệ → POST 201, modal đóng | ✅ |
| V2 | Duyệt lịch vừa bị huỷ → PUT 400, banner trong trang, không `alert` | ✅ |
| V3 | Trang Lịch sử vẫn tải (`GET /bookings` 200) | ✅ |
| V4 | `/my-bookings`: 2 nhóm (Sắp tới 6 · Lịch sử 20), request `limit=100&sort=desc` → 200, có "Xem thêm" | ✅ |
| V4b | "Xem thêm" mở hết (12 → 26 thẻ) | ✅ |
| V4c | Huỷ một lịch sắp tới có hộp xác nhận, nhóm Sắp tới 6 → 5 | ✅ |
| V5 / V5b | Điện thoại: dòng phụ đủ chữ, không cuộn ngang (390), Lịch của tôi không cuộn ngang | ✅ |

Ảnh: `docs/05-extra/02-remediation/41-anh/` (`v1…`, `v2…`, `v3…`, `v4…`, `v5…`).

## 3. Còn mở (không thuộc kế hoạch 41)

F3 (trần/hết hạn `pending`), F4 (mở sân từ booking sai ngày), F5 (cảnh báo trùng SĐT khi đặt hộ), F6 (trang nhân viên tự cập nhật) — chờ bạn chọn ở báo cáo 40 §4 (Q1–Q6 của báo cáo đó).
Các trang khác còn `alert()` (Customers, Courts, Employees, Accessories, Cart) — việc riêng.
Hồ sơ khách cũ đã lưu SĐT rác (vd `123` trên DB thử) không tự sửa; không có migration.

## 4. Môi trường

Server mã mới `:5062` (cùng DB `bd_sectest_flow`) chạy cạnh server cũ `:5060`; cả hai **đang được giữ** đến khi bạn bảo dọn (Q7).
