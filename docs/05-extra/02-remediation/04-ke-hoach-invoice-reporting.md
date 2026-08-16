# Plan: báo cáo doanh thu chi tiết + tổng kết nhập-tồn kho

**Trạng thái (2026-08-16):** đã duyệt "code đi", đã code + test thật xong
trên nhánh `feat/invoice-reporting`. Xem `00-tien-do.md` để biết bằng chứng
test và trạng thái merge.

## Bối cảnh

Mục đích lẽ ra là đích cuối của `feat/invoice-line-items` (đã merge tại
`2aed2bf`), nhưng lúc đó chủ dự án chọn "chỉ xây nền tảng itemized invoice
trước" và để báo cáo lại cho nhánh riêng — xem `00-tien-do.md` mục 5.

Từ khi lên khung câu hỏi ban đầu tới nay, `feat/retail-catalog-inventory`
(mục 6) đã merge — `invoice_lines` giờ có dòng từ **2 nguồn khác nhau**:
phụ kiện dùng trong sân (`referenceType: 'session_extra'`) và bán lẻ tại
quầy (`referenceType: 'sales_order_line'`), cùng nằm chung `line_kind:
'product'`. Thiết kế báo cáo dưới đây tính đến điều này.

## 4 câu hỏi đã chốt với chủ dự án

1. **Báo cáo doanh thu cần trả lời gì mà 3 báo cáo hiện có chưa trả lời
   được?** → cả 3: (a) tách doanh thu sân / phụ kiện trong sân / bán lẻ
   quầy, (b) so sánh cơ cấu doanh thu giữa các chi nhánh, (c) doanh thu sau
   giảm giá theo từng dòng, không gộp vào tổng chung.
2. **"Tổng kết nhập-tồn kho" nghĩa là gì?** → đối chiếu số lượng bán ra với
   số lượng nhập và tồn hiện tại để phát hiện thất thoát.
3. **Xử lý khoảng trống dữ liệu lịch sử (không backfill) thế nào?** → chấp
   nhận báo cáo doanh thu chỉ chạy được từ mốc `2026-08-16` (ngày merge
   `feat/invoice-line-items`) trở đi.
4. **Cần UI ngay hay chỉ export?** → cần giao diện xem/lọc ở frontend ngay.

## Thiết kế cụ thể

### 1. Báo cáo doanh thu chi tiết

Endpoint mới `GET /reports/revenue-breakdown` — **không sửa** `/reports/revenue`
hiện có (tránh phá dashboard/export đang dùng nó).

- Query: `period`/`from`/`to` theo đúng khuôn mẫu `ReportService` hiện có,
  `branchId` theo context, `compareBranches=true` (chỉ admin — group theo
  từng chi nhánh khi xem toàn chuỗi thay vì gộp chung).
- Nguồn dữ liệu: `invoice_lines`, có giới hạn từ `2026-08-16` — response trả
  kèm field `dataFrom` để frontend hiển thị rõ giới hạn, không âm thầm thiếu
  số liệu mà không nói.
- Phân loại theo `line_kind` + `reference_type`:
  - `court_time` → "Tiền sân"
  - `product` + `reference_type = 'session_extra'` → "Phụ kiện trong sân"
  - `product` + `reference_type = 'sales_order_line'` → "Bán lẻ tại quầy"
  - `discount` → liệt kê riêng, không gộp vào 3 nhóm trên
- Output: doanh thu theo kỳ (bucket theo `period`) × nhóm nguồn, kèm
  breakdown theo `branchId` nếu `compareBranches`.
- Danh sách chi tiết dòng giảm giá: mỗi dòng kèm `invoiceNo`, tên nhân viên
  (join `invoice_lines` → `invoices` → `payments.employeeId` →
  `employees.user.fullName`), `amount`. **Không có trường "lý do"** —
  `invoice_lines` không lưu dữ liệu này, đây là giới hạn dữ liệu hiện có,
  không phải thiếu sót khi code báo cáo. Thêm trường lý do bắt buộc/trần %
  là quyết định chính sách riêng, đã nằm trong `05-backlog-nhom-b.md` mục
  "discount guardrail" — **không tự ý thêm** vào đây.

### 2. Báo cáo tổng kết nhập-tồn kho

Endpoint mới `GET /reports/inventory-reconciliation`.

**Nguồn dữ liệu chính là `stock_movements`, không phải `invoice_lines`** —
ledger này đầy đủ từ M4 (`2026-08-15`), không bị giới hạn "chưa backfill"
như `invoice_lines`. Với mỗi item (`extraId` hoặc `productVariantId`) ×
chi nhánh, trong khoảng `[from, to]`:

- Nhập: `SUM(quantity)` với `type = 'purchase_receipt'`.
- Bán (theo ledger kho): `SUM(quantity)` với `type = 'sale'`.
- Trả lại: `SUM(quantity)` với `type = 'sale_return'`.
- Điều chỉnh: `SUM(quantity signed)` với `type IN (adjustment_in,
  adjustment_out, damaged, lost)`.
