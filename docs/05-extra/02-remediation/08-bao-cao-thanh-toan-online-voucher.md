# Báo cáo: thanh toán online (VietQR) + mã giảm giá — đã làm gì, kiểm chứng ra sao

**Cập nhật:** 21/08/2026 (tối — mục 5.2 đã vá cả 3, xem 5.3 cho phần bổ sung QR ở POS)
**Nhánh:** `claude/customer-badminton-accessories-pages-nsz9k5`
**Tài liệu kiểm thử đi kèm:** `../../TestCases-ThanhToanOnline-Voucher.md`

Tài liệu này là báo cáo tổng kết 2 giai đoạn của luồng thanh toán bán lẻ. Phần
"đã làm" mô tả thiết kế và lý do chọn; phần "kiểm chứng" nêu bằng chứng đo được
trên MySQL thật, gồm cả **7 lỗi do chính bộ test phát hiện trong mã của 2 giai
đoạn này và đã vá**.

---

## 1. Bối cảnh

Sau khi có cửa hàng phụ kiện cho khách tự đặt, luồng thanh toán còn 2 khoảng trống:

1. Khách đặt xong **không trả tiền trước được** — phải tới quầy mới thanh toán, nên
   shop không có gì bảo chứng đơn, còn khách thì không chốt được giao dịch.
2. **Không có mã giảm giá** — công cụ khuyến mãi cơ bản nhất của một shop bán lẻ.

Chủ dự án chốt hướng: làm cho **cả hai luồng bán hàng** (khách tự đặt online *và*
nhân viên bán tại quầy), chia làm 2 giai đoạn, giai đoạn 1 trước.

---

## 2. Giai đoạn 1 — Thanh toán chuyển khoản qua VietQR

### 2.1. Đã làm

Khách chọn 1 trong 2 cách trả tiền ngay ở bước xác nhận đơn:

| | Tiền mặt tại quầy | Chuyển khoản trước |
|---|---|---|
| Hoá đơn | Nhân viên xuất khi khách tới lấy | **Tạo ngay lúc đặt** |
| Giao dịch | Tạo lúc thanh toán | Tạo ngay, `status='pending'` |
| Xác nhận trả tiền | Nhân viên bấm thanh toán | **Webhook ngân hàng** |
| Bỏ quên đơn | Giữ hàng tới khi khách huỷ | **Tự huỷ sau 30 phút**, hàng về kệ |

**Quy tắc 30 phút** (do chủ dự án chốt): đủ để khách mở app ngân hàng, đủ ngắn để
hàng không bị giam vô thời hạn vì một đơn không ai quay lại trả tiền.

### 2.2. Những chỗ đáng lưu ý về thiết kế

- **Không dựng bảng đơn hàng thứ hai.** Đơn online dùng chung `sales_orders` với đơn
  quầy, chỉ khác `channel='online'`. Nhờ vậy doanh thu/tồn kho/báo cáo không phải cộng
  thêm một nguồn số liệu mới.
- **Trừ kho ngay lúc đặt**, không đợi thanh toán — khách đặt xong lái xe tới nơi mới
  biết hết hàng là hỏng cả buổi. Đổi lại, mọi đường huỷ đơn (khách tự huỷ, hết hạn
  thanh toán) đều **bắt buộc hoàn kho**.
- **Mốc hạn đặt trong cùng transaction tạo đơn** — đơn không sống được nếu bước tồn kho
  rollback, nên không có chuyện đặt hạn cho một đơn rồi lại không có đơn nào để hết hạn.
- **Tác vụ quét nền mỗi 5 phút** xử lý từng đơn trong transaction riêng: một đơn lỗi
  không kéo các đơn khác theo. Sau khi khoá dòng còn kiểm tra lại trạng thái, phòng
  trường hợp đơn vừa được thanh toán hoặc vừa bị khách huỷ ngay giữa lúc quét.

### 2.3. Lỗi có sẵn phát hiện được trong lúc làm

- **`PaymentService.processWebhook` chỉ xử lý hoá đơn của phiên chơi sân, bỏ qua hoàn
  toàn hoá đơn đơn hàng.** Nghĩa là mọi thanh toán chuyển khoản của đơn bán lẻ sẽ kẹt ở
  `pending` vĩnh viễn, không có đường nào đánh dấu đã trả. Đã vá: tách nhánh rõ ràng
  giữa `salesOrderId` và `sessionId`. Kiểm chứng trên MySQL thật: sau khi gọi webhook,
  đơn → `paid`, hoá đơn → `paid`, `customers.total_spent` cộng đúng 525.000đ.
