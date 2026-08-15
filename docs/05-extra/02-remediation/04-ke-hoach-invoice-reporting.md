# Plan: báo cáo doanh thu chi tiết + tổng kết nhập-tồn kho dùng `invoice_lines` (CHƯA LÊN PLAN CHI TIẾT)

**Trạng thái:** khác 3 file plan còn lại trong thư mục này — đây **chưa
phải plan để duyệt "code đi"**, mà là ghi lại lý do vì sao việc này chưa lên
plan và cần thảo luận thêm gì trước khi lên plan thật. Lý do lẽ ra là mục
tiêu cuối của `feat/invoice-line-items`, nhưng khi chốt phạm vi nhánh đó,
chủ dự án đã chọn "chỉ xây nền tảng itemized invoice trước" và để báo cáo
lại cho nhánh riêng sau — xem `00-tien-do.md` mục 5.

## Vì sao chưa lên plan chi tiết được

Chưa đủ thông tin để thiết kế cụ thể — cần chủ dự án trả lời trước:

1. **Báo cáo doanh thu chi tiết cụ thể là gì?** `ReportService.js` hiện đã
   có `getRevenueReport` (theo ngày/tuần/tháng), `getTopCourts`,
   `getTopAccessories` — nhưng tất cả tính trực tiếp từ `Invoice`
   (cột tổng hợp) và `SessionExtra`, không phải từ `invoice_lines`. Câu hỏi
   cần trả lời: báo cáo mới cần thêm **loại phân tích nào mà 3 báo cáo hiện
   có chưa trả lời được**? (Ví dụ: doanh thu theo từng `line_kind`, doanh
   thu sau khi trừ discount theo từng dòng thay vì gộp, so sánh giữa các chi
   nhánh theo cơ cấu tiền sân/phụ kiện...) Nếu câu trả lời trùng với báo cáo
   hiện có, có thể không cần báo cáo mới, chỉ cần đổi nguồn dữ liệu bên
   trong.

2. **"Tổng kết nhập-tồn kho" nghĩa là đối chiếu gì với gì?** Dự án đã có hệ
   thống kho riêng (`ExtraStock`, `StockMovement`, `GoodsReceipt`,
   `GoodsReceiptItem` — nhập kho, tồn kho theo chi nhánh) độc lập với
   `invoice_lines`. Cần chủ dự án xác nhận: báo cáo này đối chiếu **số lượng
   đã bán ra** (tính từ `invoice_lines` có `line_kind = 'product'`) với
   **số lượng đã nhập** (`GoodsReceiptItem`) và **tồn hiện tại**
   (`ExtraStock`) để phát hiện thất thoát/lệch kho? Hay là một khái niệm
   khác? Đây là quyết định thiết kế, không nên tự suy đoán.

3. **Chỉ tính hoá đơn từ sau `feat/invoice-line-items` hay cần dữ liệu đầy
   đủ từ trước?** Vì đã chốt không backfill, mọi báo cáo dựa trên
   `invoice_lines` sẽ **thiếu dữ liệu cho mọi hoá đơn tạo trước ngày merge
   nhánh đó** (2026-08-16 trở về trước). Cần quyết định: báo cáo mới chỉ
   chạy được từ một mốc thời gian nhất định (chấp nhận khoảng trống dữ liệu
   lịch sử), hay cần một đợt backfill riêng sau này nếu báo cáo trở nên cần
   thiết cho dữ liệu cũ.

4. **Có cần UI xem/lọc báo cáo mới ở frontend ngay, hay chỉ cần export
   Excel/PDF như các báo cáo hiện có** (`reportExporter.js` đã có sẵn cơ chế
   xuất, kể cả đã vá lỗi formula injection ở `fix/security-critical`)?

## Việc đã có sẵn, có thể tái dùng khi lên plan thật

- `invoice_lines` đã có dữ liệu itemized cho mọi hoá đơn từ
  `feat/invoice-line-items` trở đi (`lineKind`, `quantity`, `unitPrice`,
  `amount`, `referenceType`/`referenceId` trỏ tới `court_session` hoặc
  `session_extra`).
- `ReportService.js` đã có khung báo cáo theo kỳ (`period`, `from`/`to`,
  lọc theo `branchId`) — báo cáo mới nên theo cùng khuôn mẫu này để nhất
  quán với các báo cáo hiện có, thay vì tạo kiểu API khác.
- `reportExporter.js` đã có cơ chế xuất Excel/PDF an toàn (đã chống formula
  injection) — tái dùng được ngay khi có báo cáo mới.
- Hệ thống kho (`ExtraStock`/`StockMovement`/`GoodsReceipt`/`GoodsReceiptItem`)
  đã có sẵn từ trước, chạy độc lập — cần đọc kỹ các model này khi lên plan
  thật để biết chính xác dữ liệu nhập/tồn đang có những gì.

## Bước tiếp theo

Khi chủ dự án sẵn sàng, cần hỏi lại 4 câu ở trên (có thể qua
`AskUserQuestion` như đã làm khi lên plan `feat/invoice-line-items`), rồi
mới viết plan chi tiết theo đúng khuôn mẫu 3 file plan còn lại trong thư mục
này (bối cảnh → thiết kế cụ thể → việc không làm → kiểm thử) để duyệt trước
khi code.
