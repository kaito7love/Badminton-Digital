# WF-09 — Luồng Bán lẻ Dụng cụ & Danh mục sản phẩm (UC-24)

**Actors:** Nhân viên, `branch_manager`, Admin (bán hàng); Admin/`branch_manager` (danh mục sản phẩm)
**Use Cases:** UC-24 (Bán lẻ dụng cụ tại quầy — POS độc lập với luồng sân)

> File này KHÔNG có trong tài liệu workflow trước đây — tính năng "trụ thứ 2"
> (bên cạnh thuê sân) được thêm ở merge `feat/retail-pos` (2026-08-16, commit
> `124f108`), độc lập hoàn toàn với `Extra`/`SessionExtra` (WF-07). Đây là hệ
> thống catalog + POS riêng cho việc bán vợt, áo, quần, giày, phụ kiện thể
> thao — không gắn với một `CourtSession` nào cả. Chi tiết định hướng và các
> quyết định thiết kế xem `docs/05-extra/02-remediation/00-tien-do.md`.

---

## Vì sao có 2 hệ thống "sản phẩm" song song

| | `Extra` (WF-07) | `Product`/`ProductVariant` (file này) |
|---|---|---|
| Dùng cho | Nước uống, cầu lông, đồ dùng nhỏ gọi thêm KHI ĐANG CHƠI | Vợt, áo, quần, giày... bán độc lập, khách không cần thuê sân |
| Biến thể (size/màu) | Không có | Có — 1 `Product` (VD "Áo cầu lông Yonex") có nhiều `ProductVariant` (SKU riêng theo size/màu) |
| Gắn với | `CourtSession` qua `SessionExtra` | `SalesOrder` qua `SalesOrderLine` — đơn hàng độc lập |
| Tồn kho | `ExtraStock` (theo chi nhánh) | `ProductStock` (theo chi nhánh) — **bảng khác**, nhưng |
| Sổ nhật ký kho | `stock_movements` (`extra_id` set) | `stock_movements` (`product_variant_id` set) — **CÙNG 1 bảng, cùng `InventoryService.postMovement`**, mỗi dòng chỉ set đúng 1 trong 2 cột |
| Hóa đơn khi bán | `Invoice.courtFee` + `SessionExtra` → `InvoiceLine.referenceType='session_extra'` | `Invoice.salesOrderId` (không qua `sessionId`) → `InvoiceLine.referenceType='sales_order_line'` |

Hai hệ thống dùng chung đúng 1 hạ tầng: `InventoryService.postMovement` (kho),
`GoodsReceiptService` (nhập kho), và `Invoice`/`Payment` (thanh toán) — chỉ
khác model catalog và cách sinh ra dòng hóa đơn. Vì vậy các báo cáo tồn kho
(`GET /inventory/stock-levels`, đối chiếu kho — mục F bên dưới) trả về cả hai
loại item trộn lẫn, phân biệt bằng `itemType: 'extra' | 'product_variant'`.

---

## A. Xem danh mục sản phẩm (mọi vai trò đã đăng nhập)

```
[GET /api/v1/products]  và  [GET /api/v1/product-categories]
    │   (không yêu cầu role cụ thể — chỉ cần authMiddleware; POS cần nhân
    │    viên bất kỳ đọc được để bán hàng)
    │   Danh mục KHÔNG branch-scoped — dùng chung toàn chuỗi, giống Extra
    │
    └─→ [GET /api/v1/products?categoryId=&isActive=true]
              → Mỗi Product kèm mảng variants[] (sku, size, color, listPrice,
                lowStockThreshold, trackInventory)
```

Tồn kho (`ProductStock.quantity`, theo chi nhánh) và giá vốn bình quân
**không** nằm trong response `/products` — phải gọi riêng
`GET /api/v1/inventory/product-stock-levels` (mục E) để lấy, giống cách tách
danh mục ↔ tồn kho của Extra.

---

## B. Quản lý danh mục / sản phẩm / biến thể (Admin, `branch_manager`)