- **Migration `20260815300002` chiếm nhầm `id=1` của role `admin`** — migration chạy
  trước seeder trên bảng `roles` rỗng nên auto-increment cấp `id=1` cho `branch_manager`,
  đụng khoá chính với seeder admin chạy sau, **chặn đứng mọi lần cài mới từ đầu**. Đã vá
  bằng cách chỉ định `id: 4` (đã kiểm: không chỗ nào trong mã nguồn hard-code ID role).

---

## 3. Giai đoạn 2 — Mã giảm giá

### 3.1. Đã làm

Một bảng `vouchers` dùng chung toàn chuỗi, hỗ trợ:

| Thuộc tính | Ý nghĩa |
|---|---|
| `discountType` | `percent` (theo %) hoặc `flat` (số tiền cố định) |
| `maxDiscountAmount` | Mức trần khi giảm theo % — "giảm 20% tối đa 50k" |
| `minOrderAmount` | Đơn tối thiểu mới dùng được |
| `startsAt` / `endsAt` | Khung thời gian hiệu lực |
| `usageLimit` | Tổng số lượt dùng của cả mã |
| `perCustomerLimit` | Số lượt mỗi khách |
| `isActive` | Bật/tắt |

Áp được ở **cả hai luồng**: khách nhập mã ở trang xác nhận đơn; nhân viên nhập mã ở
màn hình bán hàng, **cộng dồn được với giảm giá tay** của thu ngân.

### 3.2. Hai quyết định thiết kế chính

**a) Không có bảng "lượt đã dùng" riêng.** Số lượt đếm trực tiếp bằng
`COUNT(sales_orders)` theo `voucher_id`, loại các đơn `cancelled`. Đây là cùng nguyên
tắc "huỷ thì trả lại" đã dùng cho tồn kho — **huỷ đơn tự động nhả lại đúng 1 lượt dùng
mã, không cần dọn dẹp gì thêm**, không có trạng thái nào để lệch.

**b) Khoá dòng voucher trong transaction của nơi gọi.** `validateAndCompute` bắt buộc
nhận `transaction` và khoá dòng `FOR UPDATE`, để hai đơn cùng giành lượt cuối cùng thì
người khoá được trước mới qua — người sau đọc lại `COUNT` đã tính cả đơn vừa chèn.

**c) Không xoá cứng mã.** `sales_orders.voucher_id` tham chiếu `RESTRICT`; một mã đã
từng dùng mà xoá cứng là gãy lịch sử đơn cũ. Ngừng áp dụng bằng `isActive=false`.

**d) `voucherCode` lưu kèm dạng ảnh chụp** trên đơn — mã gốc có thể bị sửa sau, đơn cũ
vẫn phải hiện đúng mã đã dùng lúc đó.

---

## 4. Kiểm chứng

### 4.1. Cách kiểm

Dựng lại **MySQL 8.0 thật** từ DB rỗng (`npm run migrate` + seed), chạy backend và
frontend thật, rồi:

- **51 ca kiểm thử tích hợp** qua API thật, chia 3 nhóm chạy song song (quản trị mã /
  khách đặt online / bán tại quầy). Mọi ca có nhắc tới dữ liệu đều đối chiếu bằng
  **truy vấn SQL trực tiếp**, không chỉ tin response API.
- **20 bước kiểm thử giao diện** bằng Playwright trên web thật, có ảnh chụp từng bước.
- **113 unit test** (Jest).

Chi tiết từng ca: `../../TestCases-ThanhToanOnline-Voucher.md`.

### 4.2. Kết quả

**51/51 ca tích hợp PASS, 113/113 unit test PASS** — sau khi vá 7 lỗi nêu dưới.

Vài ca đáng chú ý đã kiểm được bằng số liệu DB:

- Huỷ đơn **nhả lại đúng 1 lượt dùng mã** (lượt 1→0, đặt lại cùng mã thành công).
- Huỷ đơn chuyển khoản: đơn → `cancelled`, hoá đơn → `void`, giao dịch → `cancelled`,
  **tồn kho hoàn đúng** (+2 đơn vị).
