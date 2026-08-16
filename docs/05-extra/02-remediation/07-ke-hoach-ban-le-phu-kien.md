# Plan: `feat/retail-catalog-inventory` — bán lẻ dụng cụ cầu lông + kho hợp nhất

**Trạng thái (2026-08-16):** đã duyệt "code đi". Backend đã code + test thật
xong (migration, model, service, route) — xem `00-tien-do.md` mục 6 để biết
chi tiết bằng chứng test. **Frontend (mục 14-16) chưa làm.** Nhánh
`feat/retail-catalog-inventory` đang có thay đổi chưa commit — chờ chủ dự án
xem lại trước khi commit/merge.

## Bối cảnh

Định hướng hệ thống của chủ dự án gồm 3 trụ cột:

1. **Thuê sân** — đã có, đang chạy ổn.
2. **Bán lẻ dụng cụ cầu lông** (cầu, vợt, áo, quần) — chưa có, cần xây mới.
3. **Quản lý kho** để giám sát số lượng cho trụ 2 — chưa có, cần xây mới,
   và cần **dùng chung 1 ledger tồn kho** với hệ kho hiện tại (không tách
   riêng 2 hệ song song) theo quyết định của chủ dự án.

Đây **không phải dead code cần xoá** — đính chính lại phần trước đó trong
`01-ke-hoach-dead-code-cleanup.md` từng đề xuất xoá 5 bảng
`product_categories`/`products`/`product_variants`/`sales_orders`/
`sales_order_lines` (đã sửa lại, xem file đó). 5 bảng này tồn tại từ migration
`20260805000002-m2-catalog-sales-orders.js` (2026-08-05) đúng là nền móng cho
trụ 2, nhưng **dữ liệu trong đó hiện là snapshot chết một lần** (backfill lúc
chạy migration, không service nào ghi tiếp sau đó — xem
`06-kiem-tra-lai-2026-08-16.md` ghi chú 3) và **schema hiện tại có 2 lỗi thiết
kế phải sửa trước khi dùng thật** (xem mục dưới) — không thể dùng nguyên trạng.

## Quyết định đã chốt (nguồn sự thật, không tự suy đoán lại)

- **Kho dùng chung 1 ledger** với hệ hiện tại (`stock_movements`), tổng quát
  hoá để nhận cả `extra_id` (trụ 1, giữ nguyên) lẫn `product_variant_id`
  (trụ 2, mới) — không xây hệ kho song song riêng biệt.
- **Biến thể sản phẩm đầy đủ**: size + màu là 2 SKU khác nhau, tồn kho riêng
  từng SKU (áo Yonex đỏ size M ≠ áo Yonex đỏ size L).
- **Cần POS checkout thật ngay đợt đầu** — không chỉ catalog + kho, phải bán
  được thật: tạo đơn, trừ kho, xuất hoá đơn.
- **Catalog dùng chung toàn chuỗi** (giống `extras`) — 1 danh sách sản phẩm/
  giá bán áp dụng mọi chi nhánh, chỉ tồn kho tách theo `branch_id`. Khác với
  thiết kế gốc trong migration M2 (đặt `branch_id NOT NULL` thẳng trên
  `products`/`product_categories`) — **phải sửa lại**.
- **Nhập kho (goods receipt) hỗ trợ sản phẩm bán lẻ ngay đợt đầu** — không
  hoãn, vì bán lẻ bắt buộc phải nhập hàng trước mới có gì để bán.

## 2 lỗi thiết kế trong schema M2 gốc, phải sửa trước khi dùng

1. `products`/`product_categories` có `branch_id NOT NULL` — mâu thuẫn với
   quyết định "catalog dùng chung toàn chuỗi" ở trên. Phải bỏ cột này.
2. `product_variants.stock_quantity` là **một số đơn, không có chiều
   `branch_id`** — sai vì tồn kho phải tách theo từng chi nhánh (giống
   `extra_stocks` tách theo `branch_id`, khác `extras` không có tồn kho trên
   chính bảng catalog). Phải bỏ cột này, tồn kho chuyển sang bảng cân đối
   riêng có `branch_id`.