- Tồn cuối kỳ: số dư hiện tại (`extra_stocks`/`product_stocks.quantity`)
  nếu `to` là hôm nay; nếu `to` là ngày quá khứ thì suy ngược bằng cách trừ
  các movement phát sinh sau `to`.
- Tồn đầu kỳ = tồn cuối kỳ − (nhập − bán + trả lại ± điều chỉnh) trong kỳ.

Vì mọi thay đổi tồn kho **bắt buộc** đi qua `InventoryService.postMovement`
(duy nhất entry point, xem comment trong code), công thức đối chiếu nội bộ
này **phải luôn khớp tuyệt đối** — lệch nghĩa là có bug ở tầng ghi nhận, chứ
không phải "thất thoát ngoài đời thật".

**"Thất thoát" thật sự nằm ở chỗ khác:** so sánh **bán theo `stock_movements`**
(mọi giao dịch trừ kho, đầy đủ từ 2026-08-15) với **bán theo `invoice_lines`**
(chỉ tính hoá đơn đã thanh toán, từ 2026-08-16) trong cùng kỳ. Lệch giữa 2
số này nghĩa là có phiên/đơn đã bị trừ kho (qua `postMovement type='sale'`)
nhưng **chưa từng được thanh toán** — giỏ hàng bán lẻ bị bỏ dở
(`SalesOrder.status = 'open'` mãi không checkout), hoặc phiên sân treo — đây
mới là tín hiệu thất thoát tiềm ẩn đáng cảnh báo, không phải lệch sổ kho nội
bộ (sổ kho không thể lệch theo thiết kế hiện tại).

Output: bảng theo item × chi nhánh — cột nhập / bán (ledger) / bán (hoá đơn,
chỉ từ 2026-08-16) / chênh lệch bán / tồn hiện tại, kèm cờ cảnh báo khi
chênh lệch bán > 0.

### 3. Frontend

- Trang/tab mới trong `Reports` — "Doanh thu chi tiết" và "Đối chiếu kho",
  đúng yêu cầu cần UI ngay (câu hỏi 4).
- Filter theo `period`/`from`-`to`, chọn chi nhánh (nếu admin), toggle so
  sánh chi nhánh.
- Bảng dữ liệu + biểu đồ đơn giản nếu `ReportsPage.jsx` đã có sẵn pattern
  chart để tái dùng (kiểm tra lúc code, không giả định trước).
- Nút xuất Excel/PDF — tái dùng `reportExporter.js` đã có sẵn (đã chống
  formula injection từ `fix/security-critical`), không tốn thêm nhiều công
  dù câu hỏi 4 ưu tiên UI hơn export.

## Việc KHÔNG làm

- Không backfill `invoice_lines` cho hoá đơn cũ (đã chốt từ trước, giữ
  nguyên quyết định).
- Không thêm trường "lý do giảm giá" hay trần % giảm giá — thuộc
  `05-backlog-nhom-b.md`, quyết định chính sách riêng, không tự ý làm kèm.
- Không sửa `/reports/revenue`/`getRevenueReport` hiện có — giữ nguyên cho
  dashboard/export cũ đang dùng.
- Không gộp 2 bảng cân đối tồn kho (`extra_stocks`/`product_stocks`) thành
  1 bảng — chỉ gộp ở tầng hiển thị báo cáo, schema giữ nguyên tách biệt
  theo quyết định đã chốt lúc làm `feat/retail-catalog-inventory`.

## Kiểm thử

- Test thật: checkout vài hoá đơn thật (sân/phụ kiện trong sân/bán lẻ
  quầy/có giảm giá), gọi 2 endpoint mới, đối chiếu tay bằng SQL trực tiếp
  từng con số.
- Test biên: chi nhánh/kỳ không có dữ liệu → trả mảng rỗng, không lỗi 500.
- Test giới hạn dữ liệu: gọi báo cáo doanh thu với `from` trước
  `2026-08-16` → response vẫn ghi đúng `dataFrom`, không âm thầm trả sai số
  liệu do thiếu backfill.
- Test cố ý tạo lệch: mở giỏ hàng bán lẻ, thêm sản phẩm (trừ kho) rồi **không
  checkout** — xác nhận báo cáo đối chiếu kho phát hiện đúng chênh lệch bán
  (ledger có nhưng hoá đơn không có).
- `npm test` hiện có (38 test) không được hồi quy.

## Bước tiếp theo

Plan này đã đủ chi tiết để duyệt "code đi" — không còn câu hỏi mở. Khi
được duyệt: tạo nhánh riêng từ `main` → code theo thứ tự backend (2 endpoint
mới) → frontend (2 tab mới trong Reports) → test thật → báo cáo kết quả →
chờ duyệt merge.
