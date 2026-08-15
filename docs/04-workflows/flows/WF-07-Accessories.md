# WF-07 — Luồng Quản lý Phụ kiện & Tồn kho (UC-17)

**Actors:** Admin (CRUD danh mục sản phẩm, nhà cung cấp), Admin/Nhân viên (nhập kho, điều chỉnh kho, xem lịch sử kho), Nhân viên (gọi thêm vào phiên chơi)
**Use Cases:** UC-17 (Quản lý phụ kiện & tồn kho)

---

## Thay đổi mô hình dữ liệu (từ merge "hệ thống quản lý kho hàng")

Trước đây tồn kho là 1 cột phẳng `extras.stock_quantity` dùng chung cho toàn hệ
thống. Từ merge này, tồn kho được tách khỏi danh mục sản phẩm và quản lý theo
từng chi nhánh, có sổ nhật ký xuất/nhập:

| | Trước | Từ merge này |
|---|---|---|
| Danh mục sản phẩm (tên, giá, ngưỡng cảnh báo) | `extras` | `extras` — **không đổi**, vẫn dùng chung mọi chi nhánh |
| Số lượng tồn kho | `extras.stock_quantity` (1 số toàn hệ thống) | `extra_stocks` — 1 dòng theo mỗi cặp (sản phẩm, chi nhánh) |
| Giá vốn | Không có | `extra_stocks.average_cost` — bình quân gia quyền, tính lại mỗi lần nhập kho |
| Lịch sử biến động | Không có | `stock_movements` — 1 dòng cho mọi lần tăng/giảm, kèm loại giao dịch |
| Nhập kho | Sửa trực tiếp số tồn qua `PUT /accessories/:id` | Tạo **phiếu nhập kho** (`GoodsReceipt` + `GoodsReceiptItem`) qua nhà cung cấp |

Quy tắc bất biến trong code (`InventoryService.postMovement`, xem
`backend/src/services/InventoryService.js`): đây là **entry point duy nhất**
được phép đổi `extra_stocks.quantity` — không service nào khác được UPDATE cột
này trực tiếp. Mỗi lần gọi đều bắt buộc có transaction đang mở và luôn tạo
kèm đúng 1 dòng `stock_movements` trong cùng transaction với nghiệp vụ gốc
(nhập kho, bán ra khi gọi phụ kiện, trả hàng, hoặc điều chỉnh thủ công).

Migration `20260815000002-inventory-foundation.js` xoá cột
`extras.stock_quantity` và khởi tạo tồn kho = 0 cho mọi cặp (sản phẩm, chi
nhánh) — tồn kho thật phải được nhập lại qua phiếu nhập kho để có ledger sạch
từ đầu.

---

## A. Xem danh mục sản phẩm (mọi vai trò đã đăng nhập)

```
[GET /api/v1/accessories]
    │   (không yêu cầu role cụ thể — chỉ cần authMiddleware)
    │   Header X-Branch-Id xác định tồn kho hiển thị là của chi nhánh nào
    │   (admin: chi nhánh đang chọn trên bộ chuyển; nhân viên: luôn là
    │   branchId của chính mình — xem branchContextMiddleware)
    │
    └─→ Danh sách (danh mục dùng chung, tồn kho theo chi nhánh hiện tại):
          ┌────────────────────────────────────────────────────────┐
          │ Tên         │ Giá    │ Tồn kho (chi nhánh) │ Giá vốn BQ │
          ├─────────────┼────────┼──────────────────────┼───────────┤
          │ Nước Aqua   │ 15.000 │   48                 │  12.500   │
          │ Cầu lông    │ 25.000 │    3   ⚠️ Sắp hết     │  18.000   │
          │ Vợt thuê    │ 30.000 │   10                 │      —    │
          └────────────────────────────────────────────────────────┘
          * Cảnh báo "Low"/"Critical" tính ở frontend (ProductsTab.jsx):
              stock <= 0            → Critical
              stock <= lowStockThreshold → Low
              còn lại                → Normal
          * averageCost = null nếu sản phẩm chưa từng được nhập kho ở
            chi nhánh đó (chưa có dòng extra_stocks, hoặc quantity = 0
            và chưa nhập lần nào)
```