## Thiết kế cụ thể

### Backend — schema (migration mới)

1. `removeColumn('products', 'branch_id')`, `removeColumn('product_categories', 'branch_id')`
   (xoá cả FK + index liên quan, vd `idx_product_categories_branch`).
2. Xoá dữ liệu snapshot cũ trong 5 bảng M2 (`TRUNCATE` theo đúng thứ tự con→cha,
   hoặc `bulkDelete`) — dữ liệu đó map từ `extras` cũ lúc migrate schema, không
   liên quan gì tới sản phẩm bán lẻ thật (vợt/áo/quần) sắp nhập, giữ lại sẽ gây
   nhầm lẫn. Không xoá bảng, chỉ xoá data.
3. `removeColumn('product_variants', 'stock_quantity')`.
4. Bảng cân đối tồn kho mới `product_stocks` — cùng mẫu `extra_stocks`
   (`branch_id`, `product_variant_id`, `quantity`, `average_cost`, `version`
   cho optimistic lock). Bảng riêng, **không** đổi tên/tái dùng thẳng
   `extra_stocks`, để không đụng bảng đang chạy thật cho trụ 1.
5. Thêm `size`, `color` (nullable, string) vào `product_variants` — 2 thuộc
   tính biến thể theo yêu cầu; `sku` hiện có sẵn (unique) dùng làm định danh
   duy nhất.
6. Tổng quát hoá ledger dùng chung:
   - `stock_movements`: đổi `extra_id` thành nullable, thêm `product_variant_id`
     nullable (FK → `product_variants`), thêm CHECK constraint đúng 1 trong 2
     cột được set (không cả hai, không cả hai đều null).
   - `goods_receipt_items`: tương tự — `extra_id` nullable, thêm
     `product_variant_id` nullable, CHECK đúng 1 cột.
7. `sales_orders`/`sales_order_lines` giữ nguyên cấu trúc hiện có (đã đúng
   sẵn: `channel` enum có `'pos'`, `variant_id` trỏ `product_variants`) —
   không cần sửa.

### Backend — models & associations

8. Đăng ký model mới trong `models/index.js` (nguồn sự thật quan hệ, theo
   đúng quy ước CLAUDE.md): `Product`, `ProductVariant`, `ProductCategory`,
   `ProductStock`, `SalesOrder`, `SalesOrderLine`. Quan hệ:
   `ProductCategory.hasMany(Product)`, `Product.hasMany(ProductVariant)`,
   `ProductVariant.hasMany(ProductStock)` (qua branch), `SalesOrder.hasMany(SalesOrderLine)`,
   `SalesOrderLine.belongsTo(ProductVariant)`.
9. `backend/src/models/Invoice.js` — bỏ `salesOrderId` orphan (theo plan dead
   code cũ) hay giữ lại để trỏ tới `SalesOrder` thật lúc checkout bán lẻ? Cần
   xác nhận lại: đề xuất **giữ lại và dùng thật** — checkout bán lẻ tạo
   `Invoice` với `salesOrderId` trỏ đúng đơn hàng, khác với checkout sân
   (không có `salesOrderId`). Việc này giải quyết luôn phần "cột treo" mà
   `01-ke-hoach-dead-code-cleanup.md` từng định xoá.

### Backend — services

10. Tổng quát hoá `InventoryService.postMovement` (`backend/src/services/InventoryService.js:14`)
    — hiện ký hiệu cứng `extraId`/`ExtraStock`/`Extra`. Đổi sang nhận
    `itemType: 'extra' | 'product_variant'` + `itemId`, route tới đúng cặp
    bảng (`ExtraStock`+`StockMovement.extra_id` hoặc `ProductStock`+
    `StockMovement.product_variant_id`). **Đây là điểm rủi ro hồi quy cao
    nhất** — `postMovement` đang là entry point duy nhất thay đổi tồn kho
    cho trụ 1 đang chạy thật, phải giữ nguyên hành vi cũ 100% cho
    `itemType: 'extra'`, có test hồi quy đầy đủ trước khi thêm nhánh mới.
