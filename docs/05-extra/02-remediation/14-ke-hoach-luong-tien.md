# Kế hoạch: khoá các luồng tiền đang sai hoặc giả được (nhóm sửa 2/6)

- **Nhánh:** `fix/payment-money-flows` (đã fast-forward lên `main` mới, `8b45c89`)
- **Ngày:** 13/09/2026
- **Bối cảnh:** nhóm thứ hai trong thứ tự sửa của đợt kiểm tra trước deploy 12/09/2026, gồm 6 phát
  hiện `PAY-01`, `PAY-02`, `PAY-03`, `PAY-04`, `PAY-06`, `PAY-09`. Mục tiêu của nhánh:
  - tiền khách chuyển không bao giờ đi vào tài khoản demo;
  - không ai tự đánh dấu được hoá đơn "đã trả" khi chưa có tiền;
  - thu ngân không thu sai vì màn hình tự tính sai;
  - giảm giá tay có giới hạn và để lại dấu vết.

---

## 0. Lỗi và hậu quả (đã đọc lại code ngày 13/09)

| Mã | Lỗi | Hậu quả | Vị trí |
|---|---|---|---|
| PAY-01 | `generateVietQRUrl` mặc định `MB-0987654321`; cả 5 nơi gọi không truyền tài khoản nào, không có env hay setting | Mọi QR (đơn online, POS, checkout sân) trỏ vào tài khoản demo — tiền khách chuyển cho người lạ | `utils/vietqr.js:5`; `OnlineOrderService.js:100`, `PaymentService.js:205,251`, `SalesOrderService.js:493,529` |
| PAY-02 | Webhook công khai chỉ so secret khi `PAYMENT_WEBHOOK_SECRET` có giá trị (dev chưa đặt, `.env.example` không có). So bằng `!==`, không kiểm số tiền, không chặn một mã giao dịch ngân hàng dùng cho nhiều hoá đơn. `invoiceNo` tuần tự và hiện cho khách ở trang đơn | Khách gửi `POST /payments/webhook {"status":"paid","invoiceNo":"BD-1-…"}` → đơn chuyển khoản thành đã trả, `totalSpent` tăng, ra quầy nhận hàng | `paymentRoutes.js:9`, `paymentController.js:65`, `PaymentService.js:413-481` |
| PAY-03 | Thẻ sân và modal "Thanh Toán & Đóng sân" tự tính `Math.ceil(giờ × giá cao điểm)`: luôn giá cao điểm, không làm tròn nghìn, không biết chuyển sân. `confirmCheckout` bỏ qua `totalAmount` backend trả về | Chơi 2 giờ thấp điểm ở sân 100k/80k: modal hiện 200.000 đ, hoá đơn 160.000 đ. Thu ngân thu theo modal → lệch quỹ mỗi ca | `CourtsPage.jsx:33,375,663-690,239-251` |
| PAY-04 | `transferCourt` chỉ đổi `courtId`; checkout tính toàn bộ thời gian từ `startTime` theo giá sân đích | Sân 100k/60k chơi 17–19h, chuyển sang VIP 250k/150k, checkout 20h → 750.000 đ thay vì 450.000 đ; chuyển chiều ngược lại thì thu thiếu | `CourtService.js:387`, `PaymentService.js:63-73` |
| PAY-06 | `countUsage` chỉ đếm đơn `paid`; đơn chuyển khoản vừa đặt còn `open` nên không bị tính; webhook đổi sang `paid` không kiểm lại mã | Mã giảm 100k `perCustomerLimit = 1`: một khách đặt liền 5 đơn chuyển khoản, lần nào cũng đếm ra 0, trả cả 5 → dùng mã 5 lần | `VoucherService.js:75-88`, `OnlineOrderService.js:169-176` |
| PAY-09 | Giảm giá tay chỉ kiểm là số và kẹp ≤ tổng tiền: không trần theo vai trò, không lý do, không log riêng. POS cộng dồn với voucher. Chuỗi `"false"` của `isDiscountPercent` bị hiểu là % | Employee gọi `POST /payments/checkout {"discountAmount":100,"isDiscountPercent":true}` → hoá đơn 0 đ "đã thanh toán", tiền mặt thu ngoài sổ | `paymentValidation.js:16-17`, `paymentController.js:11`, `salesOrderValidation.js:40`, `priceCalculator.js:84-91`, `SalesOrderService.js:401`, `PosTab.jsx:268` |

**Tình trạng DB dev hôm nay** (truy vấn chỉ đọc):
- **Webhook:** `PAYMENT_WEBHOOK_SECRET` chưa đặt nên nhận mọi request. Đang có **3 giao dịch chuyển khoản
  `pending`** (3 hoá đơn `issued`) — một request webhook không cần gì là thành "đã trả".
