# WF-08 — Luồng Dashboard, Báo cáo & Cài đặt hệ thống (UC-19, UC-20, UC-21, UC-25)

**Actor:** Admin, `branch_manager` (báo cáo); Admin only (cài đặt)  
**Use Cases:** UC-19 (Dashboard), UC-20 (Xuất báo cáo), UC-21 (Cài đặt hệ thống), UC-25 (Doanh thu chi tiết & đối chiếu kho)

`reportRoutes.js` gắn `roleMiddleware(['admin', 'branch_manager'])` ở cấp
router — mọi endpoint từ mục A đến D.2 đều dành cho Admin/`branch_manager`,
`employee` không xem được báo cáo/dashboard dù có quyền vận hành sân/booking/
checkout hằng ngày. Ngược lại `settingRoutes.js` (mục E–G) chỉ nhận
`['admin']` — `branch_manager` KHÔNG sửa được cài đặt hệ thống.

Mọi số liệu báo cáo đều **branch-scoped** (`ReportService.requireBranch` ném
400 "Không xác định được chi nhánh báo cáo" nếu thiếu `branchId`) — kể cả sau
khi Customer trở thành thực thể dùng chung toàn chuỗi (WF-05), doanh
thu/sân/booking/tồn kho trong các báo cáo này vẫn chỉ tính theo ĐÚNG 1 chi
nhánh đang hoạt động (chi nhánh Admin đang chọn, hoặc chi nhánh cố định của
`branch_manager`) — không có báo cáo tổng hợp toàn chuỗi ở các endpoint này,
ngoại trừ `revenue-breakdown?compareBranches=true` (chỉ `admin`, mục D.1).

Hai báo cáo mới ở mục D.1/D.2 (thêm từ merge `feat/invoice-reporting`,
2026-08-16) là báo cáo ĐẦU TIÊN nhìn xuyên qua cả 2 trụ doanh thu — thuê sân
(WF-02/03/04) và bán lẻ dụng cụ (`flows/WF-09-Retail.md`) — cùng lúc; mục A–C
vẫn tách biệt sân/phụ kiện-trong-sân như trước, không có dữ liệu bán lẻ.

---

## A. Xem Dashboard thống kê (UC-19)

```
Admin / branch_manager
    │
    └─→ [GET /api/v1/reports/dashboard]
              │
              └─→ Hiển thị tổng quan realtime CỦA CHI NHÁNH ĐANG HOẠT ĐỘNG:
                  ┌────────────────────────────────────────────────┐
                  │ 💰 Doanh thu hôm nay:        2.450.000đ       │
                  │ 🏸 Sân đang hoạt động:        4 / 8            │
                  │ 📊 Tỷ lệ lấp đầy:            50%              │
                  │ ⚠️ Tồn kho thấp:              2 sản phẩm       │
                  ├────────────────────────────────────────────────┤
                  │ 🏆 Top sân được thuê nhiều (tuần):            │
                  │   1. Sân 3 — 48 lượt                          │
                  │   2. Sân 1 — 41 lượt                          │
                  │   3. Sân 5 — 38 lượt                          │
                  ├────────────────────────────────────────────────┤
                  │ 🥤 Top phụ kiện bán chạy (tuần):             │
                  │   1. Nước Aquafina — 120 chai                 │
                  │   2. Cầu lông — 85 quả                        │
                  └────────────────────────────────────────────────┘
```

"Doanh thu hôm nay" tính theo ngày giờ Việt Nam (`startOfLocalDay`/
`endOfLocalDay`, không phải mốc UTC 00:00), tránh đếm nhầm ca chơi khuya sang
ngày hôm sau — và **đã gộp cả doanh thu bán lẻ** (`flows/WF-09-Retail.md`):
số này cộng mọi `Payment.status='paid'` trong ngày của chi nhánh bất kể
`Invoice` gắn với `sessionId` (thuê sân) hay `salesOrderId` (bán lẻ), vì cả
hai đều dùng chung 1 bảng `Invoice`/`Payment`. "Tỷ lệ lấp đầy" chia cho số
sân `active` + `maintenance` (sân `inactive` không tính vào mẫu số). "Tồn
kho thấp" từ **2026-08-16 trở đi đã gộp cả 2 ledger tồn kho**:
`InventoryService.getLowStockCount(branchId)` (Extra — WF-07) CỘNG
`InventoryService.getLowStockCountForProducts(branchId)` (ProductVariant —
WF-09), mỗi bên so `quantity` với đúng ngưỡng cảnh báo của chính nó
(`Extra.lowStockThreshold` hoặc `ProductVariant.lowStockThreshold`); trước
merge retail-POS con số này chỉ tính Extra. "Top phụ kiện bán chạy" (mục
này) và "Top sân" **KHÔNG** gộp doanh số bán lẻ — vẫn chỉ đọc từ
`SessionExtra`/`CourtSession` như trước; muốn xem sản phẩm bán lẻ nào chạy
nhất phải dùng báo cáo đối chiếu kho (mục D.2) hoặc lịch sử đơn (WF-09 mục F).

