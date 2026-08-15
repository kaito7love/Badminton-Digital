# Plan: `chore/dead-code-cleanup` (CHƯA LÀM)

**Trạng thái:** chưa tạo nhánh, chưa code. Đây là plan để duyệt trước khi
"code đi", theo đúng quy trình ở `00-tien-do.md`.

## Bối cảnh

Bản nháp đầu tiên của nhánh này định xoá 6 bảng, gồm cả `invoice_lines` —
chủ dự án đã dừng lại và chỉ ra `invoice_lines` không phải rác mà là phần
còn thiếu của hoá đơn, dẫn tới nhánh `feat/invoice-line-items` (đã code
xong, xem `00-tien-do.md` mục 5). Phạm vi nhánh này vì vậy **thu hẹp lại
còn 5 bảng** — phần catalog/sales-order thật sự chưa từng được dùng.

## Xác nhận "chết thật" (đọc trực tiếp code)

Nguồn gốc: migration `20260805000002-m2-catalog-sales-orders.js` tạo 5 bảng
`product_categories`, `products`, `product_variants`, `sales_orders`,
`sales_order_lines` — mô tả trong comment đầu file: *"Legacy tables remain
for dual-write period"* — tức là kế hoạch dual-write (ghi song song vào cả
hệ cũ `extras`/`session_extras` lẫn hệ catalog mới) trong lộ trình M1-M7,
nhưng dual-write **chưa từng được lập trình** — migration chỉ backfill 1 lần
lúc chạy migration, không có service nào ghi tiếp sau đó.

Cần grep lại các bảng này trong `backend/src` (models, services, controllers)
ngay đầu nhánh để xác nhận lần cuối không có model/route nào đang dùng trước
khi xoá — tại thời điểm viết plan này, `backend/src/models/index.js` không
có `Product`/`ProductVariant`/`SalesOrder`/`ProductCategory` nào được
require, nên gần như chắc chắn không model Sequelize nào trỏ tới các bảng
này.

`invoices.sales_order_id` có ràng buộc khoá ngoại tới `sales_orders.id`
(`onDelete: SET NULL`, thêm ở migration
`20260805000003-m3-invoice-lines-payments.js:18-24`) — **phải xoá cột này
trước khi drop bảng `sales_orders`**, nếu không migration sẽ lỗi vì còn FK
tham chiếu.

## Việc cần làm

### Backend
1. Migration mới `xxx-drop-legacy-catalog-tables.js`:
   - `removeColumn('invoices', 'sales_order_id')` (phải làm trước, vì FK).
   - `dropTable('sales_order_lines')` (con của `sales_orders` + `product_variants`).
   - `dropTable('sales_orders')`.
   - `dropTable('product_variants')` (con của `products`).
   - `dropTable('products')` (con của `product_categories`).
   - `dropTable('product_categories')`.
   - Thứ tự xoá phải theo chiều ngược của FK (con trước, cha sau) — như liệt
     kê ở trên.
   - `down()`: dựng lại đúng cấu trúc bảng như migration M2 gốc (không cần
     backfill lại dữ liệu — đây là xoá bảng rác, rollback chỉ cần đúng
     schema để không kẹt migration chain, không cần khôi phục data).
2. `backend/src/models/Invoice.js` — xoá field `salesOrderId` (dòng 26-30).
3. Grep toàn bộ `backend/src` tìm `salesOrderId`/`sales_order_id` ở
   controllers/services/validations còn sót (tại thời điểm viết plan, chưa
   thấy chỗ nào dùng ngoài model — cần xác nhận lại lúc code vì code có thể
   đã đổi).

### Frontend
4. `frontend/src/services/apiServices.js` — xoá 3 hàm mồ côi (không có
   component nào gọi, xác nhận lại bằng grep trước khi xoá):
   - `applyDiscount` (dòng ~117, gọi `/payments/:id/apply-discount` — route
     này cũng cần kiểm tra còn tồn tại ở backend hay không, xoá luôn nếu là
     route chết).
   - `getOccupancyReport` (dòng ~132, gọi `/reports/occupancy`).
   - `updateAccessoryPricing` (dòng ~147, gọi `/settings/accessory-pricing`).
   - Nếu backend vẫn còn route cho các endpoint này mà chỉ frontend không
     gọi tới, cân nhắc xoá cả route backend tương ứng (kiểm tra thêm khi
     code, không giả định trước).

## Việc KHÔNG làm trong nhánh này

- Không đụng `invoice_lines`, `InvoiceLine` model, hay bất cứ gì thuộc
  `feat/invoice-line-items` — đã xác nhận là tính năng đang dùng, không phải
  rác.
- Không đụng bảng `extras`/`session_extras` (hệ cũ đang chạy thật) — chỉ xoá
  hệ catalog mới chưa từng dùng.

## Kiểm thử

- `npm test` — 38/38 pass, không có test nào đụng 5 bảng/route bị xoá (xác
  nhận lại đầu nhánh).
- Test migration thật: `db:migrate` rồi `db:migrate:undo` trên DB dev — xác
  nhận cả `up`/`down` chạy sạch, không lỗi FK.
- Chạy lại toàn bộ luồng checkout + báo cáo thật qua API sau khi xoá, xác
  nhận không có lỗi 500 nào phát sinh do thiếu bảng/model đã xoá.
- `grep -r "sales_order\|product_variant\|product_categor" backend/src
  frontend/src` sau khi xoá — kỳ vọng không còn kết quả nào ngoài migration
  cũ (M2/M3, giữ nguyên làm lịch sử) và chính migration xoá mới thêm.
