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
    ├─→ Trang Sân → "Đóng Sân & Tính Tiền"
    │         → [GET /api/v1/sessions/:sessionId] → checkoutPreview (server tính,
    │           trình duyệt không tự nhân giờ chơi với giá nữa)
    │
    │   Modal hiển thị:
    │   ┌────────────────────────────────────────┐
    │   │ Khách hàng:               Anh Hùng     │
    │   │ Thời gian chơi:           02:30:00     │
    │   │ Tính đến:                 16:30:00     │
    │   │ Tiền sân:                 150.000đ     │
    │   │ Phụ kiện:                  55.000đ     │
    │   │ ─────────────────────────────────────  │
    │   │ TỔNG CỘNG:                205.000đ     │
    │   └────────────────────────────────────────┘
    │   Tiền sân = accrued_court_fee (các đoạn trước khi đổi sân, theo giá sân cũ)
    │            + đoạn cuối theo giá sân hiện tại, cắt đúng khung cao điểm theo giờ
    │              chi nhánh, làm tròn 1.000đ một lần ở cuối.
    │
    ├─→ Áp dụng giảm giá? (optional, API — trang Sân hiện chỉ thu tiền mặt không giảm)
    │         ├─→ Giảm theo %: VD 10% → -20.500đ
    │         ├─→ Giảm số tiền cố định: VD -20.000đ
    │         ├─→ Bắt buộc `discountReason` (tối đa 200 ký tự), thiếu → 400
    │         └─→ `employee` tối đa `discount_policy.employeeMaxPercent` (mặc định 10%),
    │               vượt → 403 "Nhờ quản lý chi nhánh thanh toán giúp";
    │               `branch_manager`/`admin` không giới hạn
    │
    ├─→ Chọn phương thức thanh toán:
    │         ├─→ [Tiền mặt] → Nhận tiền thật → Nhấn "Xác nhận đã thu tiền"
    │         │       (payment được đánh dấu paid NGAY khi gọi checkout)
    │         │
    │         └─→ [Chuyển khoản] — chỉ nhận khi đã cấu hình PAYMENT_BANK_* +
    │                 PAYMENT_WEBHOOK_SECRET, chưa có → 400 (giao diện ẩn lựa chọn này)
    │                 → Hệ thống hiển thị mã VietQR:
    │                   Bank/STK: theo PAYMENT_BANK_ID / PAYMENT_BANK_ACCOUNT_NO
    │                   Số tiền: 184.500đ
    │                   Nội dung: HOA DON BD-1-00000009
    │                 → Khách quét QR → Chuyển khoản
    │                 (checkout vẫn được gọi ngay để chốt Invoice, nhưng
    │                  Payment tạo ra ở trạng thái 'pending' — KHÔNG có thao
    │                  tác "nhân viên bấm xác nhận đã nhận tiền" nào ở đây;
    │                  chỉ chuyển 'paid' khi ngân hàng gọi webhook, xem mục B)
    │
    ├─→ [POST /api/v1/payments/checkout]
    │         { sessionId, paymentMethod, discountAmount?, isDiscountPercent?, discountReason?, endTime? }
    │         │ Header tuỳ chọn `Idempotency-Key` (mặc định `session-{sessionId}`)
    │         │ — gọi lại với cùng key trả về đúng kết quả cũ, không tạo
    │         │ Invoice/Payment trùng
    │         │
    │         │ DB Transaction — PaymentService.checkout:
    │         ├─→ Nếu session vẫn playing → endTime = `endTime` gửi lên (mốc của
    │         │       checkoutPreview: không trước giờ mở sân/lần đổi sân gần nhất,
    │         │       không ở tương lai, không cũ quá 10 phút — sai → 400) hoặc NOW;
    │         │       tính courtFee bằng calculateSessionCourtFee
    │         ├─→ Quy giảm giá tay ra đồng, kiểm lý do + trần theo vai trò
    │         ├─→ Tính Invoice totals
    │         ├─→ Tạo / cập nhật Invoice { status: 'issued' }; dòng `discount`
    │         │       ghi "Giảm giá: <lý do>"
    │         ├─→ Tạo Payment:
    │         │       paymentMethod = 'cash'      → status = 'paid', paidAt = NOW()
    │         │       paymentMethod = 'transfer'  → status = 'pending' (chờ webhook)
    │         ├─→ CHỈ khi payment đã 'paid' ngay (tiền mặt):
    │         │       Invoice → 'paid'; UPDATE Customer.total_spent += totalAmount;
    │         │       cập nhật loyalty_tier nếu đạt ngưỡng
    │         ├─→ Có giảm tay → nhật ký `payment.discount_applied` (người làm, vai trò,
    │         │       số tiền, %, lý do)
    │         └─→ Phiên chơi đã có yêu cầu thanh toán rồi (payment tồn tại
    │               cho invoice này) → 409 "Phiên chơi này đã có yêu cầu thanh toán"
    │
    └─→ Response:
          invoiceId, invoiceNo, courtFee, extrasFee, discountAmount, totalAmount,
          paymentStatus ('paid' | 'pending'), qrCodeUrl (chỉ khi transfer)
          → Modal hiện hoá đơn vừa tạo trước khi đóng