- **Chuyển sân:** nhật ký có 11 lần; hiện không phiên nào đang chơi.
- **Voucher và giảm giá:** chưa có voucher nào. 7 hoá đơn có giảm giá tay, chưa hoá đơn nào bị giảm về 0.
- **Chỗ lưu tài khoản ngân hàng:** chưa có, cả ở `branches` lẫn `settings`.

---

## 1. Câu hỏi cần chủ dự án chốt trước khi code

Mỗi câu có đề xuất sẵn — bác nếu không đồng ý.

**Q1. Tài khoản nhận chuyển khoản: chung cả chuỗi hay riêng từng chi nhánh?** (backlog nhóm B mục 4)
- **Đề xuất:** chung cả chuỗi, cấu hình bằng biến môi trường:
  - `PAYMENT_BANK_ID`: mã ngân hàng theo VietQR, ví dụ `MB` hoặc BIN `970422`;
  - `PAYMENT_BANK_ACCOUNT_NO`;
  - `PAYMENT_BANK_ACCOUNT_NAME`.
- **Vì sao:** đổi số tài khoản nhận tiền là thao tác nhạy cảm nhất hệ thống. Nếu sửa được qua giao diện,
  chỉ cần một tài khoản admin bị lộ là tiền cả chuỗi chạy sang tài khoản khác. Để ở env thì phải có quyền
  vào server. Cách này không thêm bảng, API hay màn hình nào, và dịch vụ báo có ở Q2 thường cũng gắn với
  một tài khoản.
- **Nếu chọn riêng từng chi nhánh:** thêm 3 cột vào `branches`, API `PUT /branches/:id/bank-account` chỉ cho
  admin, một khung trên trang Cài đặt, ghi audit, và thêm request vào Postman để `docs:build` còn khớp 1-1.
  Phần PAY-01 lớn khoảng gấp đôi.

**Q2. Đã có dịch vụ báo có (SePay, Casso…) gọi webhook khi tiền về chưa?**
Không có dịch vụ đó thì không ai xác nhận chuyển khoản: đơn online tự huỷ sau 30 phút và trả hàng về kệ
dù khách đã chuyển tiền.
- **Đề xuất:**
  - **Chỉ bật chuyển khoản khi có đủ cả tài khoản ngân hàng lẫn `PAYMENT_WEBHOOK_SECRET`.** Thiếu một
    trong hai thì backend từ chối `transfer`, giao diện ẩn lựa chọn này.
  - Webhook giữ hợp đồng chung như hiện tại (`provider`, `providerReference`, `invoiceNo`, `status`) và
    **bắt buộc thêm `amount`**. Định dạng riêng của một dịch vụ cụ thể (chữ ký, tên trường) làm sau khi
    đã chọn dịch vụ.
  - Nút "quản lý xác nhận đã nhận tiền" — để bật chuyển khoản mà không cần dịch vụ báo có — thuộc
    `PAY-08`, không làm ở nhánh này.

**Q3. Trần giảm giá tay** (PAY-09, cũng là câu hỏi đang treo ở backlog nhóm B mục 1)
- **Đề xuất:**

  | Vai trò | Được giảm tay tối đa |
  |---|---|
  | `employee` | **10%** số tiền còn phải trả (ở POS là sau khi trừ voucher) |
  | `branch_manager`, `admin` | Không giới hạn |

  - **Mọi mức giảm tay đều bắt buộc lý do** (tối đa 200 ký tự), ghi vào dòng hoá đơn và nhật ký hoạt động.
  - **Vượt trần: chặn (403)**, thông báo nhờ quản lý thanh toán giúp. Không làm luồng "gửi duyệt" — cần màn
    hình chờ duyệt, thông báo, trạng thái treo, quá lớn cho nhánh này.
  - **Nơi lưu mức 10%:** setting `discount_policy`, mặc định 10 nếu chưa có. Admin sửa bằng một ô trên
    trang Cài đặt.

**Q4. Voucher trên đơn chuyển khoản đang chờ trả tiền có giữ lượt không?** (PAY-06)
- **Đề xuất:** **có.** Đơn online chuyển khoản chưa huỷ được tính là một lượt dùng mã. Khi được trả tiền,
  lượt đó thành "đã dùng"; khi bị huỷ hoặc hết hạn, lượt được nhả. Đơn POS và đơn online trả tiền mặt giữ
  như cũ: không giữ lượt, kiểm lại lúc thanh toán.