---

## B. Thêm / Sửa / Xóa sản phẩm trong danh mục (Admin)

```
Admin
    │
    ├─→ [Thêm] Nhập: Tên | Giá bán | Ngưỡng cảnh báo hàng thấp
    │       └─→ [POST /api/v1/accessories] → tồn kho khởi tạo = 0
    │           (không còn nhập "số lượng tồn kho" ở bước tạo sản phẩm —
    │            payload không có field này nữa; muốn có hàng phải dùng
    │            mục C "Nhập kho")
    │
    ├─→ [Sửa] Cập nhật: Tên | Giá | Ngưỡng cảnh báo
    │       └─→ [PUT /api/v1/accessories/:id]
    │           (KHÔNG còn sửa trực tiếp tồn kho ở đây — trước là
    │            "Tồn kho (nhập thêm)", nay đã tách hẳn sang mục C)
    │
    └─→ [Xóa] → [DELETE /api/v1/accessories/:id]
```

Chỉ `admin` mới gọi được `POST`/`PUT`/`DELETE` (`roleMiddleware(['admin'])`
trong `accessoryRoutes.js`). `GET` mở cho mọi vai trò đã đăng nhập.

---

## C. Nhập kho có phiếu (Admin / Nhân viên)

```
Admin / Nhân viên
    │
    ├─→ [Tab "Nhập kho"] → Chọn nhà cung cấp (không bắt buộc)
    │
    ├─→ Thêm dòng: Sản phẩm | Số lượng | Đơn giá nhập
    │       (nhiều dòng — mỗi dòng 1 sản phẩm; UI tự tính
    │        Tổng giá trị = Σ (số lượng × đơn giá))
    │
    ├─→ [POST /api/v1/goods-receipts] { supplierId?, note?, items: [...] }
    │         │
    │         ├─→ Validate (route, express-validator):
    │         │     items phải có ≥ 1 dòng, mỗi dòng có extraId (int),
    │         │     quantity ≥ 1 (int), unitCost ≥ 0
    │         ├─→ Validate lại ở service (phòng thủ 2 lớp):
    │         │     "Phiếu nhập kho cần ít nhất 1 dòng sản phẩm"
    │         │     "Số lượng dòng hàng phải là số nguyên dương"
    │         │     "Đơn giá nhập không hợp lệ"
    │         │     Không xác định branchId → "Không xác định được
    │         │       chi nhánh nhập kho"
    │         │
    │         │ [DB Transaction — GoodsReceiptService.createGoodsReceipt]
    │         ├─→ Sinh mã phiếu tuần tự theo chi nhánh:
    │         │     GR-{branchId}-{00000001, 00000002, ...}
    │         │     (BranchDocumentSequence, khoá FOR UPDATE — cùng cơ chế
    │         │      sinh số hoá đơn "BD-...")
    │         ├─→ Tạo GoodsReceipt { branchId, code, supplierId,
    │         │     receivedByUserId: người đang nhập, totalCost }
    │         ├─→ Với mỗi dòng hàng:
    │         │     ├─→ Tạo GoodsReceiptItem { extraId, quantity,
    │         │     │     unitCost, subtotal }
    │         │     └─→ InventoryService.postMovement({
    │         │           branchId, extraId, type: 'purchase_receipt',
    │         │           quantity, unitCost,
    │         │           referenceType: 'goods_receipt',
    │         │           referenceId: receipt.id })
    │         │           ├─→ Khoá dòng ExtraStock (SELECT ... FOR UPDATE),
    │         │           │     tạo mới quantity=0 nếu chi nhánh chưa từng
    │         │           │     có tồn kho sản phẩm này
    │         │           ├─→ Tính lại giá vốn bình quân gia quyền:
    │         │           │     newAvg = (oldQty×oldAvg + qty×unitCost)
    │         │           │              ÷ (oldQty + qty)
    │         │           ├─→ quantity += qty (nhập kho luôn là "incoming")
    │         │           └─→ Ghi 1 dòng StockMovement
    │         │                 (type: purchase_receipt)
    │         ├─→ Ghi AuditService: goods_receipt.created
    │         └─→ Commit transaction
    │
    └─→ Phiếu nhập kho tạo thành công ✅ — hiện trong "Lịch sử phiếu nhập"
        (Mã phiếu | Ngày | Nhà cung cấp | Người nhập | Tổng tiền)
```