---

## B. Báo cáo doanh thu theo kỳ (UC-20)

```
Admin / branch_manager
    │
    ├─→ Chọn kỳ báo cáo: daily | monthly | yearly, + khoảng ngày from/to (optional)
    │
    ├─→ [GET /api/v1/reports/revenue?period=monthly&from=2026-07-01&to=2026-07-31]
    │         → Trả về (đã lọc theo chi nhánh đang hoạt động):
    │           [ { date: '2026-07', totalRevenue: 48500000, totalTransactions: 312 } ]
    │
    └─→ Hiển thị dưới dạng bảng + biểu đồ cột
```

---

## C. Top sân & Top phụ kiện (UC-20)

```
Admin / branch_manager
    │
    ├─→ [GET /api/v1/reports/top-courts]
    │         → Top 5 sân có nhiều phiên chơi nhất (chi nhánh đang hoạt động)
    │           kèm tổng thời gian hoạt động (giây, cộng dồn `durationSeconds`)
    │
    └─→ [GET /api/v1/reports/top-accessories]
              → Top 5 phụ kiện bán chạy nhất (chi nhánh đang hoạt động)
                kèm tổng doanh thu từ phụ kiện đó
```

---

## D. Xuất báo cáo (UC-20)

```
Admin / branch_manager
    │
    ├─→ [GET /api/v1/reports/export-excel?period=&from=&to=]
    │         → Tải về file .xlsx của chi nhánh đang hoạt động
    │           (Tổng quan + Doanh thu + Top sân + Top phụ kiện + Phiên chơi)
    │
    └─→ [GET /api/v1/reports/export-pdf?period=&from=&to=]
              → Tải về file PDF cùng nội dung, định dạng in
```

Cả hai file xuất **chưa gồm** dữ liệu bán lẻ (WF-09) hay 2 báo cáo mới ở
mục D.1/D.2 bên dưới — `ReportService.getExportData` chỉ gọi summary/
revenue/top-courts/top-accessories/sessions như trước khi có retail POS.

---

## D.1. Báo cáo doanh thu chi tiết theo nguồn (UC-25) — mới

```
Admin / branch_manager
    │
    ├─→ [GET /api/v1/reports/revenue-breakdown?period=&from=&to=&compareBranches=]
    │         │
    │         ├─→ Tách doanh thu mỗi khoảng thời gian (bucket theo ngày/
    │         │     tháng/năm) thành 4 nguồn, đọc trực tiếp từ InvoiceLine
    │         │     (không phải Invoice tổng — tách được từng dòng):
    │         │       'court'         ← lineKind = 'court_time'  (tiền sân)
    │         │       'session_extra' ← lineKind='product' + referenceType=
    │         │                          'session_extra' (phụ kiện GỌI TRONG
    │         │                          SÂN — WF-07)
    │         │       'retail'        ← lineKind='product' + referenceType=
    │         │                          'sales_order_line' (bán lẻ tại quầy
    │         │                          — WF-09, KHÔNG liên quan tới sân)
    │         │       'discount'      ← lineKind = 'discount' (số âm)
    │         │
    │         ├─→ `compareBranches=true`: CHỈ có tác dụng khi gọi bằng role
    │         │     `admin` thật (kiểm tra ở controller, không phải query
    │         │     param quyết định) — khi đó bỏ qua chi nhánh đang chọn,
    │         │     group riêng theo từng `branchId` để so sánh toàn chuỗi.
    │         │     `branch_manager` gửi `compareBranches=true` vẫn bị ép về
    │         │     false, chỉ thấy đúng chi nhánh của mình.
    │         │
    │         └─→ Kèm `discounts[]`: tối đa 200 dòng giảm giá gần nhất, mỗi
    │               dòng có mã hóa đơn, chi nhánh, TÊN NHÂN VIÊN đã áp dụng
    │               giảm giá (truy ngược qua Payment→Employee→User)
    │
    └─→ Response luôn kèm `dataFrom: '2026-08-16'` — dữ liệu tách nguồn chỉ
        có từ ngày `invoice_lines` được đưa vào dùng (merge
        `feat/invoice-line-items`); hóa đơn tạo trước mốc này không có dòng
        chi tiết nên KHÔNG xuất hiện trong báo cáo này (vẫn tính đủ ở báo
        cáo doanh thu tổng UC-20 mục B vì đó đọc từ Invoice, không phải
        InvoiceLine)
```

Thiếu `branchId` (và không phải `compareBranches`) → `400` "Không xác định
được chi nhánh báo cáo" — cùng lỗi `ReportService.requireBranch` dùng chung
cho mọi báo cáo trong file này.

---

## D.2. Đối chiếu nhập-bán-tồn kho (UC-25) — mới