- **`PAY-07`** (hai quầy bấm thanh toán cùng lúc cho lượt cuối cùng): cách sửa chắc chắn là đổi mức cô
  lập transaction hoặc thêm bộ đếm trên voucher, dễ sinh deadlock nếu làm vội. Đề xuất để chung với việc
  xử lý deadlock (`RUN-02`, nhóm 6).

**Q5. Có làm kèm hai phần dính cùng đoạn code không?**
- **(a) Tính tiền sân chính xác ở mốc giao cao điểm (`PAY-18`) và bỏ vòng lặp 5 phút (phần CPU của
  `PAY-16`).** PAY-03 và PAY-04 đều gọi hàm tính tiền này. Viết lại theo khoảng thời gian thì số xem trước,
  số khi chuyển sân và số khi thanh toán cùng một cách tính, không lệch vài nghìn đồng ở mốc 17:00/22:00.
- **(b) Một phần `PAY-13`:**
  - QR đơn online ghi nội dung `HOA DON <invoiceNo>` thay vì `DH<orderId>` (webhook chỉ khớp được theo
    `invoiceNo`);
  - ẩn QR khi đã quá hạn 30 phút;
  - ghi nhật ký khi tiền về cho giao dịch đã huỷ, để quầy biết mà hoàn tiền.
- **Đề xuất:** làm cả hai. Phần còn lại của `PAY-16` (bắt xác nhận phiên mở quá 24 giờ) và `PAY-13` (không
  cho khách huỷ khi đang chờ chuyển khoản) để sau.

---

## 2. Thiết kế (theo các đề xuất ở mục 1)

### 2.1 Tài khoản nhận tiền — PAY-01

- **`utils/paymentConfig.js` (mới):**
  - `getTransferAccount()` đọc 3 biến ở Q1, thiếu biến nào thì trả `null`;
  - `isWebhookConfigured()`: `PAYMENT_WEBHOOK_SECRET` dài ≥ 32 ký tự;
  - `isTransferEnabled()` = có tài khoản **và** webhook đã cấu hình.
- **`utils/vietqr.js`:** bỏ giá trị mặc định `MB-0987654321`. `generateVietQRUrl` lấy tài khoản từ config;
  chuyển khoản chưa bật thì trả `null` — không bao giờ dựng QR trỏ tới tài khoản nào khác.
- **Chặn ở backend:** `POST /payments/checkout`, `POST /sales-orders/:id/checkout` và đặt đơn online nhận
  `paymentMethod: 'transfer'` khi chưa bật → 400 "Chuyển khoản chưa được bật…".
- **Báo cho giao diện:** `GET /public/branches` thêm trường `transferEnabled` cho từng chi nhánh (hiện mọi
  chi nhánh cùng giá trị, sẵn chỗ nếu sau này làm theo chi nhánh). Không thêm route mới.
- **Frontend:**
  - trang đặt hàng (`CheckoutPage`, vốn đã gọi `/public/branches`) ẩn lựa chọn chuyển khoản khi
    `transferEnabled` là false;
  - POS (`PosTab`) đọc cùng endpoint và bỏ `<option value="transfer">`.
- **Giao dịch chờ có sẵn:** giữ nguyên trạng thái `pending`; trang đơn không hiện QR khi chưa bật.

### 2.2 Webhook — PAY-02 (kèm một phần PAY-13 theo Q5b)

- **Chưa cấu hình thì đóng hẳn:** `PAYMENT_WEBHOOK_SECRET` thiếu hoặc ngắn hơn 32 ký tự → 503 "Webhook
  thanh toán chưa được cấu hình", ở mọi môi trường. Bỏ hẳn nhánh "không đặt secret thì cho qua".
- **So secret:** header `X-Webhook-Secret` so bằng `crypto.timingSafeEqual` trên sha256 của hai chuỗi, nên
  độ dài chuỗi gửi lên không làm lộ gì.
- **Body:** thêm `amount` bắt buộc, số nguyên VND ≥ 1.
- **Xử lý trong service:**

  | Tình huống | Kết quả |
  |---|---|
  | `amount` khác `payment.amount` | 409; giao dịch giữ `pending`; audit `payment.webhook_rejected` (lý do `amount_mismatch`, kèm payload) |
  | Cùng `provider` + `providerReference` đã xác nhận cho **giao dịch khác** | 409 + audit (lý do `reference_reused`); thêm unique index `(provider, provider_reference)` trên `payments` làm chốt cuối |
  | Giao dịch đã `cancelled`/`refunded` (tiền về muộn, sau khi huỷ) | 409 như cũ, **nhưng ghi audit** (lý do `payment_not_pending`) để quầy thấy và hoàn tiền |
  | Giao dịch đã `paid` với cùng `providerReference` (dịch vụ gửi lại) | 200, không cộng tiền lần hai (như hiện tại) |

