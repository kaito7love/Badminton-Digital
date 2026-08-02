# WF-04 — Luồng Thanh toán & Hóa đơn (UC-18)

**Actor:** Nhân viên  
**Use Cases:** UC-18 (Thanh toán & xuất hóa đơn)  
**Tiền điều kiện:** CourtSession đã đóng (UC-07) hoặc đang mở (auto-close khi checkout)

---

## A. Luồng Checkout đầy đủ

```
Nhân viên
    │
    ├─→ [Màn hình Thanh toán] sau khi đóng sân
    │
    │   Hiển thị bảng chi tiết:
    │   ┌────────────────────────────────────────┐
    │   │ Phiên chơi: Sân 3 — 14:00 → 16:30     │
    │   │ Thời gian: 150 phút                    │
    │   │ Tiền sân:                 120.000đ     │
    │   │ Phụ kiện:                              │
    │   │   - Nước Aquafina × 2:    30.000đ      │
    │   │   - Cầu lông × 1:         25.000đ      │
    │   │ Tổng phụ kiện:            55.000đ      │
    │   │ ─────────────────────────────────────  │
    │   │ Tổng trước giảm giá:     175.000đ      │
    │   └────────────────────────────────────────┘
    │
    ├─→ Áp dụng giảm giá? (optional)
    │         ├─→ Giảm theo %: VD 10% → -17.500đ
    │         └─→ Giảm số tiền cố định: VD -20.000đ
    │
    ├─→ Chọn phương thức thanh toán:
    │         ├─→ [Tiền mặt]
    │         │       → Nhân tiền thật → Nhấn "Xác nhận đã thu tiền"
    │         │
    │         └─→ [Chuyển khoản]
    │                 → Hệ thống hiển thị mã VietQR:
    │                   Bank: MB | STK: 0987654321
    │                   Số tiền: 157.500đ
    │                   Nội dung: HOA DON BD9001
    │                 → Khách quét QR → Chuyển khoản
    │                 → Nhân viên xác nhận đã nhận
    │
    ├─→ [POST /api/v1/payments/checkout]
    │         │ DB Transaction:
    │         ├─→ Nếu session vẫn playing → auto endTime + tính courtFee
    │         ├─→ Tính Invoice totals
    │         ├─→ Tạo / cập nhật Invoice
    │         ├─→ Tạo Payment { status: 'paid', paidAt: NOW() }
    │         ├─→ UPDATE Customer.total_spent += totalAmount
    │         └─→ Cập nhật loyalty_tier nếu đạt ngưỡng
    │
    └─→ Response:
          invoiceId, totalAmount, qrCodeUrl (nếu transfer)
```

---

## B. Luồng tạo VietQR

```
paymentMethod = 'transfer'
    │
    └─→ generateVietQRUrl({
              bankId: 'MB',
              accountNo: '0987654321',
              accountName: 'BADMINTON DIGITAL',
              amount: 157500,
              addInfo: 'HOA DON BD9001'
          })
    │
    └─→ URL: https://img.vietqr.io/image/MB-0987654321-compact2.png
              ?amount=157500
              &addInfo=HOA%20DON%20BD9001
              &accountName=BADMINTON%20DIGITAL
```

---

## C. Luồng xem & xuất hóa đơn

```
Nhân viên / Admin / Khách hàng
    │
    ├─→ [GET /api/v1/invoices/:id]
    │       → Trả về chi tiết Invoice + Payment + Session + Extras
    │
    └─→ [GET /api/v1/invoices/:id/export-pdf]  (Admin / Employee only)
            → Trả về dữ liệu hóa đơn định dạng có thể in
```

---

## D. Sơ đồ luồng thanh toán tổng hợp

```
 UC-07 CloseCourt
       │
       ▼
[Session = closed, courtFee calculated]
       │
       ▼
UC-18 Checkout
       │
       ├─→ Áp dụng discount? → Tính totalAmount
       │
       ├─→ Cash ──────────────────────────────────┐
       │                                           │
       └─→ Transfer → VietQR → Khách quét        │
                                                   │
                              ┌────────────────────┘
                              ▼
                     Tạo Invoice + Payment
                     Update Customer.total_spent
                     Update loyalty_tier
                              │
                              ▼
                    Hóa đơn sẵn sàng ✅
                    (In tại quầy / Xuất PDF)
```

---

## E. Loyalty Tier cập nhật tự động

```
Sau khi checkout thành công:
    total_spent mới = total_spent cũ + totalAmount

    IF total_spent >= 15,000,000  → loyalty_tier = 'vip'
    IF total_spent >= 5,000,000   → loyalty_tier = 'gold'
    ELSE                          → loyalty_tier = 'normal'
```