- Mức trần giảm hoạt động đúng: đơn 1.000.000đ với mã "10% tối đa 50.000đ" → giảm đúng
  **50.000đ**, không phải 100.000đ.
- Mã giảm cố định 50.000đ cho đơn 30.000đ → giảm **30.000đ**, đơn không thể xuống âm.
- POS **cộng dồn** đúng: mã 50.000đ + giảm tay 20.000đ → hoá đơn ghi 70.000đ, hai dòng
  giảm giá tách bạch.
- Thanh toán gọi 2 lần chỉ tạo **1** giao dịch (`idempotency_key`).

### 4.3. 7 lỗi bộ test phát hiện trong mã của chính 2 giai đoạn này — đã vá

| # | Lỗi | Mức | Đã vá bằng |
|---|---|---|---|
| 1 | **Số tiền giảm bị "đóng băng"**, không kiểm lại lúc thanh toán → áp mã lúc giỏ "đẹp" rồi sửa giỏ là vượt được *mọi* ràng buộc của mã | Nghiêm trọng | `checkout` tính lại mã trên giỏ cuối cùng, kèm `excludeOrderId` để đơn không tự đếm mình |
| 2 | `PUT /vouchers/:id` **bỏ qua chốt chặn "% không quá 100"** mà `POST` có → sửa mã thành 150%, giảm trọn giá trị đơn | Nghiêm trọng | Tách `assertConsistent()` dùng chung cho tạo lẫn sửa, kiểm trên giá trị sau khi ghép |
| 3 | **Giảm giá tay không bị chặn trần** → đơn 25.000đ ghi được giảm 999.999đ vào sổ | Trung bình | Chặn trong khoảng `[0, tiền hàng − giảm từ mã]` |
| 4 | Chuỗi quá dài rơi xuống MySQL thành **HTTP 500** thay vì 400 | Trung bình | `isLength({max})` ở validation + `maxLength` ở ô nhập |
| 5 | Không kiểm `endsAt` phải sau `startsAt` → tạo được mã vô dụng vĩnh viễn | Thấp | Kiểm trong `assertConsistent()` |
| 6 | Số tiền giảm **không làm tròn về đồng nguyên** (33.333,3đ) | Thấp | `Math.round()` |
| 7 | `PUT` không giữ bất biến "mã flat thì không có mức trần" | Thấp | Áp cùng quy tắc như `create` |

**Bằng chứng cụ thể của lỗi #1** — hoá đơn #4 trước khi vá:

```
tiền hàng 25.000đ | giảm 55.000đ | tổng 0đ
các dòng hoá đơn: sản phẩm +25.000, giảm giá −55.000  →  cộng lại = −30.000đ
```

Hoá đơn tự mâu thuẫn với chính nó. Sau khi vá, cùng kịch bản đó bị chặn ở
`checkout` với thông báo "Đơn hàng cần tối thiểu 200.000đ mới dùng được mã này",
và các hoá đơn mới đều khớp tuyệt đối giữa `total_amount` và tổng các dòng.

Mỗi lỗi đều có một ca kiểm chứng **tái hiện đúng kịch bản khai thác cũ** (nhóm F trong
tài liệu test). Có thêm ca F7 để chắc chắn **không vá quá tay** — đơn hợp lệ dùng mã
`usageLimit=1` vẫn thanh toán được bình thường.

---

## 5. Vấn đề tồn tại sẵn — mới báo cáo, **chưa** sửa

### 5.1. Đã sửa thêm trong đợt này (ngoài 7 lỗi voucher ở trên)

- **CI đang fail.** `dateTime.test.js` dùng `getHours()` — đọc theo giờ *máy* — để kiểm
  một hàm trả về mốc theo giờ *Việt Nam*, nên đỏ trên runner UTC. Đọc kỹ `dateTime.js`
  thì bản thân hàm đã nhận tham số múi giờ và hoàn toàn độc lập với giờ máy — **lỗi nằm
  ở test, không phải ở hàm**. Đã viết lại test: dựng mốc bằng `Date.UTC(...)`, kiểm bằng
  chính `localDateString`/`localTimeString`, thêm 1 ca kiểm chi nhánh ở múi giờ khác.
  Đã chạy PASS ở UTC, Asia/Ho_Chi_Minh, America/New_York, Pacific/Kiritimati.
  *Không đụng `ci.yml`* — đặt `TZ` ở đó chỉ che đi một phép kiểm sai và giấu luôn các
  hồi quy phụ thuộc giờ máy về sau.