```
Admin / branch_manager
    │
    └─→ [GET /api/v1/reports/inventory-reconciliation?from=&to=]
              │
              └─→ Với MỖI item (cả Extra lẫn ProductVariant — WF-07 + WF-09
                    trộn chung, phân biệt bằng `itemType`) của chi nhánh
                    đang hoạt động, đối chiếu 2 nguồn số liệu độc lập:
                    ┌──────────────────────────────────────────────────┐
                    │ Nguồn 1 — Sổ nhật ký kho (stock_movements):      │
                    │   qtyIn (nhập), qtySoldLedger (đã trừ kho do      │
                    │   bán), qtyReturned (trả lại), qtyAdjustedNet     │
                    │   (điều chỉnh tăng/giảm/hỏng/mất, đã gộp dấu)     │
                    │                                                    │
                    │ Nguồn 2 — Hóa đơn thật (invoice_lines):          │
                    │   qtySoldInvoice (số lượng THỰC SỰ xuất hiện     │
                    │   trên 1 hóa đơn đã tạo, dù invoice đó paid hay   │
                    │   pending)                                        │
                    │                                                    │
                    │ soldDiscrepancy = (qtySoldLedger − qtyReturned)   │
                    │                    − qtySoldInvoice               │
                    └──────────────────────────────────────────────────┘
```

`soldDiscrepancy ≠ 0` là tín hiệu cảnh báo: kho đã bị trừ (qua
`InventoryService.postMovement type='sale'`) nhưng chưa từng có dòng hóa đơn
tương ứng — dấu hiệu thất thoát tiềm ẩn (VD: thêm phụ kiện vào phiên/đơn
hàng rồi phiên đó bị bỏ dở không checkout), **không phải lỗi sổ kho nội bộ**
(hai luồng trừ/hoàn kho tự thân luôn khớp nhau, đó là bất biến của
`InventoryService`). Số đã thêm-rồi-xóa dòng (add rồi remove ngay, hoặc trả
lại phụ kiện — mục H của WF-07 / mục C của WF-09) bị trừ ra trước khi so
sánh, nên KHÔNG bị báo nhầm là thất thoát.

`dataFrom` trả về 2 mốc riêng: `{ ledger: '2026-08-15', invoiceComparison:
'2026-08-16' }` — sổ nhật ký kho đầy đủ từ M4 (2026-08-15), nhưng cột so
sánh với hóa đơn chỉ đáng tin từ khi có `invoice_lines` (2026-08-16); trước
đó `qtySoldInvoice` sẽ là 0 giả tạo cho mọi item, đừng đọc `soldDiscrepancy`
của khoảng thời gian trước mốc này. Item không có bất kỳ hoạt động nào
trong kỳ (mọi số liệu đều 0) bị lọc bỏ khỏi kết quả.

---

## E. Cài đặt Bảng giá sân (UC-21)

```
Admin
    │
    ├─→ [Trang Cài đặt → Bảng giá]
    │
    ├─→ [PUT /api/v1/settings/pricing]
    │         Body:
    │         {
    │           "peakStartHour": 17,
    │           "peakEndHour": 22,
    │           "defaultPeakPrice": 120000,
    │           "defaultOffpeakPrice": 80000
    │         }
    │
    └─→ Giá được lưu vào bảng settings { key: 'pricing', value: {...} }
        Áp dụng ngay cho tất cả phiên chơi mới
```

---

## F. Cài đặt giờ hoạt động (UC-21)

```
Admin
    │
    ├─→ [PUT /api/v1/settings/operating-hours]
    │         Body:
    │         {
    │           "openTime": "06:00",
    │           "closeTime": "23:00",
    │           "daysOff": ["Sunday"]
    │         }
    │
    └─→ Lưu vào settings { key: 'operating_hours', value: {...} }
```

---

## G. Cài đặt thương hiệu (UC-21)

```
Admin
    │
    ├─→ [PUT /api/v1/settings/branding]
    │         Body:
    │         {
    │           "centerName": "Badminton Digital",
    │           "address": "123 Đường ABC, TP.HCM",
    │           "phone": "0901234567",
    │           "bankId": "MB",
    │           "bankAccount": "0987654321",
    │           "bankOwner": "NGUYEN VAN A",
    │           "theme": "dark"
    │         }
    │
    └─→ Thông tin hiển thị trên hóa đơn & QR thanh toán
```

---

## H. Sơ đồ luồng Admin tổng quan

```
[Dashboard]
    │
    ├──────────────────────────────────────────────────────┐
    │ UC-19                                                │
    │ Xem số liệu realtime                                 │
    │ (doanh thu, sân, khách, kho)                        │
    └──────────────────────────────────────────────────────┘
    │
    ├──────────────────────────────────────────────────────┐
    │ UC-20                                                │
    │ Chọn kỳ → Xem biểu đồ → Xuất Excel/PDF             │
    └──────────────────────────────────────────────────────┘
    │
    └──────────────────────────────────────────────────────┐
      UC-21                                                │
      Cài đặt giá sân | giờ hoạt động | thương hiệu       │
      → Áp dụng toàn hệ thống                             │
      └──────────────────────────────────────────────────┘
```