- **Rollback an toàn:** `processWebhook` áp khuôn `if (!transaction.finished)` như các service khác (một
  phần `PAY-19`).
- **QR đơn online:** nội dung `HOA DON <invoiceNo>`, cùng quy ước với POS và checkout sân; `qrCodeFor` trả
  `null` khi `isPaymentExpired`.
- **`.env.example`:** thêm `PAYMENT_WEBHOOK_SECRET` và 3 biến tài khoản, để trống, kèm lệnh sinh chuỗi và
  chú thích "thiếu thì chuyển khoản tắt".

### 2.3 Modal tính tiền sân — PAY-03

- **Backend, không thêm route:** `GET /sessions/:sessionId` với phiên đang `playing` trả thêm
  `checkoutPreview` = `{ endTime, durationSeconds, courtFee, extrasFee, totalAmount }`. `endTime` là "bây
  giờ"; cách tính dùng chung với checkout.
- **Chốt giờ kết thúc:** checkout nhận `endTime` tuỳ chọn. Hợp lệ khi không trước `startTime`, không sau
  "bây giờ" và không cũ hơn 10 phút; sai thì 400. Nhờ vậy giờ kết thúc chốt đúng lúc mở modal, **số trên
  modal và số trên hoá đơn là một**.
- **Frontend `CourtsPage`:**
  - **Modal:** mở ra thì gọi preview, hiện tiền sân, phụ kiện, tổng do server tính. Xác nhận thì gửi
    `endTime` của preview. Thành công thì hiện hoá đơn vừa tạo (`invoiceNo`, `totalAmount` từ response)
    trước khi đóng.
  - **Thẻ sân:** bỏ số "tiền sân tạm tính" tính phía client, chỉ giữ thời gian đã chơi và tiền phụ kiện.
    Số đó hiện luôn sai (luôn giá cao điểm), còn muốn tính đúng liên tục thì phải gọi server theo nhịp
    đồng hồ. *Bác nếu muốn giữ một số tạm tính trên thẻ.*
  - **Công thức cũ:** xoá `Math.ceil(giờ × pricePerHour)` ở cả hai chỗ.

### 2.4 Chuyển sân — PAY-04

- **Migration `20260913100001-court-session-billing-segments`**, thêm 2 cột vào `court_sessions`:
  - `billed_from` DATETIME NULL — đầu đoạn đang tính giá; null nghĩa là tính từ `start_time`;
  - `accrued_court_fee` DECIMAL(12,2) NOT NULL DEFAULT 0 — tiền các đoạn trước, **chưa làm tròn**.
- **`transferCourt`:** trước khi đổi `courtId`, tính tiền đoạn `[billed_from ?? start_time, bây giờ]` theo
  giá **sân nguồn**, cộng vào `accrued_court_fee`, rồi đặt `billed_from = bây giờ`. Chuyển nhiều lần thì
  cộng dồn từng đoạn.
- **Hàm dùng chung `calculateSessionCourtFee(session, court, endTime, { peakStartHour, peakEndHour, timezone })`:**
  tiền sân = làm tròn nghìn của (`accrued_court_fee` + tiền đoạn cuối theo giá sân hiện tại). Checkout,
  preview ở 2.3 và `CourtService.closeCourt` cùng gọi hàm này.
- **Phiên đang chơi lúc deploy:** không có dữ liệu đoạn trước, nên tính như cũ từ `start_time`. DB dev hiện
  không có phiên nào đang chơi.

### 2.5 Hàm tính tiền sân theo khoảng — PAY-18 và phần CPU của PAY-16 (theo Q5a)

- **Cách tính mới:** `calculateCourtFee` tính theo **khoảng giao nhau** giữa phiên và khung cao điểm của
  từng ngày theo giờ chi nhánh. Mốc bắt đầu/kết thúc cao điểm của mỗi ngày quy về UTC bằng
  `zonedTimeToUtc` có sẵn trong `dateTime.js`, nên đúng cả ở múi giờ có DST. Số vòng lặp bằng số ngày,
  không phải số lát 5 phút.
- **Làm tròn và kết quả trả về:** giữ quy tắc làm tròn nghìn đồng như cũ. Trả thêm `rawFee` chưa làm tròn
  để 2.4 cộng dồn.
- **Test:** các test hiện có trong `priceCalculator.test.js` giữ nguyên kỳ vọng. Thêm các ca:
  - phiên cắt ngang mốc cao điểm ở phút lẻ;
  - phiên qua nửa đêm;
  - phiên 30 ngày tính xong dưới 50 ms;
  - chi nhánh ở múi giờ có DST.