```

Với chuyển khoản, `total_spent`/`loyalty_tier` của khách **chưa** cập nhật lúc
checkout — chỉ cập nhật khi `processWebhook` xác nhận thanh toán thành công
(mục B). Không có endpoint nào để nhân viên tự tay đánh dấu một payment
chuyển khoản là "đã nhận tiền" — xác nhận chỉ đến từ webhook ngân hàng.

**Đổi sân giữa phiên** (`POST /courts/:id/transfer`): trước khi đổi `court_id`,
`CourtService.transferCourt` chốt tiền đoạn vừa chơi theo giá **sân nguồn** vào
`court_sessions.accrued_court_fee` (chưa làm tròn) và đặt `billed_from` = lúc đổi.
Checkout, đóng sân và xem trước đều cộng phần này — không còn tính cả phiên theo
giá sân đích.

---

## B. Luồng tạo VietQR

```
paymentMethod = 'transfer'
    │
    ├─→ Chuyển khoản bật khi có ĐỦ (utils/paymentConfig.js):
    │         PAYMENT_BANK_ID, PAYMENT_BANK_ACCOUNT_NO, PAYMENT_BANK_ACCOUNT_NAME
    │         + PAYMENT_WEBHOOK_SECRET dài >= 32 ký tự
    │   Thiếu → generateVietQRUrl trả null; checkout sân, POS và đặt đơn online
    │   nhận `transfer` → 400; `GET /public/branches` báo `transferEnabled: false`.
    │   Không còn tài khoản mặc định nào trong code.
    │
    └─→ generateVietQRUrl({ amount: 184500, addInfo: 'HOA DON BD-1-00000009' })
    │
    └─→ URL: https://img.vietqr.io/image/<PAYMENT_BANK_ID>-<PAYMENT_BANK_ACCOUNT_NO>-compact2.png
              ?amount=184500
              &addInfo=HOA%20DON%20BD-1-00000009
              &accountName=<PAYMENT_BANK_ACCOUNT_NAME>
```

Nội dung chuyển khoản luôn là `HOA DON <invoiceNo>` — ở checkout sân, POS và cả
đơn online (trước đây đơn online ghi `DH<orderId>`, webhook không khớp được).

### Xác nhận thanh toán chuyển khoản (webhook)

```
[POST /api/v1/payments/webhook]  ← public, KHÔNG qua authMiddleware
    │ middleware/paymentWebhookAuth.js (chạy trước validation):
    │   PAYMENT_WEBHOOK_SECRET chưa cấu hình / ngắn hơn 32 ký tự → 503
    │   Header X-Webhook-Secret thiếu hoặc sai (so bằng timingSafeEqual) → 401
    │ Body: { provider, providerReference, invoiceNo, amount, status, ...payload }
    │   thiếu `amount` (số nguyên VND >= 1) → 400
    │
    ├─→ status !== 'paid' → 400 "Trạng thái webhook không được hỗ trợ"
    ├─→ Không tìm thấy Invoice theo invoiceNo → 404 "Không tìm thấy hóa đơn"
    ├─→ provider + providerReference đã xác nhận cho giao dịch KHÁC
    │       → 409 + nhật ký `payment.webhook_rejected` (reference_reused)
    │       (unique index uk_payments_provider_reference — có từ migration
    │        20260805000004 — là chốt cuối khi hai webhook trùng mã tới cùng lúc)
    ├─→ Payment đã 'paid' → 200, không xử lý lại
    │       (mã giao dịch khác mã đã ghi → thêm nhật ký `already_paid`: khách
    │        có thể đã chuyển hai lần, quầy cần hoàn tiền)
    ├─→ Payment 'cancelled'/'refunded' (tiền về sau khi đơn huỷ/hết hạn)
    │       → 409 + nhật ký `payment_not_pending`
    ├─→ amount ≠ payment.amount → 409 + nhật ký `amount_mismatch`, giữ 'pending'
    └─→ DB Transaction: Payment → 'paid'; Invoice → 'paid';
          UPDATE Customer.total_spent += totalAmount; cập nhật loyalty_tier
          (đây mới là bước thật sự cộng total_spent cho thanh toán chuyển
          khoản — không phải lúc gọi checkout)
```

Nhật ký từ chối được commit trước khi trả lỗi — xem ở màn hình Nhật ký hoạt
động (action `payment.webhook_rejected`, `newValues.reason`).

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
