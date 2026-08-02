# WF-08 — Luồng Dashboard, Báo cáo & Cài đặt hệ thống (UC-19, UC-20, UC-21)

**Actor:** Admin  
**Use Cases:** UC-19 (Dashboard), UC-20 (Xuất báo cáo), UC-21 (Cài đặt hệ thống)

---

## A. Xem Dashboard thống kê (UC-19)

```
Admin
    │
    └─→ [GET /api/v1/reports/dashboard]
              │
              └─→ Hiển thị tổng quan realtime:
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

---

## B. Báo cáo doanh thu theo kỳ (UC-20)

```
Admin
    │
    ├─→ Chọn kỳ báo cáo: daily | monthly | yearly
    │
    ├─→ [GET /api/v1/reports/revenue?period=monthly]
    │         → Trả về:
    │           [ { date: '2026-07', totalRevenue: 48500000, totalTransactions: 312 } ]
    │
    └─→ Hiển thị dưới dạng bảng + biểu đồ cột
```

---

## C. Top sân & Top phụ kiện (UC-20)

```
Admin
    │
    ├─→ [GET /api/v1/reports/top-courts]
    │         → Top 5 sân có nhiều phiên chơi nhất
    │           kèm tổng thời gian hoạt động (giờ)
    │
    └─→ [GET /api/v1/reports/top-accessories]
              → Top 5 phụ kiện bán chạy nhất
                kèm tổng doanh thu từ phụ kiện đó
```

---

## D. Xuất báo cáo (UC-20)

```
Admin
    │
    ├─→ [GET /api/v1/reports/export-excel]
    │         → Tải về file .xlsx
    │           (Doanh thu + Phiên chơi + Phụ kiện)
    │
    └─→ [GET /api/v1/reports/export-pdf]
              → Tải về file PDF báo cáo tháng
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