- **Nhân viên không có chi nhánh.** Seeder gán `branch_id` cho nhân viên; migration
  `20260821100001` backfill dòng cũ rồi đặt lại `NOT NULL` cho `employees.branch_id`.
  Thu ngân mẫu nay dùng được màn hình bán hàng mà không cần chọn chi nhánh tay.
- **Hai seeder hỏng chặn việc cài mới.** `20260815100001` đổi căn cứ chặn từ *số tồn kho*
  (seeder trước luôn tạo, nên luôn kích hoạt oan) sang *sổ nhật ký kho + phiếu nhập* —
  đúng ý định ghi trong chính comment của nó là "tránh đè mất số liệu thật nếu ai đó đã
  Nhập kho tay". `20260816300001` tra thu ngân theo `branch_id` thay vì ghi cứng id 14/15
  vốn không tồn tại.

  Kết quả: `npm run migrate && npm run seed` nay **chạy trọn vẹn từ DB rỗng** (35
  migration + 7 seeder), tạo đủ 3 chi nhánh có tồn kho và 14 đơn hàng mẫu, không cần
  thao tác tay nào.

- **Ràng buộc `branch_id NOT NULL` chưa bao giờ có hiệu lực** trên cả 6 bảng đa chi
  nhánh. Migration M1 có `changeColumn(allowNull: false)` nhưng truyền kèm `references`,
  nên trên MySQL nó vừa không đặt được `NOT NULL` vừa gắn thêm một khoá ngoại trùng lặp —
  kiểm `INFORMATION_SCHEMA` thấy cả 6 bảng đều `IS_NULLABLE = YES`. Migration
  `20260821200001` backfill rồi áp `NOT NULL` cho 5 bảng còn lại; seeder cũng gán
  `branch_id` cho 4 sân mẫu (trước đó chèn thiếu, đúng cùng lỗi như nhân viên).

  Backfill **suy từ quan hệ cha**, không gán cứng chi nhánh 1: booking theo sân, phiên
  chơi theo sân, hoá đơn theo phiên/đơn hàng, thanh toán theo hoá đơn. Kiểm bằng cách lưu
  snapshot chi nhánh thật của 34 dòng trải trên cả 3 chi nhánh, `NULL` sạch rồi chạy lại
  → **34/34 về đúng chi nhánh gốc, 0 sai**. Chi tiết các ca kiểm: mục 8.3 tài liệu test.

- **Khoá ngoại `branch_id` trùng lặp.** Cùng lỗi `changeColumn` kèm `references` của M1
  để lại hai ràng buộc y hệt nhau trên mỗi bảng trong 6 bảng (`*_branch_id_foreign_idx`
  từ `addColumn` và `*_ibfk_N` từ `changeColumn`) — cùng trỏ `branches(id)`, cùng
  CASCADE/RESTRICT, khiến MySQL kiểm tra hai lần mỗi lần ghi. Migration `20260821300001`
  giữ lại đúng một ràng buộc mỗi bảng, tra `INFORMATION_SCHEMA` lúc chạy thay vì ghi cứng
  tên (đuôi `_ibfk_N` do MySQL đánh số theo thứ tự tạo nên mỗi nơi một khác).

  Kiểm chứng quan trọng nhất là **toàn vẹn tham chiếu không suy giảm**: chèn `branch_id`
  không tồn tại vẫn bị từ chối bởi chính ràng buộc còn lại, và xoá chi nhánh đang có sân
  vẫn bị `RESTRICT`. Chỉ số không bị đụng tới. Chi tiết: mục 8.4 tài liệu test.

