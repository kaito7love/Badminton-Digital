# Kế hoạch 2 — Phase 2 Inventory Foundation

**Mục tiêu:** Thay tồn kho MVP cập nhật trực tiếp bằng inventory ledger có thể truy vết, hỗ trợ nhiều kho/vị trí, nhập hàng, kiểm kê, điều chỉnh và chuyển kho.  
**Điều kiện bắt đầu:** Kế hoạch audit Phase 1 đã hoàn tất hoặc các rủi ro Phase 1 được chấp nhận bằng văn bản.

> Lưu ý: File `Phase2-ImplementationPlan.md` cũ là phase thiết kế kiến trúc ban đầu. Kế hoạch này là **Phase 2 theo roadmap nghiệp vụ mới: Inventory Foundation**.

## 1. Phạm vi

### In scope

- `Warehouse`
- `WarehouseLocation`
- `StockMovement`
- `StockMovementLine`
- `StockLevel`
- `Supplier`
- `PurchaseOrder`
- `PurchaseOrderItem`
- `GoodsReceipt`
- `GoodsReceiptItem`
- `StockAdjustment` và adjustment lines
- `InventoryCount`
- `InventoryCountItem`
- `TransferOrder`
- `TransferOrderItem`
- Tích hợp tồn kho với session extra/POS legacy theo cơ chế tương thích.

### Out of scope

- Mini store public, product image/barcode UX, promotion/combo/refund UI đầy đủ: Phase 3.
- Membership, voucher, wallet: Phase 5.
- COGS/profit dashboard hoàn chỉnh: Phase 6.
- Lot/batch/expiry/FIFO valuation đầy đủ: chỉ thiết kế extension point; nếu cần bán hàng có hạn dùng trước Phase 3, tạo sub-phase riêng.

## 2. Quy tắc bất biến (invariants)

1. Không service nào được update `stock_quantity` trực tiếp sau cutover.
2. Mọi thay đổi tồn kho tạo ít nhất một `stock_movement` và một hoặc nhiều `stock_movement_lines` trong cùng transaction.
3. `stock_levels` là projection/cached balance, không phải nguồn audit duy nhất.
4. Tồn kho không được âm trừ khi reason code được whitelist và có approval policy.
5. Mọi movement có `branch_id`, actor, source type/source ID, thời điểm và reference code.
6. Stock transfer phải ghi source-out và destination-in atomically hoặc đi qua state machine rõ ràng.
7. Unit cost phải được snapshot tại receipt/adjustment; sales movement giữ cost snapshot khi cost tracking được bật.
8. Product/variant là canonical item. Legacy `extras` chỉ là compatibility layer trong thời gian chuyển đổi.

## 3. Quyết định kiến trúc trước khi code

### 3.1 Đặt tên migration

`20260805000004-p1-production-safety.js` đã dùng số M4. Không tái sử dụng tên M4 trong roadmap cũ.

Đề xuất chuỗi migration mới:

```text
20260806000001-p2-inventory-core.js
20260806000002-p2-procurement-and-counts.js
20260806000003-p2-inventory-cutover.js
```

### 3.2 Canonical SKU

- Dùng `product_variants` từ M2 làm SKU canonical.
- Mapping legacy: `products.legacy_extra_id -> product_variants.id`.
- Mọi session extra mới phải resolve legacy extra sang variant trong giai đoạn dual-write.
- Không thêm bảng product/variant thứ hai; Phase 3 chỉ mở rộng catalog hiện có.

### 3.3 Ledger design

`stock_movements` là header nghiệp vụ; `stock_movement_lines` là lượng thực tế thay đổi.

Movement types tối thiểu:

```text
opening_balance, purchase_receipt, sale, sale_return,
transfer_out, transfer_in, adjustment_in, adjustment_out,
count_gain, count_loss, damaged, expired
```

Mỗi line dùng quantity dương; ý nghĩa tăng/giảm được xác định bởi type. Điều này tránh signed quantity lẫn lộn trong report.

## 4. Thiết kế database mục tiêu