11. `GoodsReceiptService`/`SupplierService` — tổng quát hoá tương tự để nhập
    kho được cho cả sản phẩm bán lẻ (đợt đầu hỗ trợ luôn theo yêu cầu).
12. `SalesOrderService` mới:
    - Tạo đơn bán lẻ (`status: 'open'`, `channel: 'pos'`).
    - Thêm dòng sản phẩm — kiểm tra + trừ tồn qua `InventoryService.postMovement`
      (`type: 'sale'`, `itemType: 'product_variant'`) trong cùng transaction.
    - Checkout — tạo `Invoice` (`salesOrderId` trỏ đơn) + `Payment` +
      `invoice_lines` (`lineKind: 'product'`, `referenceType: 'sales_order_line'`) —
      **tái dùng thẳng hạ tầng `InvoiceLine` vừa xây ở `feat/invoice-line-items`**,
      không tạo cơ chế hoá đơn riêng cho trụ 2.
13. Route mới `/api/v1/products`, `/api/v1/product-categories` (CRUD catalog,
    quyền admin/branch_manager), `/api/v1/sales-orders` (tạo/thêm dòng/checkout,
    quyền employee trở lên, theo đúng mẫu phân quyền hiện có).

### Frontend

14. Trang quản lý danh mục sản phẩm — CRUD category/product/variant (size+màu).
15. Trang POS bán lẻ — chọn sản phẩm/biến thể, số lượng, tạo đơn, checkout,
    độc lập hoàn toàn luồng sân (không cần booking/session).
16. Mở rộng trang tồn kho hiện có để hiển thị cả 2 loại item (phụ kiện sân +
    sản phẩm bán lẻ) — dùng chung API tồn kho đã tổng quát hoá, tránh 2 màn
    hình kho tách biệt.

## Việc KHÔNG làm trong đợt đầu

- Kênh bán online (`channel: 'online'`) — chưa có yêu cầu cụ thể, để sau.
- Tích hợp máy quét mã vạch thật — chỉ lưu `sku` dạng text, chưa nối phần cứng.
- Không đụng `extras`/`session_extras`/`extra_stocks` hiện có cho trụ 1 —
  chỉ generalize `InventoryService` để nhận thêm nhánh mới, hành vi cũ giữ
  nguyên.
- Không migrate/tái sử dụng dữ liệu snapshot cũ trong 5 bảng M2 (đã quyết
  định xoá sạch data trước khi dùng, xem mục 2 ở trên).

## Kiểm thử

- **Hồi quy trụ 1 trước tiên** — toàn bộ luồng phụ kiện trong sân (mở sân,
  thêm phụ kiện, checkout, điều chỉnh kho thủ công) sau khi generalize
  `InventoryService`, phải cho kết quả y hệt trước khi generalize.
- Test thật luồng bán lẻ mới, đủ vòng đời: tạo category → tạo product +
  variant (size/màu) → nhập kho qua `GoodsReceiptService` → tồn kho
  `product_stocks` tăng đúng, giá vốn bình quân tính đúng → tạo đơn bán lẻ →
  thêm dòng → tồn kho giảm đúng → checkout → `invoice_lines` + `Invoice.salesOrderId`
  đúng, tổng tiền khớp.
- Test biên: bán vượt tồn kho phải chặn (`newQuantity < 0` → lỗi 400, đúng
  hành vi hiện có của `postMovement`).
- `npm test` toàn bộ (không chỉ file mới) — xác nhận không hồi quy các test
  hiện có liên quan `InventoryService`/`GoodsReceiptService`.

## Bước tiếp theo

Duyệt plan này ("code đi") → tạo nhánh `feat/retail-catalog-inventory` từ
`main` → code theo đúng thứ tự schema → model → service (generalize +
test hồi quy trụ 1 trước) → route → frontend → báo cáo kết quả kèm bằng
chứng test thật → chờ duyệt merge.