- **Chuẩn hoá múi giờ: DB lưu UTC, hiển thị theo chi nhánh.** Trước đây
  `config.js` không đặt `timezone` cho Sequelize nên DATETIME được ghi theo giờ
  LOCAL của tiến trình Node — cột chỉ lưu "20:00" mà không kèm múi giờ. Đo thực
  nghiệm cho thấy hậu quả: ghi trên server VN ra `2026-08-20 20:00:00`, đọc trên
  server Mỹ thành 03:00 ngày 21 — **dời server là sai lệch toàn bộ dữ liệu lịch sử**.

  Đã xử lý trọn gói:
  - `config.js` đặt `timezone: '+00:00'` cho cả 3 môi trường.
  - Migration `20260821400001` đổi **78 cột DATETIME** từ giờ VN sang UTC. Tra
    cột từ `INFORMATION_SCHEMA` nên không sót, và **không bao giờ chạm** 4 cột
    DATE/TIME (`bookings.booking_date`, `start_time`, `end_time`,
    `employees.hired_at`) — đó là giờ treo tường, đổi sang UTC là hỏng lịch đặt sân.
    VN không có DST nên trừ cứng 7 giờ là chính xác tuyệt đối. Nơi triển khai vốn
    chạy UTC thì đặt `LEGACY_DB_TIMEZONE_OFFSET=0` để không dịch gì.
  - `priceCalculator` nhận múi giờ chi nhánh thay vì `getHours()` (giờ máy chủ) —
    **chỗ nhạy cảm tiền bạc nhất**: một phiên 18:00 giờ VN đọc trên server Mỹ ra
    6 giờ sáng và bị tính giá thấp điểm, thu thiếu tiền khách mà không ai hay.
  - Frontend: helper `utils/datetime.js` hiển thị theo `branches.timezone`. Trước
    đó 12 chỗ tự gọi `toLocaleString('vi-VN')` — lấy múi giờ MÁY NGƯỜI XEM, nên
    ngồi ở VN mở chi nhánh Mỹ sẽ ra giờ VN.

  Kiểm chứng: round-trip `down()`/`up()` khớp tuyệt đối 14/14 dòng; cột giờ treo
  tường giữ nguyên "18:00 ngày 20/8"; server chạy giờ VN nay ghi đúng UTC và đọc
  lại đúng nguyên mốc; cùng một phiên chơi cho giá cao điểm ở chi nhánh VN và
  thấp điểm ở chi nhánh Mỹ. 121 test backend PASS ở UTC, VN và New York.

### 5.2. Còn tồn tại — mới báo cáo, chưa sửa ~~→ ✅ cả 3 đã vá 21/08/2026 (tối)~~

Ghi chú lúc phát hiện (21/08, giữa buổi) vẫn giữ nguyên bên dưới để đối chiếu; đã kiểm
chứng lại trên **DB chính (dữ liệu thật)** sau khi vá, `npm test` 121/121 PASS.

1. ~~`POST /auth/login` trả **500** khi cùng tài khoản đăng nhập đồng thời
   (`OptimisticLockError` không được bắt).~~
   **✅ Đã vá.** `AuthService.login` cập nhật `refreshToken` bằng `User.update()` trực tiếp
   thay vì `user.save()` (vốn kiểm `version` — optimistic locking — nên request thứ hai
   ném lỗi không bắt). Không có lý do nghiệp vụ để coi 2 lần đăng nhập cùng tài khoản là
   xung đột cần chặn. Kiểm trên DB chính: bắn 2 request login đồng thời cùng tài khoản —
   cả hai đều 200, không còn 500.
2. ~~Đơn online chuyển khoản tạo hoá đơn nhưng **không tạo dòng hoá đơn** — xem chi tiết
   hoá đơn của đơn online sẽ trống, trong khi đơn POS thì có đủ.~~
   **✅ Đã vá.** `OnlineOrderService.placeOrder` giờ `InvoiceLine.bulkCreate` ngay sau khi
   tạo `Invoice` trong nhánh `isTransfer`, mirror đúng khuôn `SalesOrderService.checkout`
   đang dùng cho đơn POS (kèm dòng giảm giá nếu có áp mã). Kiểm trên DB chính: đặt đơn
   online chuyển khoản — hoá đơn tạo ra có đúng số dòng khớp giỏ hàng (trước khi vá: 0
   dòng).
