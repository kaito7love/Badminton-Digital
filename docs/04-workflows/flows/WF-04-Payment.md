# WF-04 — Luồng Thanh toán & Hóa đơn (UC-18)

**Actor:** Nhân viên, `branch_manager`, Admin  
**Use Cases:** UC-18 (Thanh toán & xuất hóa đơn)  
**Tiền điều kiện:** CourtSession đã đóng (UC-07) hoặc đang mở (auto-close khi checkout)

`POST /api/v1/payments/checkout` yêu cầu `roleMiddleware(['admin', 'branch_manager', 'employee'])`
và luôn branch-scoped: tìm session theo `{ id: sessionId, branchId }` — không
checkout được phiên của chi nhánh khác dù biết `sessionId`. `GET /api/v1/invoices/:id`
mở cho mọi vai trò đã đăng nhập (khách hàng chỉ xem được hóa đơn của chính
mình — 403 "Bạn không có quyền truy cập hóa đơn này" nếu khác; sai chi nhánh
→ 403 "Invoice không thuộc chi nhánh hiện tại"), riêng `export-pdf` giới hạn
`['admin', 'branch_manager', 'employee']`.

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
    │         ├─→ [Tiền mặt] → Nhận tiền thật → Nhấn "Xác nhận đã thu tiền"
    │         │       (payment được đánh dấu paid NGAY khi gọi checkout)
    │         │
    │         └─→ [Chuyển khoản]
    │                 → Hệ thống hiển thị mã VietQR:
    │                   Bank: MB | STK: 0987654321
    │                   Số tiền: 157.500đ
    │                   Nội dung: HOA DON BD9001
    │                 → Khách quét QR → Chuyển khoản
    │                 (checkout vẫn được gọi ngay để chốt Invoice, nhưng
    │                  Payment tạo ra ở trạng thái 'pending' — KHÔNG có thao
    │                  tác "nhân viên bấm xác nhận đã nhận tiền" nào ở đây;
    │                  chỉ chuyển 'paid' khi ngân hàng gọi webhook, xem mục B)
    │
    ├─→ [POST /api/v1/payments/checkout] { sessionId, paymentMethod, discountAmount?, isDiscountPercent? }
    │         │ Header tuỳ chọn `Idempotency-Key` (mặc định `session-{sessionId}`)
    │         │ — gọi lại với cùng key trả về đúng kết quả cũ, không tạo
    │         │ Invoice/Payment trùng
    │         │
    │         │ DB Transaction — PaymentService.checkout:
    │         ├─→ Nếu session vẫn playing → auto endTime + tính courtFee
    │         ├─→ Tính Invoice totals
    │         ├─→ Tạo / cập nhật Invoice { status: 'issued' }
    │         ├─→ Tạo Payment:
    │         │       paymentMethod = 'cash'      → status = 'paid', paidAt = NOW()
    │         │       paymentMethod = 'transfer'  → status = 'pending' (chờ webhook)
    │         ├─→ CHỈ khi payment đã 'paid' ngay (tiền mặt):
    │         │       Invoice → 'paid'; UPDATE Customer.total_spent += totalAmount;
    │         │       cập nhật loyalty_tier nếu đạt ngưỡng
    │         └─→ Phiên chơi đã có yêu cầu thanh toán rồi (payment tồn tại
    │               cho invoice này) → 409 "Phiên chơi này đã có yêu cầu thanh toán"
    │
    └─→ Response:
          invoiceId, totalAmount, paymentStatus ('paid' | 'pending'),
          qrCodeUrl (chỉ khi transfer)
```

Với chuyển khoản, `total_spent`/`loyalty_tier` của khách **chưa** cập nhật lúc
checkout — chỉ cập nhật khi `processWebhook` xác nhận thanh toán thành công
(mục B). Không có endpoint nào để nhân viên tự tay đánh dấu một payment
chuyển khoản là "đã nhận tiền" — xác nhận chỉ đến từ webhook ngân hàng.

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

### Xác nhận thanh toán chuyển khoản (webhook)

```
[POST /api/v1/payments/webhook]  ← public, KHÔNG qua authMiddleware
    │ Header X-Webhook-Secret phải khớp PAYMENT_WEBHOOK_SECRET, sai → 401
    │ Body: { provider, providerReference, status, invoiceNo, ...payload }
    │
    ├─→ status !== 'paid' → 400 "Trạng thái webhook không được hỗ trợ"
    ├─→ Không tìm thấy Invoice theo invoiceNo → 404 "Không tìm thấy hóa đơn"
    ├─→ Payment đã 'paid' → trả về luôn (idempotent, không xử lý lại)
    ├─→ Payment không ở 'pending'/'processing' → 409 "Giao dịch không thể
    │       chuyển sang trạng thái paid"
    └─→ DB Transaction: Payment → 'paid'; Invoice → 'paid';
          UPDATE Customer.total_spent += totalAmount; cập nhật loyalty_tier
          (đây mới là bước thật sự cộng total_spent cho thanh toán chuyển
          khoản — không phải lúc gọi checkout)
```

---

## C. Luồng xem & xuất hóa đơn

```
Nhân viên / branch_manager / Admin / Khách hàng (chỉ hóa đơn của chính mình)
    │
    ├─→ [GET /api/v1/invoices/:id]
    │       → Trả về chi tiết Invoice + Payment + Session + Extras
    │
    └─→ [GET /api/v1/invoices/:id/export-pdf]  (admin / branch_manager / employee only)
            → Trả về file PDF hóa đơn (buildInvoicePdf), không dành cho customer
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
       ├─→ Cash    → Tạo Invoice('issued'→'paid') + Payment('paid')
       │              → Update Customer.total_spent + loyalty_tier NGAY
       │              → Hóa đơn sẵn sàng ✅ (In tại quầy / Xuất PDF)
       │
       └─→ Transfer → Tạo Invoice('issued') + Payment('pending')
                    → VietQR → Khách quét → Chuyển khoản
                    → Ngân hàng gọi [POST /payments/webhook]
                    → Payment → 'paid', Invoice → 'paid'
                    → Update Customer.total_spent + loyalty_tier (LÚC NÀY,
                       không phải lúc checkout)
                    → Hóa đơn sẵn sàng ✅
```

---

## E. Loyalty Tier cập nhật tự động

```
Sau khi payment chuyển sang 'paid' (tiền mặt: ngay lúc checkout; chuyển
khoản: lúc webhook xác nhận — xem mục A/B):
    total_spent mới = total_spent cũ + totalAmount

    IF total_spent >= 15,000,000  → loyalty_tier = 'vip'
    IF total_spent >= 5,000,000   → loyalty_tier = 'gold'
    ELSE                          → loyalty_tier = 'normal'
```
