# Plan: `chore/dead-code-cleanup` (CHƯA LÀM)

**Trạng thái:** chưa tạo nhánh, chưa code. Đây là plan để duyệt trước khi
"code đi", theo đúng quy trình ở `00-tien-do.md`.

> **Đính chính (2026-08-16):** bản trước của file này đề xuất xoá 5 bảng
> catalog/sales-order (`product_categories`, `products`, `product_variants`,
> `sales_orders`, `sales_order_lines`) + `Invoice.salesOrderId`, coi đó là
> dead code. **Sai** — chủ dự án xác nhận đây là nền móng đã định trước cho
> trụ cột "bán lẻ dụng cụ cầu lông" (vợt/áo/quần/cầu) trong định hướng hệ
> thống, chỉ là chưa tới lượt làm trong lộ trình M1-M7 (đúng như
> `MIGRATION_ROADMAP.md` ghi trạng thái M2 là *"Schema-only"*, không phải
> *"abandoned"*). Phần đó đã tách hẳn ra plan riêng
> `07-ke-hoach-ban-le-phu-kien.md` — **không xoá 5 bảng này**. Phạm vi file
> này bây giờ chỉ còn phần dead code thật sự an toàn: 3 hàm API mồ côi ở
> frontend.

## Bối cảnh

Bản nháp đầu tiên của nhánh này định xoá 6 bảng, gồm cả `invoice_lines` —
chủ dự án đã dừng lại và chỉ ra `invoice_lines` không phải rác mà là phần
còn thiếu của hoá đơn, dẫn tới nhánh `feat/invoice-line-items` (đã code
xong, xem `00-tien-do.md` mục 5). Vòng rà soát tiếp theo định thu hẹp còn 5
bảng catalog/sales-order — nhưng như đính chính ở trên, 5 bảng đó cũng
**không phải dead code**, nên phạm vi nhánh này giờ chỉ còn phần frontend.

## Việc cần làm

### Frontend
1. `frontend/src/services/apiServices.js` — xoá 3 hàm mồ côi (không có
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
- Không đụng 5 bảng catalog/sales-order (`product_categories`, `products`,
  `product_variants`, `sales_orders`, `sales_order_lines`) hay
  `Invoice.salesOrderId` — không phải dead code, xem
  `07-ke-hoach-ban-le-phu-kien.md`.
- Không đụng bảng `extras`/`session_extras` (hệ cũ đang chạy thật).

## Kiểm thử

- `npm test` — 38/38 pass, không có test nào đụng route bị xoá (xác nhận lại
  đầu nhánh).
- `grep -r "applyDiscount\|getOccupancyReport\|updateAccessoryPricing"
  backend/src frontend/src` sau khi xoá — kỳ vọng không còn kết quả nào.