### 2.6 Voucher đang chờ trả tiền — PAY-06 (theo Q4)

- **`VoucherService.countUsage`:** đếm đơn `status = 'paid'` **hoặc** (`status = 'open'` và
  `payment_deadline_at` không null) — tức là cả đơn chuyển khoản chưa huỷ. Đơn bị khách huỷ hoặc bị tác vụ
  quét hết hạn huỷ thì tự thôi được đếm.
- **`excludeOrderId`:** giữ nguyên, nên checkout một đơn đang giữ lượt không tự đếm chính mình.

### 2.7 Trần giảm giá — PAY-09 (theo Q3)

- **`utils/discountPolicy.js` (mới):** hàm thuần
  `assertManualDiscountAllowed({ actor, baseAmount, discountAmount, reason, policy })`, test được không cần
  DB. `PaymentService.checkout` và `SalesOrderService.checkout` cùng dùng. Hàm này:
  - làm tròn số tiền giảm về đồng nguyên;
  - có giảm mà thiếu lý do → 400;
  - `employee` giảm vượt `employeeMaxPercent` → 403.
- **Validation:**
  - `isDiscountPercent` dùng `.toBoolean()` và controller đọc giá trị đã chuẩn hoá (sửa lỗi chuỗi
    `"false"`);
  - giảm theo % thì tối đa 100;
  - thêm `discountReason`, tối đa 200 ký tự.
- **Dấu vết:** dòng hoá đơn `discount` ghi `Giảm giá: <lý do>`; audit `payment.discount_applied` ghi người
  thao tác, số tiền, % và lý do.
- **Setting `discount_policy` = `{ employeeMaxPercent: 10 }`:**
  - `SettingService.getDiscountPolicy()`, mặc định 10;
  - trang Cài đặt (admin) thêm một ô trong khung "Giá khung giờ", lưu bằng `PUT /settings` có sẵn;
  - `settingService` phía frontend thêm hàm `update(key, value)`.
- **POS (`PosTab`):**
  - ô "Giảm giá thêm" có thêm ô lý do, chỉ hiện khi số giảm > 0;
  - với `employee`, hiện gợi ý "tối đa X%";
  - hiện nguyên văn thông báo lỗi từ server.

---

## 3. File dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `backend/src/utils/paymentConfig.js` | **Mới** — 2.1 |
| `backend/src/utils/discountPolicy.js` | **Mới** — 2.7 |
| `backend/src/utils/vietqr.js` | Bỏ tài khoản demo, đọc config |
| `backend/src/utils/priceCalculator.js` | Tính theo khoảng, `rawFee`, `calculateSessionCourtFee` |
| `backend/src/controllers/paymentController.js` | Webhook đóng khi chưa cấu hình, `timingSafeEqual`, `amount`; checkout nhận `endTime`, `discountReason` |
| `backend/src/controllers/salesOrderController.js` | Truyền `discountReason` |
| `backend/src/services/PaymentService.js` | Checkout: hàm tính dùng chung, `endTime`, trần giảm giá, chặn transfer. Webhook: số tiền, mã giao dịch, audit từ chối, guard rollback |
| `backend/src/services/SalesOrderService.js` | Chặn transfer, trần giảm giá, QR từ config |
| `backend/src/services/OnlineOrderService.js` | Chặn transfer, QR `HOA DON <invoiceNo>`, ẩn QR quá hạn |
| `backend/src/services/VoucherService.js` | `countUsage` giữ lượt cho đơn chờ chuyển khoản |
| `backend/src/services/CourtService.js` | `transferCourt` chốt tiền đoạn; `closeCourt` dùng hàm chung |
| `backend/src/services/SessionService.js` | `checkoutPreview` cho phiên đang chơi |
| `backend/src/services/SettingService.js` | `getDiscountPolicy` |
| `backend/src/services/PublicCatalogService.js` | `transferEnabled` |
| `backend/src/validations/paymentValidation.js`, `salesOrderValidation.js` | `amount`, `endTime`, `discountReason`, `toBoolean` |
| `backend/src/models/CourtSession.js` | Hai cột mới |
| `backend/src/migrations/20260913100001-court-session-billing-segments.js` | **Mới** |
| `backend/src/migrations/20260913100002-payments-provider-reference-unique.js` | **Mới** |
| `backend/.env.example` | 4 biến thanh toán kèm chú thích |
| `backend/tests/` | **Mới:** `paymentConfig`, `webhookAuth`, `discountPolicy`, `courtFeeSegments`. **Mở rộng:** `priceCalculator`, `paymentValidation`, `onlineOrderService`, `voucherService` |
| `frontend/src/pages/Courts/CourtsPage.jsx` | Modal dùng preview và hiện hoá đơn; thẻ sân bỏ số tự tính |
| `frontend/src/pages/Cart/CheckoutPage.jsx` | Ẩn chuyển khoản khi tắt |
| `frontend/src/pages/Retail/PosTab.jsx` | Ẩn chuyển khoản khi tắt; lý do giảm giá |
| `frontend/src/pages/Settings/SettingsPage.jsx` | Ô trần giảm giá |
| `frontend/src/services/apiServices.js` | `settingService.update`; lấy chi tiết phiên nếu chưa có hàm |
| `postman/badminton_api_collection.json` + environment | Webhook thêm header `X-Webhook-Secret` và `amount`; biến `webhookSecret` |
| `backend/src/docs/openapi.yaml` | Sinh lại bằng `npm run docs:build` — không thêm route, chỉ đổi ví dụ body |
| `docs/APIDesign.md`, `docs/04-workflows/flows/WF-04-Payment.md` | Hợp đồng webhook mới, điều kiện bật chuyển khoản, trần giảm giá |
| `docs/DeploymentGuide.md` (mục 3.1, 10) | Biến thanh toán; checklist bật chuyển khoản |
| `docs/05-extra/02-remediation/00-tien-do.md` | Thêm mục 14 khi xong |
| `docs/05-extra/02-remediation/05-backlog-nhom-b.md` | Đánh dấu mục 1 và 4 đã chốt |