`POST /api/v1/goods-receipts` yêu cầu role `admin` hoặc `employee`
(`goodsReceiptRoutes.js`). `GET /api/v1/goods-receipts` và
`GET /api/v1/goods-receipts/:id` cùng quyền, để xem lại chi tiết phiếu.

---

## D. Quản lý nhà cung cấp (Admin)

```
Admin
    │
    ├─→ [Tab "Nhà cung cấp"] — chỉ admin thấy tab này (ẩn ở UI, đồng thời
    │       chặn ở route: POST/PUT/DELETE roleMiddleware(['admin']))
    │
    ├─→ [Thêm] Nhập: Tên * | Điện thoại | Email | Địa chỉ | Mã số thuế | Ghi chú
    │       └─→ [POST /api/v1/suppliers]
    │           email sai định dạng → 400 "Invalid email"
    │           thiếu tên → 400 "Supplier name is required"
    │
    ├─→ [Sửa] → [PUT /api/v1/suppliers/:id]
    │
    └─→ [Xóa] → [DELETE /api/v1/suppliers/:id] (soft-delete, paranoid)
```

Nhà cung cấp **không** gắn theo chi nhánh — 1 danh sách dùng chung cho toàn
chuỗi khi tạo phiếu nhập kho ở bất kỳ chi nhánh nào. `GET /api/v1/suppliers`
(danh sách + chi tiết) mở cho `admin`/`employee`; chỉ `admin` được tạo/sửa/xóa.

---

## E. Lịch sử / sổ nhật ký xuất-nhập kho (Admin / Nhân viên)

```
[GET /api/v1/inventory/movements?extraId=&type=&from=&to=&page=]
    │
    └─→ Danh sách giao dịch kho của chi nhánh hiện tại, mới nhất trước
          (Thời gian | Sản phẩm | Loại | Số lượng | Đơn giá | Ghi chú)

[GET /api/v1/inventory/stock-levels]
    └─→ Tồn kho hiện tại theo sản phẩm, của chi nhánh hiện tại
```

8 loại giao dịch (`StockMovement.MOVEMENT_TYPES`), chia 2 nhóm theo chiều tác
động lên `quantity`:

| Loại (`type`) | Nhãn hiển thị | Chiều | Khi nào phát sinh |
|---|---|---|---|
| `opening_balance` | Số dư đầu kỳ | Vào | Khởi tạo tồn đầu (dự phòng, hiện chưa có luồng UI tạo trực tiếp) |
| `purchase_receipt` | Nhập kho | Vào | Tạo phiếu nhập kho (mục C) — có `unitCost`, ảnh hưởng giá vốn BQ |
| `sale` | Bán hàng | Ra | Gọi phụ kiện vào phiên chơi (mục G) |
| `sale_return` | Trả hàng | Vào | Trả lại phụ kiện chưa dùng từ phiên chơi (mục H) |
| `adjustment_in` | Điều chỉnh tăng | Vào | Điều chỉnh thủ công (mục F) |
| `adjustment_out` | Điều chỉnh giảm | Ra | Điều chỉnh thủ công (mục F) |
| `damaged` | Hàng hỏng | Ra | Điều chỉnh thủ công (mục F) |
| `lost` | Thất lạc | Ra | Điều chỉnh thủ công (mục F) |