3. ~~`countUsage` tính cả đơn `open` → đơn quầy bỏ dở giữ một lượt mã vĩnh viễn.~~
   **✅ Đã vá.** Đổi điều kiện đếm từ "khác `cancelled`" sang "đúng `paid`" — chỉ đơn đã
   thanh toán thật mới tính là một lượt dùng mã, khớp đúng nguyên tắc "huỷ/bỏ dở thì trả
   lại" đã ghi ở đầu `VoucherService.js`. Kiểm trên DB chính: đơn A áp mã `usageLimit=1`
   rồi bỏ dở (không thanh toán, không huỷ) — đơn B vẫn áp được cùng mã (trước khi vá bị từ
   chối "đã hết lượt sử dụng").
   > Đánh đổi cần biết: đơn **online chuyển khoản đang chờ thanh toán** (trạng thái `open`,
   > trong cửa sổ 30 phút) giờ cũng không giữ chỗ lượt mã nữa — về lý thuyết 2 khách có
   > thể cùng "đặt được" mã `usageLimit=1` trong lúc cả hai đơn đều chưa thanh toán. Không
   > phải lỗi mới (đây là đánh đổi giữa 2 kịch bản), khe hở hẹp (tối đa 30 phút, cần trùng
   > đúng 1 mã hiếm) và chưa được báo cáo ở đâu — ghi lại để theo dõi, chưa xử lý thêm.

### 5.3. Bổ sung khi review (không phải lỗi — tính năng còn thiếu, cùng chủ đề thanh toán)

**QR chuyển khoản ở POS bán lẻ.** Backend `SalesOrderService.checkout` vốn **đã** trả sẵn
`qrCodeUrl` khi chọn `paymentMethod: 'transfer'` (dùng chung `generateVietQRUrl` với luồng
khách tự đặt online) — nhưng frontend `PosTab.jsx` chưa từng hiển thị nó, chỉ báo "Thanh
toán thành công" bất kể phương thức, kể cả khi tiền chưa thực sự về. Đã bổ sung:
- `SalesOrderService.getOrderById` thêm include `Invoice`/`Payment` (trước chỉ có dòng
  hàng) để trang POS đọc lại được `paymentStatus`.
- `PosTab.jsx`: khi `paymentMethod === 'transfer'` và chưa `paid`, hiện banner "⏳ Chờ
  khách chuyển khoản" kèm ảnh QR + nút "Kiểm tra đã thanh toán chưa" (gọi lại
  `GET /sales-orders/:id`, không tự động polling). Không cần dựng thêm endpoint xác nhận
  tay — webhook `POST /payments/webhook` sẵn dùng chung cho cả hoá đơn online lẫn POS.

Kiểm chứng trực tiếp trên trình duyệt thật: thêm hàng vào giỏ POS, chọn "Chuyển khoản",
bấm Thanh toán — hiện đúng ảnh QR VietQR thật kèm banner chờ; gọi webhook mô phỏng ngân
hàng báo có tiền rồi bấm "Kiểm tra" — banner tự đổi sang "✅ Thanh toán thành công".

Xem thêm mục "biểu đồ doanh thu theo Quý" (một bổ sung khác cùng đợt, không liên quan chủ
đề tài liệu này) ở [09-loi-phat-hien-kiem-thu-hoi-quy.md, mục 4](09-loi-phat-hien-kiem-thu-hoi-quy.md#4).

---

## 6. Chạy thử trên máy cá nhân

```bash
git fetch origin claude/customer-badminton-accessories-pages-nsz9k5
git checkout claude/customer-badminton-accessories-pages-nsz9k5

# Backend
cd backend && npm install
cp .env.example .env      # điền DB_* và 2 JWT secret (mỗi cái ≥ 32 ký tự)
npm run migrate && npm run seed
npm run dev               # http://localhost:5000

# Frontend (cửa sổ terminal khác)
cd frontend && npm install
echo "VITE_API_BASE_URL=http://localhost:5000/api/v1" > .env
npm run dev               # http://localhost:5173

# Test
cd backend && npm test
```

`migrate` + `seed` chạy thẳng một mạch từ DB rỗng, không cần thao tác tay nào.

**Tài khoản dùng thử:** admin `0901111111/Admin@123` · thu ngân `0902222222/Employee@123`
· khách `0903333333/Customer@123`.

Cả admin lẫn thu ngân đều vào thẳng được màn hình bán hàng tại quầy (thu ngân gắn sẵn
chi nhánh chính; admin chọn chi nhánh qua ô chuyển chi nhánh).
