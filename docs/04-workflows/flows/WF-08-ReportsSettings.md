# WF-08 — Luồng Dashboard, Báo cáo & Cài đặt hệ thống (UC-19, UC-20, UC-21)

**Actor:** Admin, `branch_manager` (báo cáo); Admin only (cài đặt)  
**Use Cases:** UC-19 (Dashboard), UC-20 (Xuất báo cáo), UC-21 (Cài đặt hệ thống)

`reportRoutes.js` gắn `roleMiddleware(['admin', 'branch_manager'])` ở cấp
router — mọi endpoint từ mục A đến D đều dành cho Admin/`branch_manager`,
`employee` không xem được báo cáo/dashboard dù có quyền vận hành sân/booking/
checkout hằng ngày. Ngược lại `settingRoutes.js` (mục E–G) chỉ nhận
`['admin']` — `branch_manager` KHÔNG sửa được cài đặt hệ thống.

Mọi số liệu báo cáo đều **branch-scoped** (`ReportService.requireBranch` ném
400 "Không xác định được chi nhánh báo cáo" nếu thiếu `branchId`) — kể cả sau
khi Customer trở thành thực thể dùng chung toàn chuỗi (WF-05), doanh
thu/sân/booking/tồn kho trong các báo cáo này vẫn chỉ tính theo ĐÚNG 1 chi
nhánh đang hoạt động (chi nhánh Admin đang chọn, hoặc chi nhánh cố định của
`branch_manager`) — không có báo cáo tổng hợp toàn chuỗi ở các endpoint này.

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
ngày hôm sau. "Tỷ lệ lấp đầy" chia cho số sân `active` + `maintenance` (sân
`inactive` không tính vào mẫu số). "Tồn kho thấp" từ
`InventoryService.getLowStockCount(branchId)` — đếm số sản phẩm có
`ExtraStock.quantity` (bảng tồn kho theo chi nhánh, không còn là cột phẳng
`Extra.stockQuantity` cũ) ≤ ngưỡng cảnh báo, chỉ trong chi nhánh đang hoạt
động; chi tiết mô hình tồn kho mới xem `flows/WF-07-Accessories.md`.

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