---

## 4. Kiểm thử thật

### 4.1 Tái hiện lỗi trước khi sửa

Chạy trên nhánh, **chưa đổi code**, dùng server dev và DB dev. Dữ liệu tạo ra được dọn ở cuối.

| # | Việc | Kỳ vọng trên code cũ |
|---|---|---|
| R1 | Khách đặt đơn online chuyển khoản; POS thanh toán chuyển khoản một đơn thử | QR trỏ `MB-0987654321` |
| R2 | Gửi webhook không header, chỉ có `invoiceNo` của đơn R1 | 200; đơn, hoá đơn, giao dịch thành `paid` |
| R3 | Mở sân, lùi `start_time` bằng SQL để phiên nằm trong khung thấp điểm; mở modal trên trình duyệt rồi thanh toán | Số trên modal khác `totalAmount` của hoá đơn |
| R4 | Mở sân thường, lùi `start_time`, chuyển sang sân đắt hơn, thanh toán | `courtFee` tính toàn bộ theo giá sân đích |
| R5 | Tạo voucher `perCustomerLimit = 1`; một khách đặt 2 đơn chuyển khoản dùng mã | Cả 2 đơn được nhận |
| R6 | Employee checkout `{"discountAmount":100,"isDiscountPercent":true}`; thêm một lần với `"isDiscountPercent":"false"` | Hoá đơn 0 đ `paid`; chuỗi `"false"` vẫn bị tính là % |

### 4.2 Sau khi sửa

**Backend.** Dùng server dev (chuyển khoản tắt) và một backend thứ hai chạy kèm biến môi trường thanh toán
giả lập. Không sửa `.env` dev.

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Chưa cấu hình: `/public/branches`; đặt đơn online, POS và checkout sân với `transfer`; gọi webhook | `transferEnabled: false`; 400; 503 |
| 2 | Có cấu hình: đặt đơn online chuyển khoản; lùi `payment_deadline_at` | QR chứa đúng số tài khoản cấu hình, nội dung `HOA DON <invoiceNo>`; khi quá hạn thì `qrCodeUrl: null` |
| 3 | Webhook sai secret / thiếu `amount` / sai `amount` / đúng | 401 / 400 / 409 + audit, giao dịch vẫn `pending` / 200 `paid`, `totalSpent` cộng đúng một lần |
| 4 | Gửi lại đúng webhook đó; dùng lại `providerReference` cho hoá đơn khác; webhook cho giao dịch đã huỷ | 200, không cộng lần hai; 409; 409 + audit `payment_not_pending` |
| 5 | Mở sân, lùi giờ, gọi `GET /sessions/:id`, rồi checkout với `endTime` của preview | `totalAmount` = `checkoutPreview.totalAmount`; `endTime` cũ hơn 10 phút hoặc ở tương lai → 400 |
| 6 | Chuyển sân một lần, và hai lần, rồi checkout | Tiền sân = tổng từng đoạn theo giá từng sân, khớp số tính tay; `accrued_court_fee`/`billed_from` đúng |
| 7 | Voucher `perCustomerLimit = 1`: đơn chuyển khoản thứ nhất rồi đơn thứ hai; huỷ đơn thứ nhất rồi đặt lại; lùi hạn và chạy tác vụ quét | Đơn thứ hai bị 400; huỷ xong đặt lại được; hết hạn thì nhả lượt |
| 8 | Employee giảm 10% có lý do / 11% / không lý do / gửi chuỗi `"false"`; branch_manager giảm 50% | 201 / 403 / 400 / không bị hiểu là % / 201. Dòng hoá đơn có lý do; có audit `payment.discount_applied` |
| 9 | Hồi quy: thanh toán tiền mặt ở sân, POS và đơn online; void hoá đơn; `/reports/dashboard` | Như trước khi sửa |