Chỉ `purchase_receipt` làm thay đổi `average_cost` (giá vốn bình quân gia
quyền); các loại còn lại chỉ đổi `quantity`.

---

## F. Điều chỉnh kho thủ công (Admin / Nhân viên)

```
Admin / Nhân viên
    │
    ├─→ [Tab "Lịch sử kho"] → nút "⚠️ Điều chỉnh kho"
    │
    ├─→ Chọn: Sản phẩm | Loại (Điều chỉnh tăng/giảm, Hàng hỏng, Thất lạc)
    │         | Số lượng | Lý do * (bắt buộc)
    │
    ├─→ [POST /api/v1/inventory/adjustments]
    │         │ { extraId, type, quantity, note }
    │         ├─→ Validate route: type ∈ [adjustment_in, adjustment_out,
    │         │     damaged, lost]; thiếu note → 400 "note (lý do điều
    │         │     chỉnh) is required"
    │         ├─→ Validate service (double-check): note rỗng → "Lý do
    │         │     điều chỉnh kho là bắt buộc"
    │         │
    │         │ [DB Transaction — InventoryService.createManualAdjustment]
    │         ├─→ postMovement({ type, quantity, note,
    │         │     referenceType: 'manual' })
    │         │     ├─→ Loại "ra" (adjustment_out/damaged/lost) mà vượt
    │         │     │     tồn hiện có → 400 "Không đủ tồn kho tại chi
    │         │     │     nhánh này. Hiện có: {N}"
    │         │     └─→ Ghi StockMovement
    │         ├─→ Ghi AuditService: stock_movement.adjusted
    │         └─→ Commit
    │
    └─→ Điều chỉnh được ghi nhận ✅ — xuất hiện ngay trong lịch sử kho
```

---

## G. Gọi thêm phụ kiện vào sân đang chơi (Nhân viên — UC-17)

```
Nhân viên
    │
    ├─→ [Màn hình sân đang chơi] → Nhấn "Gọi thêm"
    │
    ├─→ Chọn phụ kiện + nhập số lượng
    │
    ├─→ [POST /api/v1/sessions/:sessionId/extras] { extraId, quantity }
    │         │ DB Transaction — AccessoryService.addSessionExtra
    │         ├─→ Tìm CourtSession theo (id, branchId hiện tại), khoá FOR UPDATE
    │         │       ├─→ Không thấy → 404 "Court session not found"
    │         │       └─→ status !== 'playing' → 400 "Cannot add
    │         │             accessories to a closed court session"
    │         ├─→ Tìm Extra → không thấy → 404 "Accessory not found"
    │         ├─→ Tạo SessionExtra { sessionId, extraId, quantity,
    │         │     unitPrice: extra.price, subtotal }
    │         ├─→ InventoryService.postMovement({ branchId: session.branchId,
    │         │     extraId, type: 'sale', quantity,
    │         │     referenceType: 'session_extra',
    │         │     referenceId: sessionExtra.id })
    │         │       └─→ Không đủ tồn kho tại chi nhánh của phiên sân
    │         │             → 400 "Không đủ tồn kho tại chi nhánh này.
    │         │               Hiện có: {N}"
    │         │           (thay cho thông báo cũ "Insufficient stock.
    │         │            Available: N" — nay dùng chung message tiếng
    │         │            Việt của InventoryService cho mọi luồng trừ kho)
    │         └─→ Ghi AuditService: session_extra.added
    │
    └─→ Phụ kiện được ghi vào phiên chơi ✅
        "Nước Aquafina × 2 — 30.000đ đã được thêm"
        (Response không còn kèm flag "low_stock" như bản cũ — cảnh báo sắp
         hết hàng nay chỉ tính khi xem lại danh sách sản phẩm, mục A)
```

---

## H. Trả lại phụ kiện chưa dùng trong phiên đang chơi (Nhân viên) — mới

