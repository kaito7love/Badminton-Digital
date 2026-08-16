# Plan: `fix/branch-timezone` (ĐÃ CODE + TEST XONG — chờ duyệt merge)

**Trạng thái:** đã code + test thật xong trên nhánh `fix/branch-timezone`,
chưa merge vào `main`. Xem tổng kết ở `00-tien-do.md`.

## Vấn đề

`backend/src/utils/dateTime.js` tính "hôm nay"/"giờ hiện tại" bằng
`new Date()` của **máy chạy server** (`getFullYear()`, `getHours()`...) —
comment ngay đầu file thừa nhận điều này ("Các hàm dưới đây luôn tính theo
giờ của máy chạy server"). Model `Branch` đã có sẵn cột `timezone`
(`backend/src/models/Branch.js:15`, `STRING(64)`, ví dụ `Asia/Ho_Chi_Minh`)
nhưng **không nơi nào trong code đọc giá trị này** — mọi chi nhánh, dù khai
báo timezone gì trong DB, đều bị tính theo múi giờ của server backend.

Chưa gây lỗi vì hiện tại có lẽ chỉ vận hành 1 múi giờ (Việt Nam) và server
cũng chạy giờ Việt Nam — nhưng đây là bẫy chờ sẵn: nếu deploy server ở vùng
khác (ví dụ US datacenter, giờ UTC), hoặc mở chi nhánh ở múi giờ khác, các
tính toán "hôm nay"/"còn trống trong ngày" sẽ sai lệch hàng giờ mà không có
lỗi rõ ràng nào báo ra — chỉ là dữ liệu âm thầm sai.

## Phạm vi ảnh hưởng (2 điểm gọi, xác nhận bằng grep)

- `CourtService.js:448-451` — dùng `localDateString`/`localTimeString` để
  lọc booking "còn hiệu lực trong ngày" khi kiểm tra sân trống.
- `ReportService.js:26-27` — dùng `startOfLocalDay`/`endOfLocalDay` để lọc
  báo cáo "hôm nay".

## Thiết kế

1. Đổi chữ ký các hàm trong `dateTime.js` để nhận thêm tham số `timezone`
   (mặc định `'Asia/Ho_Chi_Minh'` nếu không truyền — tránh phá vỡ chỗ gọi
   cũ chưa kịp cập nhật trong lúc chuyển đổi):
   ```js
   const localDateString = (date = new Date(), timezone = 'Asia/Ho_Chi_Minh') => ...
   ```
   Dùng `Intl.DateTimeFormat` với `timeZone` để lấy đúng năm/tháng/ngày/giờ
   theo múi giờ chỉ định, thay cho `date.getFullYear()`/`getHours()` (vốn
   luôn đọc theo múi giờ hệ điều hành của server) — cách làm không cần thêm
   thư viện ngoài (`Intl` có sẵn trong Node).
2. `CourtService.js` và `ReportService.js` — lấy `branch.timezone` từ
   `branchId` đang xử lý (đã có `branchId` sẵn trong context của cả 2 chỗ
   gọi), truyền vào các hàm trên thay vì gọi không tham số.
3. Cân nhắc thêm 1 hàm `getBranchTimezone(branchId)` dùng chung (cache đơn
   giản trong request hoặc query thẳng `Branch.findByPk` — quyết định cụ thể
   lúc code, tránh query DB thừa nếu branch đã được load sẵn ở nơi gọi).

## Việc KHÔNG làm

- Không đổi cột `timezone` trên `Branch` (đã đúng kiểu, đã có sẵn).
- Không đụng tới cách frontend hiển thị giờ (ngoài phạm vi — đây là sửa tính
  toán ở backend, không phải hiển thị).
- Không migrate dữ liệu — đây là sửa logic tính toán tại thời điểm truy vấn,
  không phải sửa dữ liệu đã lưu.

## Kiểm thử

- `npm test` — xác nhận không gãy test hiện có.
- Test thật: tạo/sửa 1 branch với `timezone` khác `Asia/Ho_Chi_Minh` (ví dụ
  `UTC`) trong DB dev, gọi API kiểm tra sân trống + báo cáo "hôm nay" cho
  branch đó gần thời điểm nửa đêm giờ Việt Nam (00:00-07:00) — xác nhận kết
  quả tính theo timezone của branch, không phải giờ server.
- Test hồi quy: branch mặc định (`Asia/Ho_Chi_Minh`) — xác nhận kết quả
  không đổi so với trước khi sửa (không phá hành vi hiện tại cho trường hợp
  phổ biến nhất).
