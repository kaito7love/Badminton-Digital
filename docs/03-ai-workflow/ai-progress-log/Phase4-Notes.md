# Phase 4 — Ghi Chú & Quyết Định Kỹ Thuật

## 📌 Thuật Toán Tính Tiền Theo Khung Giờ (closeCourt)
Phiên chơi có thể vắt qua ranh giới giờ cao điểm ↔ thấp điểm.
Ví dụ: chơi từ 16:30 → 17:45 (cao điểm bắt đầu lúc 17:00):
- Đoạn 16:30–17:00 = 30 phút × giá thấp điểm
- Đoạn 17:00–17:45 = 45 phút × giá cao điểm

```
Thuật toán: Cắt phiên thành các đoạn theo ranh giới giờ peak/offpeak
→ Tính riêng từng đoạn → Cộng tổng
```

## 📌 Checkout Transaction Flow
```
checkoutSession() {
  sequelize.transaction(async (t) => {
    1. Lấy CourtSession (kèm SessionExtras)
    2. Tính courtFee + extrasFee
    3. Tạo Invoice
    4. Tạo Payment
    5. UPDATE customers.total_spent += totalAmount
    6. Cập nhật loyalty_tier nếu đạt ngưỡng
  })
}
```

## 📌 Open Questions
- Loyalty Tier thresholds: Đề xuất `silver` ≥ 1.000.000 VND / `gold` ≥ 5.000.000 VND — cần xác nhận.
- VietQR tích hợp: Có tích hợp sinh QR chuyển khoản thực sự không, hay chỉ placeholder URL?