```
Nhân viên
    │
    ├─→ [Màn hình sân đang chơi] → phụ kiện đã gọi → "Trả lại"
    │
    ├─→ Nhập số lượng trả
    │
    ├─→ [POST /api/v1/sessions/:sessionId/extras/return]
    │         { extraId, returnQuantity }
    │         │ DB Transaction — AccessoryService.returnSessionExtra
    │         ├─→ Session phải đang 'playing', cùng logic 404/400 như mục G
    │         ├─→ Tìm SessionExtra (sessionId, extraId)
    │         │       └─→ Không có → 404 "This accessory was not added
    │         │             to the current session"
    │         ├─→ returnQuantity > quantity đã mua → 400 "Return quantity
    │         │     ({X}) exceeds purchased quantity ({Y})"
    │         ├─→ InventoryService.postMovement({ type: 'sale_return',
    │         │     quantity: returnQuantity }) → cộng lại tồn kho đúng
    │         │     chi nhánh của phiên sân (không đổi giá vốn BQ)
    │         ├─→ Trả hết (newQuantity = 0) → xoá luôn SessionExtra
    │         │   Trả một phần → cập nhật quantity & subtotal còn lại
    │         └─→ Ghi AuditService: session_extra.returned
    │
    └─→ Tồn kho được hoàn lại ✅, chi phí phiên chơi giảm tương ứng
```

---

## I. Cảnh báo tồn kho thấp

```
Không còn tính ở response của API trừ kho (khác bản cũ) — nay là:

1) Danh sách sản phẩm (mục A), tính riêng theo chi nhánh đang xem:
     stockQuantity <= 0                    → "Critical"
     stockQuantity <= lowStockThreshold    → "Low"
     còn lại                                → "Normal"

2) InventoryService.getLowStockCount(branchId) — đếm số sản phẩm dưới
   ngưỡng của 1 chi nhánh, dùng cho widget cảnh báo trên Dashboard Admin
   (xem WF-Admin §5)
```

---

## Bảng vai trò & quyền hạn

| Hành động | Endpoint | Vai trò được phép |
|---|---|---|
| Xem danh mục sản phẩm | `GET /api/v1/accessories` | Mọi vai trò đã đăng nhập |
| Thêm/Sửa/Xóa sản phẩm | `POST/PUT/DELETE /api/v1/accessories` | `admin` |
| Xem nhà cung cấp | `GET /api/v1/suppliers` | `admin`, `employee` |
| Thêm/Sửa/Xóa nhà cung cấp | `POST/PUT/DELETE /api/v1/suppliers` | `admin` |
| Tạo/xem phiếu nhập kho | `POST/GET /api/v1/goods-receipts` | `admin`, `employee` |
| Xem lịch sử/tồn kho | `GET /api/v1/inventory/movements`, `/stock-levels` | `admin`, `employee` |
| Điều chỉnh kho thủ công | `POST /api/v1/inventory/adjustments` | `admin`, `employee` |
| Gọi thêm / trả phụ kiện vào phiên chơi | `POST /api/v1/sessions/:id/extras[/return]` | `admin`, `employee` |

> Ghi chú: các route trên thực chất khai báo quyền là
> `['admin', 'branch_manager', 'employee']` trong code
> (`supplierRoutes.js`, `goodsReceiptRoutes.js`, `inventoryRoutes.js`,
> `sessionRoutes.js`). Vai trò `branch_manager` đã có sẵn trong bảng `roles`
> (migration `20260815300002-add-branch-manager-role.js`, seed
> `20260815300003-seed-branch-managers.js`) nhưng không xuất hiện trong danh
> sách 3 vai trò của hệ thống theo tài liệu tổng quan (`admin`/`employee`/
> `customer`) — cần xác nhận đây là vai trò đang được triển khai dở hay chỉ
> mới ở tầng dữ liệu/route, chưa có giao diện riêng.