**Frontend — trình duyệt thật:**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 10 | Trang Sân: mở modal thanh toán của phiên đã lùi giờ, xác nhận | Số trên modal = số trên hoá đơn hiện ra sau khi thanh toán; thẻ sân không còn số tự tính |
| 11 | Trang đặt hàng và POS khi chuyển khoản tắt / bật | Không có / có lựa chọn chuyển khoản |
| 12 | POS bằng tài khoản employee: giảm vượt trần; thiếu lý do | Hiện thông báo lỗi rõ ràng; trong trần và có lý do thì thanh toán được |
| 13 | Trang Cài đặt: sửa trần giảm giá | Lưu được; checkout áp mức mới |

**Cài mới và test tự động:**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 14 | DB tạm: `db:migrate` từ DB trống; `db:migrate:undo` hai migration mới rồi migrate lại | 41/41 migration; undo/redo sạch |
| 15 | Jest (164 cũ + test mới), Vitest, build frontend, `docs:build` | Tất cả pass; `openapi.yaml` chỉ đổi phần webhook/checkout; 112 route vẫn khớp 1-1 |
| 16 | newman nhóm Payments với `runDestructive=true` và `webhookSecret` | Pass |

- **Trước khi migrate DB dev:** dump DB dev ra thư mục tạm.
- **Dọn dẹp sau khi test:**
  - xoá đơn, hoá đơn, giao dịch, voucher và phiên sân tạo khi test;
  - trả lại tồn kho;
  - xoá setting đã sửa thử;
  - DROP DB tạm;
  - không để lại biến thanh toán giả lập nào trong `.env` dev.

---

## 5. Ngoài phạm vi nhánh này

Các mục dưới đây chưa có trong 6 nhóm sửa của báo cáo, trừ những dòng ghi rõ nhóm. Đề xuất gom chúng thành
một đợt "luồng tiền 2" sau nhóm 4.

| Việc | Để ở đâu |
|---|---|
| Quản lý xác nhận tay đã nhận chuyển khoản; đơn POS chuyển khoản bị đánh dấu `paid` ngay (`PAY-08`) | Đợt luồng tiền 2, sau khi chốt Q2 |
| Hai quầy giành lượt voucher cuối cùng lúc (`PAY-07`); deadlock khi checkout (`PAY-14`); lỗi 500 khi hai lần thanh toán đồng thời của cùng khách (`PAY-15`) | Nhóm 6, cùng `RUN-02` |
| Báo cáo doanh thu theo nguồn cộng cả hoá đơn huỷ/chưa trả (`PAY-05`) | Đợt luồng tiền 2 (chỉ sửa truy vấn báo cáo) |
| Void không đổi trạng thái đơn, không trả lượt voucher (`PAY-10`); void phiên sân xong không checkout lại được (`PAY-11`) | Đợt luồng tiền 2 |
| Sửa được đơn online sau khi đã phát QR (`PAY-12`); giỏ POS hiện tổng khác số thực thu (`PAY-17`) | Đợt luồng tiền 2 |
| Không cho khách huỷ đơn đang chờ chuyển khoản; bắt xác nhận phiên mở quá 24 giờ (phần còn lại `PAY-13`, `PAY-16`) | Đợt luồng tiền 2 |
| Các ca biên còn lại của `PAY-19` (`Idempotency-Key` dài hơn 64 ký tự, đơn chuyển khoản 0 đ, `perCustomerLimit` với đơn POS không gắn khách) | Đợt luồng tiền 2 |
| Tài khoản ngân hàng theo từng chi nhánh qua giao diện | Chỉ làm nếu Q1 chọn phương án này |
| Định dạng webhook riêng của một dịch vụ báo có (chữ ký, tên trường) | Sau khi đã chọn dịch vụ (Q2) |

---

## 6. Kết quả thực hiện (13/09/2026)

**Trạng thái:** đã code + test thật; commit `085996f`, merge vào `main` ngày 14/09/2026 cùng nhóm 3 sau khi gộp
và test chung trên nhánh `test/merge-fix-groups-1-3` (xem `00-tien-do.md` mục 14–15). Chủ dự án duyệt "code đi" mà không trả
lời Q1–Q5, nên áp nguyên các đề xuất ở mục 1.