| Bảng | Mục đích và ràng buộc chính |
|---|---|
| `warehouses` | `branch_id`, code unique theo branch, name, type, active |
| `warehouse_locations` | Kho con/bin; unique `(warehouse_id, code)` |
| `stock_levels` | `variant_id`, `warehouse_location_id`, `on_hand`, `reserved`; unique cặp variant/location |
| `stock_movements` | Branch, type, status, reference code, source type/ID, actor, posted time, note |
| `stock_movement_lines` | Movement, variant, source/destination location, quantity, unit cost, cost total |
| `suppliers` | Branch, code, name, tax/contact, active |
| `purchase_orders` | Branch, supplier, PO number, status, dates, approval/creator |
| `purchase_order_items` | PO, variant, ordered/received quantity, agreed unit cost |
| `goods_receipts` | Branch, warehouse, supplier/PO, receipt number, status, receiver |
| `goods_receipt_items` | Receipt, PO item optional, variant, accepted/rejected quantity, unit cost |
| `stock_adjustments` | Branch, warehouse, reason, status, approver, actor |
| `stock_adjustment_items` | Adjustment, variant/location, expected/actual/delta quantity, unit cost |
| `inventory_counts` | Branch, warehouse, status, scheduled/posted, counter/approver |
| `inventory_count_items` | Count, variant/location, system quantity, counted quantity, variance |
| `transfer_orders` | Source/destination warehouse, status, dispatch/receive actors |
| `transfer_order_items` | Transfer, variant, requested/dispatched/received quantity |

Mọi bảng vận hành mới cần `created_at`, `updated_at`, `deleted_at` khi phù hợp, `version` cho optimistic locking và index theo branch/status/date.

## 5. Trình tự triển khai

### Step 0 — Phase 1 gate

1. Hoàn tất/đánh giá Kế hoạch 1.
2. Freeze thay đổi `extras.stock_quantity` không thuộc hotfix.
3. Backup DB và tạo staging database.
4. Chốt movement taxonomy, reason codes, approval boundaries và đơn vị tính.

**Done:** Có sign-off về bất biến ledger và compatibility strategy.

### Step 1 — Inventory core migration và models

1. Tạo migration `p2-inventory-core` cho warehouse, location, stock level, movement header/lines.
2. Tạo model, association, repository/service helpers.
3. Tạo warehouse/location mặc định cho từng branch hiện có.
4. Tạo opening-balance movement từ stock legacy sau khi reconciliation.
5. Không cutover endpoint cũ ở step này.

**Done:** Có thể query stock level và ledger; tổng opening balance khớp legacy stock snapshot.

### Step 2 — Inventory posting service

1. Tạo `InventoryService.postMovement()` là entry point duy nhất thay đổi tồn kho.
2. Trong một transaction: lock stock level, validate available quantity, create movement/lines, update projection, create audit log.
3. Tạo idempotency/reference handling cho receipt, sale, return, transfer và adjustment.
4. Tạo unit tests + MySQL integration tests cho concurrent posting.

**Done:** Không có service khác update stock projection trực tiếp.

### Step 3 — Procurement

1. Tạo supplier CRUD theo branch.
2. Tạo PO state machine: draft → submitted → approved → partially_received → received/cancelled.
3. Tạo goods receipt state machine: draft → posted/void.
4. Khi post goods receipt, gọi `InventoryService.postMovement(purchase_receipt)`.
5. Snapshot unit cost tại receipt; cập nhật quantity received trên PO trong cùng transaction.

**Done:** Nhập hàng tăng tồn kho chỉ qua goods receipt posted; không thể post receipt hai lần.

### Step 4 — Adjustment và inventory count

1. Tạo adjustment reason code và approval policy.
2. Tạo inventory count snapshot theo location/variant.
3. Count posting sinh count gain/loss movements theo variance.
4. Chỉ approver có quyền post/void adjustment hoặc count.

**Done:** Mọi lệch kho có reason, actor, approver, before/after evidence và ledger line.

### Step 5 — Transfer order