```
Admin / branch_manager
    │
    ├─→ [Tab "Danh mục sản phẩm"] (RetailPage — CHỈ hiện tab này với admin/
    │       branch_manager; nhân viên thường không thấy tab, dù gọi thẳng
    │       API ghi vẫn bị chặn 403 ở route)
    │
    ├─→ [Danh mục] POST/PUT/DELETE /api/v1/product-categories
    │       (DELETE là HARD delete — khác Extra/Supplier vốn soft-delete
    │        `paranoid: true`; xóa danh mục đang có sản phẩm sẽ lỗi khóa
    │        ngoại ở tầng DB, không có cảnh báo mềm ở tầng service)
    │
    ├─→ [Sản phẩm] POST /api/v1/products
    │       { name, categoryId?, productType?, variants: [...] }
    │       ├─→ productType ∈ [retail, consumable, rental, service],
    │       │     mặc định 'retail'
    │       ├─→ BẮT BUỘC ≥ 1 biến thể ngay lúc tạo → thiếu → 400 "Sản phẩm
    │       │     cần ít nhất 1 biến thể (SKU)" — không có sản phẩm nào
    │       │     tồn tại mà 0 biến thể
    │       └─→ Mỗi biến thể cần sku + listPrice; thiếu → 400 "Mỗi biến thể
    │             cần sku và listPrice"
    │
    ├─→ [Thêm biến thể cho sản phẩm có sẵn] POST /api/v1/products/:id/variants
    │       { sku, listPrice, size?, color?, lowStockThreshold? }
    │       lowStockThreshold mặc định 5 nếu bỏ trống
    │
    ├─→ [Sửa sản phẩm / biến thể] PUT /api/v1/products/:id,
    │       PUT /api/v1/products/variants/:variantId
    │
    └─→ Sản phẩm/biến thể mới tạo KHÔNG khởi tạo tồn kho (giống Extra) —
        `ProductStock` chỉ sinh ra (quantity=0) khi có giao dịch kho đầu
        tiên chạm tới, thường là lần nhập kho đầu (mục E)
```

---

## C. Bán hàng tại quầy — Luồng POS (UC-24)

```
Nhân viên / branch_manager / Admin
    │
    ├─→ [Tab "Bán hàng"] → Chọn danh mục lọc → Bấm vào từng biến thể để
    │       thêm vào giỏ (KHÔNG có bước chọn khách hàng trên giao diện —
    │       xem ghi chú "Khách hàng" bên dưới)
    │
    ├─→ Lần bấm ĐẦU TIÊN: [POST /api/v1/sales-orders] { customerId? }
    │         → Tạo SalesOrder { channel: 'pos', status: 'open',
    │             customerId: customerId || null,
    │             cashierEmployeeId: nhân viên đang đăng nhập }
    │         (frontend hiện tại luôn gọi không kèm customerId → đơn luôn
    │          KHÔNG gắn khách hàng nào, kể cả khi khách là hội viên cũ)
    │
    ├─→ Mỗi lần bấm thêm sản phẩm: [POST /api/v1/sales-orders/:id/lines]
    │         { variantId, quantity }
    │         │ DB Transaction — SalesOrderService.addLine:
    │         ├─→ Khóa dòng SalesOrder (FOR UPDATE), status phải 'open',
    │         │     khác → 400 "Đơn hàng ở trạng thái '{status}', không
    │         │     thể thêm sản phẩm"
    │         ├─→ Không có quantity nguyên dương → 400 "Số lượng phải là
    │         │     số nguyên dương"
    │         ├─→ Chốt unitPrice = variant.listPrice TẠI THỜI ĐIỂM thêm
    │         │     (đổi giá bán sau đó không ảnh hưởng dòng đã thêm)
    │         └─→ InventoryService.postMovement({ type: 'sale',
    │               productVariantId, quantity }) — TRỪ KHO NGAY, không
    │               đợi checkout; không đủ tồn kho → 400 "Không đủ tồn kho
    │               tại chi nhánh này. Hiện có: {N}" (cùng message dùng
    │               chung cho mọi luồng trừ kho, xem WF-07)
    │
    ├─→ Bấm ✕ trên 1 dòng: [DELETE /api/v1/sales-orders/:id/lines/:lineId]
    │         → Hoàn lại đúng số lượng vào tồn kho (type: 'sale_return'),
    │           xóa hẳn dòng khỏi đơn (không giữ lại lịch sử dòng đã xóa)
    │
    └─→ "Huỷ giỏ": KHÔNG có endpoint hủy nguyên đơn — frontend giả lập
        bằng cách gọi DELETE lần lượt từng dòng cho tới khi giỏ rỗng.
        Model `SalesOrder.STATUSES` có sẵn giá trị `'cancelled'` nhưng
        KHÔNG có luồng nào trong code đặt trạng thái này — đơn "hủy" thực
        chất vẫn ở status='open', chỉ là 0 dòng, cho tới khi bị dọn dữ
        liệu thủ công hoặc bỏ quên vĩnh viễn ở trạng thái 'open' rỗng.
```