### 6.1 Khác với thiết kế ở mục 2–3

| Thiết kế | Thực tế | Vì sao |
|---|---|---|
| Migration `20260913100002-payments-provider-reference-unique` | **Bỏ** | Index `uk_payments_provider_reference (provider, provider_reference)` đã có từ `20260805000004-p1-production-safety`; migration mới vỡ "Duplicate key name" ngay lần chạy trên DB trống. Service vẫn kiểm mã dùng lại trước (409 + nhật ký), index cũ là chốt cuối |
| POS hiện gợi ý "tối đa X%" cho `employee` | Gợi ý không kèm con số | `GET /settings` chỉ admin đọc được, không thêm route mới. Con số trần nằm trong thông báo 403 hiện nguyên văn |
| Webhook tới giao dịch đã `paid`: 200 nếu cùng `providerReference` | Mã khác cũng 200, không cộng tiền, thêm nhật ký `already_paid` | Khách chuyển hai lần cần để lại dấu vết cho quầy hoàn tiền; trả 2xx để dịch vụ báo có không gửi lại liên tục |
| Tái hiện lỗi và kiểm thử trên DB dev, dọn dữ liệu sau | Chạy trên **bản sao** DB dev (`bd_g2_clone`, dựng từ bản dump), DROP sau khi xong | Không có dữ liệu test nào phải dọn khỏi DB dev. DB dev chỉ nhận migration mới (sau khi dump) |
| Request webhook trong collection Postman: thêm header + `amount`, vẫn gửi tới `{{invoiceNo}}` | Webhook dùng `{{webhookInvoiceNo}}`/`{{invoiceTotal}}`, chỉ lấy hoá đơn có tiền > 0; tự `SKIP` khi thiếu `webhookSecret` | Phiên vừa mở rồi checkout ngay ra hoá đơn 0đ, không qua được `amount ≥ 1` |

### 6.2 Kết quả kiểm thử

| # | Kịch bản | Kết quả |
|---|---|---|
| R1–R6 | Tái hiện trên code cũ (bản sao DB) | Đủ 6 lỗi: QR `MB-0987654321`; webhook trần → `paid` + cộng `totalSpent`; modal 226.331đ vs hoá đơn 151.000đ; chuyển sang VIP 300.000đ thay vì 180.000đ; mã `perCustomerLimit = 1` dùng 2 lần; employee ra hoá đơn 0đ, chuỗi `"false"` bị tính 50% |
| 1 | Chưa cấu hình | 4/4: `transferEnabled: false`; online/POS/sân nhận `transfer` → 400, tiền mặt vẫn được; webhook 503 có hay không header; đơn chờ cũ mất QR |
| 2–9 | Có cấu hình (backend thứ hai, env giả lập) | 23/23 |
| 10 | Trang Sân (trình duyệt) | Modal 121.000đ (tiền sân 96.000 + phụ kiện 25.000) = hoá đơn `BD-1-00000080`; thẻ sân không còn số tạm tính |
| 11 | Trang đặt hàng + POS | Bật: có "Chuyển khoản"; tắt: chỉ tiền mặt, trang đặt hàng báo chưa nhận chuyển khoản trước |
| 12 | POS bằng employee | Thiếu lý do → chặn ngay trên trang; 5.000đ/25.000đ → thông báo 403 nguyên văn; 2.500đ + lý do → `BD-1-00000081`, dòng hoá đơn và nhật ký có lý do |
| 13 | Trang Cài đặt | Lưu 15% → `discount_policy = {employeeMaxPercent: 15}`; employee giảm 12% qua được, 15,1% → 403 nêu 15% |
| 14 | DB trống | 3/3: 40/40 migration, undo xoá đúng 2 cột, migrate lại sạch |
| 15 | Tự động | Jest 231/231, Vitest 49/49, build frontend, `docs:build` khớp 1-1 112 route |
| 16 | newman toàn bộ collection | 116 request, 330 assertion, 0 lỗi |
| — | Smoke server dev sau khi migrate DB dev | 3/3, không thêm dòng nào ở bảng tiền và nhật ký |

**Dọn dẹp:** DROP `bd_g2_clone` và DB tạm của kịch bản 14; trả file sơ đồ sân mà newman ghi đè
(`backend/public/layouts/branch-1.json`); trả `.claude/launch.json` về bản commit; `backend/.env` không
đổi. Hai bản dump DB dev (trước khi tái hiện và ngay trước khi migrate) nằm trong thư mục tạm của phiên.