1. Tạo transfer order: draft → approved → dispatched → received/cancelled.
2. Dispatch tạo `transfer_out`; receiving tạo `transfer_in`.
3. Hàng in-transit phải có trạng thái rõ ràng; không cộng destination trước receive.
4. Dùng lock theo source/destination stock level theo thứ tự cố định để tránh deadlock.

**Done:** Không thể dispatch vượt tồn; totals source/destination/in-transit reconcile được.

### Step 6 — Cutover từ legacy extras

1. Map toàn bộ `extras` sang `product_variants` qua `legacy_extra_id`.
2. Chuyển `AccessoryService.addSessionExtra/returnSessionExtra` sang gọi `InventoryService` với sale/sale_return movement.
3. Trong 1–2 sprint dual-read: API cũ vẫn trả shape `Extra`, nhưng stock source là ledger/projection.
4. Reconciliation job so sánh legacy stock với `stock_levels` mỗi ngày.
5. Khi số liệu khớp và frontend không còn write legacy quantity, cấm mọi direct update `extras.stock_quantity`.

**Done:** Session sales tạo movement và inventory history; direct `stock_quantity` update bị loại bỏ khỏi production path.

### Step 7 — API, frontend và documentation

1. API: `/warehouses`, `/warehouse-locations`, `/stock-levels`, `/stock-movements`, `/suppliers`, `/purchase-orders`, `/goods-receipts`, `/stock-adjustments`, `/inventory-counts`, `/transfer-orders`.
2. Tất cả write endpoint dùng branch context, permission, idempotency khi có nguy cơ retry và audit log.
3. Frontend tối thiểu: stock inquiry, PO/receipt, adjustment, count, transfer status.
4. Cập nhật OpenAPI/API design, Postman collection và operator workflow.

**Done:** Người vận hành hoàn thành receive/count/transfer mà không cần SQL/manual stock edit.

## 6. Test plan bắt buộc

| Nhóm | Case tối thiểu |
|---|---|
| Migration | Fresh install, upgrade từ M1–M4, rollback development, opening balance reconcile |
| Authorization | Branch isolation, warehouse permission, approver-only actions |
| Concurrency | Hai sale cùng SKU/location; dispatch và adjustment đồng thời; không tồn kho âm |
| Idempotency | Repost same receipt/webhook/reference không duplicate stock |
| Procurement | Partial receipt, over-receipt reject, void posted receipt policy |
| Count | Snapshot khác current stock, variance posting, approval/void |
| Transfer | Partial dispatch/receive, cancellation before/after dispatch, in-transit reconciliation |
| Reporting | Ledger sum = stock level; stock movement trace có actor/source/audit |
| E2E | Receive hàng → sell tại session → return → count → report history |

## 7. Chỉ số hoàn thành (Definition of Done)

Phase 2 chỉ hoàn thành khi:

1. Không còn production write path cập nhật `stock_quantity` trực tiếp.
2. Mọi sale/return/receipt/adjustment/count/transfer có movement header + line, actor và source reference.
3. Ledger reconcile với `stock_levels` và opening balance không chênh lệch không giải thích được.
4. Không thể bán/chuyển vượt tồn kho dưới concurrent requests.
5. API branch/authorization/audit/idempotency có integration tests với MySQL.
6. Legacy compatibility được gỡ bỏ theo kế hoạch, không còn dual-write vô thời hạn.

## 8. Rủi ro và quyết định cần chốt trước Step 1

1. Chọn đơn vị tính chuẩn (chai, hộp, quả, lượt thuê) và quy đổi đơn vị.
2. Xác định có cho phép negative stock không; mặc định đề xuất là không.
3. Chọn cost method: bắt đầu weighted average hay chỉ snapshot cost; FIFO cần lot layer và tăng độ phức tạp.
4. Chốt goods receipt có cần kiểm tra chất lượng/rejected quantity không.
5. Chốt transfer in-transit có được bán/allocate hay không.
6. Chốt quyền approver cho adjustment, count variance và PO approval.
7. Chốt thời điểm cutover legacy extras và thời lượng dual-write tối đa.