**Khách hàng:** Không giống booking/mở sân (`CustomerService.resolveWalkIn`
tự tìm/gộp hồ sơ theo SĐT), `SalesOrder.customerId` chỉ nhận đúng ID có sẵn
qua body — không có bước "nhập SĐT khách vãng lai" nào. Giao diện POS hiện
tại luôn bỏ trống trường này, nên **mọi đơn bán lẻ đều ẩn danh, không cộng
dồn được vào `totalSpent`/hạng hội viên của khách** dù khách đó có hồ sơ sẵn
— khác biệt lớn so với luồng mở sân/booking. Muốn gắn khách phải gọi API
trực tiếp với `customerId` (chưa có UI).

---

## D. Thanh toán đơn bán lẻ (UC-24)

```
[POS] → Nhập giảm giá (số tiền cố định, không có % như UC-18) → Chọn
        phương thức thanh toán → Nhấn "💳 Thanh toán"
    │
    ├─→ [POST /api/v1/sales-orders/:id/checkout]
    │         { paymentMethod: 'cash' | 'transfer', discountAmount? }
    │         Header tuỳ chọn `Idempotency-Key` (mặc định `sales-order-{id}`)
    │         │
    │         │ DB Transaction — SalesOrderService.checkout:
    │         ├─→ Đơn đã 'cancelled' → 400 "Đơn hàng đã bị huỷ, không thể
    │         │     thanh toán" (dự phòng — thực tế chưa có luồng nào set
    │         │     được trạng thái này, xem mục C)
    │         ├─→ Đơn chưa có dòng nào → 400 "Đơn hàng chưa có sản phẩm nào"
    │         ├─→ Tính totalAmount = Σ lineTotal − discountAmount (không âm)
    │         ├─→ Tạo/cập nhật Invoice { courtFee: 0, extrasFee: Σ lineTotal,
    │         │     salesOrderId, status: 'issued' } — TÁI DÙNG hạ tầng
    │         │     Invoice/InvoiceLine của UC-18, chỉ khác courtFee luôn 0
    │         │     và gắn salesOrderId thay vì sessionId
    │         ├─→ Tạo InvoiceLine { lineKind: 'product' } cho mỗi dòng sản
    │         │     phẩm + 1 dòng { lineKind: 'discount' } nếu có giảm giá
    │         ├─→ Tạo Payment:
    │         │       cash     → status = 'paid' NGAY
    │         │       transfer → status = 'pending', trả kèm qrCodeUrl
    │         │             (VietQR, cùng cơ chế WF-04 — xác nhận CŨNG chỉ
    │         │              qua webhook ngân hàng `POST /payments/webhook`,
    │         │              không có nút xác nhận thủ công)
    │         ├─→ Đơn đã có Payment rồi (gọi checkout 2 lần không đúng
    │         │     Idempotency-Key) → 409 "Đơn hàng này đã có yêu cầu
    │         │     thanh toán"
    │         ├─→ CHỈ khi cash VÀ đơn có customerId: cộng total_spent +
    │         │     tính lại loyalty_tier ngay (giống UC-18) — đơn ẩn danh
    │         │     (đa số, xem mục C) thì bỏ qua bước này hoàn toàn
    │         └─→ Đơn hàng → status = 'paid'; Invoice → 'paid' nếu cash
    │
    └─→ Response: invoiceId, invoiceNo, totalAmount, paymentStatus,
        qrCodeUrl (transfer only) → Hiển thị banner "✅ Thanh toán thành
        công — Hóa đơn {invoiceNo}"
```

`paymentMethod` chỉ nhận `['cash', 'transfer']` — không có phương thức nào
khác. Xuất PDF hóa đơn bán lẻ dùng lại đúng `GET /api/v1/invoices/:id/export-pdf`
(WF-04 mục C) vì cùng bảng `Invoice`.

---

## E. Nhập kho cho sản phẩm bán lẻ (Admin / Nhân viên)

```
[Tab "Kho bán lẻ"] → form nhập kho, y hệt bố cục WF-07 mục C nhưng chọn
"Biến thể sản phẩm" thay vì "Phụ kiện"
    │
    └─→ [POST /api/v1/goods-receipts] { supplierId?, note?, items: [
              { productVariantId, quantity, unitCost }, ...
        ] }
```

`GoodsReceiptService` giờ nhận **1 phiếu nhập có thể trộn lẫn cả dòng
`extraId` (WF-07) lẫn dòng `productVariantId` (file này)** trong cùng request
— mỗi dòng phải khai báo ĐÚNG 1 trong 2, khai cả hai hoặc bỏ trống cả hai đều
lỗi 400 "Mỗi dòng hàng phải chỉ định đúng 1 trong 2: extraId hoặc
productVariantId". Cùng cơ chế sinh mã phiếu `GR-{branchId}-...`, cùng công
thức giá vốn bình quân gia quyền, cùng route `POST /api/v1/goods-receipts`
(role `admin`/`branch_manager`/`employee`) như WF-07 mục C — chỉ khác cột
nào trong `stock_movements`/`extra_stocks` hay `product_stocks` bị chạm tới.

---

## F. Xem tồn kho & lịch sử đơn bán lẻ

```
[GET /api/v1/inventory/product-stock-levels]
    → Tồn kho ProductVariant của chi nhánh hiện tại, kèm averageCost
      (null nếu chưa nhập kho lần nào) — hiển thị dạng thẻ ở tab "Kho bán lẻ"
      Cảnh báo Normal/Low/Critical tính ở frontend, cùng công thức WF-07 §I
      nhưng so với variant.lowStockThreshold thay vì extra.lowStockThreshold

[GET /api/v1/sales-orders?status=&from=&to=&page=]
    → Lịch sử đơn bán lẻ của chi nhánh hiện tại, mới nhất trước — hiển thị
      ở tab "🛍️ Bán Lẻ" trên trang Lịch sử (HistoryPage), kèm trạng thái
      thanh toán (qua include Invoice→Payment) và tên thu ngân
```

Sổ nhật ký kho gộp chung (`GET /api/v1/inventory/movements`, WF-07 mục E)
cũng liệt kê các dòng phát sinh từ bán lẻ — phân biệt bằng cột "Loại tham
chiếu" `sales_order_line` thay vì `session_extra`.

---

## Bảng vai trò & quyền hạn

| Hành động | Endpoint | Vai trò được phép |
|---|---|---|
| Xem danh mục/sản phẩm | `GET /api/v1/products`, `/product-categories` | Mọi vai trò đã đăng nhập |
| Thêm/Sửa danh mục, sản phẩm, biến thể | `POST/PUT/DELETE /api/v1/product-categories`, `POST/PUT /api/v1/products[...]` | `admin`, `branch_manager` |
| Tạo đơn / thêm-xóa dòng / xem đơn | `POST/GET /api/v1/sales-orders`, `POST/DELETE .../lines[...]` | `admin`, `branch_manager`, `employee` |
| Thanh toán đơn bán lẻ | `POST /api/v1/sales-orders/:id/checkout` | `admin`, `branch_manager`, `employee` |
| Nhập kho sản phẩm bán lẻ | `POST /api/v1/goods-receipts` (dùng chung WF-07) | `admin`, `branch_manager`, `employee` |

Khác với WF-07 (chỉ `admin` sửa được danh mục Extra), danh mục sản phẩm bán
lẻ mở thêm cho `branch_manager` — không có quyền ngang `employee` nào ở
nhóm "quản lý danh mục" trong cả hai hệ thống.
