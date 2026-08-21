# Test Cases — Thanh toán online (VietQR) & Mã giảm giá (Voucher)

**Phiên bản:** 1.0
**Ngày chạy:** 21/08/2026
**Phạm vi:** 2 giai đoạn của luồng thanh toán bán lẻ
- Giai đoạn 1: thanh toán chuyển khoản qua VietQR cho đơn khách tự đặt online
- Giai đoạn 2: mã giảm giá dùng chung cho cả đơn online lẫn đơn bán tại quầy (POS)

**Tài liệu liên quan:** `TestPlan.md` (khung tổng thể), `APIDesign.md` §12 (đặc tả API).

---

## 1. Môi trường kiểm thử

| Thành phần | Cấu hình khi chạy |
|---|---|
| Backend | Express, `http://localhost:5000/api/v1`, `NODE_ENV=development` |
| Frontend | Vite dev server, `http://localhost:5173` |
| CSDL | **MySQL 8.0 thật** (`badminton_digital_management`), chạy `npm run migrate` + seed từ DB rỗng |
| Trình duyệt | Chromium (Playwright) — dùng cho phần kiểm thử giao diện |
| Tài khoản | admin `0901111111/Admin@123`, employee `0902222222/Employee@123`, customer `0903333333/Customer@123` |

**Nguyên tắc:** mọi ca có nhắc tới dữ liệu đều được đối chiếu bằng **truy vấn SQL trực tiếp**, không chỉ tin nội dung response API trả về.

**Dữ liệu mẫu chi nhánh 1:** biến thể #3 = 250.000đ, #9 = 25.000đ, #11 = 35.000đ.

---

## 2. Tổng hợp kết quả

| Nhóm | Nội dung | Số ca | Kết quả |
|---|---|---|---|
| A | Quản trị mã giảm giá + phân quyền + xem trước | 18 | 18 PASS |
| B | Khách tự đặt đơn online có áp mã | 13 | 13 PASS |
| C | Nhân viên bán tại quầy (POS) có áp mã | 12 | 12 PASS |
| F | Kiểm chứng lại sau khi vá 7 lỗi phát hiện được | 8 | 8 PASS |
| UI | Kiểm thử giao diện 3 luồng bằng Playwright | 20 bước | Đạt |
| Unit | Jest (`backend/tests/`) | 113 | 113 PASS |

**Tổng: 51 ca kiểm thử tích hợp + 114 unit test, tất cả PASS** (sau khi vá lỗi — xem mục 7).

> Bộ unit test không phụ thuộc múi giờ máy chạy — `npm test` chạy đúng ở mọi `TZ`
> (đã kiểm với UTC, Asia/Ho_Chi_Minh, America/New_York, Pacific/Kiritimati).

---

## 3. Nhóm A — Quản trị mã giảm giá

**Tiền điều kiện chung:** đăng nhập admin, đã có `X-Branch-Id: 1`.

| Mã | Mục tiêu | Bước thực hiện | Kết quả mong đợi | Kết quả thực tế | KQ |
|---|---|---|---|---|---|
| A1 | Tạo mã giảm theo % | `POST /vouchers` percent 10%, cap 50.000, đơn tối thiểu 200.000 | 201, DB lưu đúng | 201; `TCA-P10` id=14 đúng 5/5 cột | PASS |
| A2 | Tạo mã giảm số tiền cố định | `POST /vouchers` flat 50.000 | 201 | 201; `flat, 50000.00, max=NULL` | PASS |
| A3 | Chặn trùng mã | Tạo lại mã đã tồn tại | 400 | 400 "Mã giảm giá này đã tồn tại"; DB vẫn 1 dòng | PASS |
| A3b | Chuẩn hoá mã khi so trùng | Gửi `"  tca-p10 "` (thường + khoảng trắng) | 400 | 400 — chuẩn hoá hoạt động đúng | PASS |
| A4 | Chặn % > 100 khi tạo | `discountValue=150` | 400 | 400 "Giảm theo % không thể vượt quá 100" | PASS |
| A5 | Danh sách + lọc + phân trang | `GET /vouchers?search=TCA&limit=2` | Đúng dữ liệu, không trùng giữa các trang | `total=3`, trang1 `[16,15]`, trang2 `[14]` | PASS |
| A5b | Lọc không phân biệt hoa thường | `?search=tca` | 3 kết quả | 3 kết quả | PASS |
| A6 | Sửa mã | `PUT` đổi mô tả + giá trị | 200, DB đổi | `discount_value` 5.00→15.00 | PASS |
| A7 | Ngừng áp dụng | `POST /:id/deactivate` | 200, `is_active=0` | Đúng | PASS |
| A8 | Mã đã tắt không dùng được | Preview mã vừa tắt | 400 | 400 "đã ngừng áp dụng" | PASS |
| A9 | RBAC — employee không được tạo | employee `POST /vouchers` | 403 | 403; DB không phát sinh dòng | PASS |
| A9b | RBAC — employee không được xem | employee `GET /vouchers` | 403 | 403 | PASS |
| A10 | RBAC — customer không được xem | customer `GET /vouchers` | 403 | 403 | PASS |
| A10b | RBAC — customer không được sửa/tắt | customer `PUT`, `deactivate` | 403 | 403; DB không đổi | PASS |
| A11 | Preview mở cho mọi vai trò | customer `POST /vouchers/preview` | 200 | 200, `discountAmount=50000` | PASS |
| A11b | Preview — chưa đăng nhập | Không gửi token | 401 | 401 | PASS |
| A12 | Preview mã không tồn tại | Mã bịa | 404 | 404 | PASS |
| A13 | Preview dưới mức đơn tối thiểu | Đơn nhỏ hơn `minOrderAmount` | 400 kèm mức tối thiểu | 400 "cần tối thiểu 200.000đ" | PASS |
| **A14** | **Mức trần giảm (%)** | Đơn 1.000.000 với mã 10% cap 50.000 | **50.000** (không phải 100.000) | `discountAmount=50000` | PASS |
| A14b | Đúng biên đơn tối thiểu | Đơn đúng bằng 200.000 | 200 | 200, giảm 20.000 | PASS |
| **A15** | **Không giảm quá tiền hàng** | Mã flat 50.000 cho đơn 30.000 | **30.000** | `discountAmount=30000` | PASS |
| A16 | Mã hết hạn | `endsAt` trong quá khứ → preview | 400 | 400 "đã hết hạn" | PASS |
| A17 | Mã chưa tới ngày | `startsAt` tương lai → preview | 400 | 400 "chưa tới ngày áp dụng" | PASS |
| A18 | Validation đầu vào | Thiếu `code`; `discountType` sai; `discountValue=-5` | 400 mỗi trường hợp | 400, không rò dòng nào vào DB | PASS |

---

## 4. Nhóm B — Khách tự đặt đơn online

**Tiền điều kiện chung:** đăng nhập customer (customerId=1), chi nhánh 1.

**Quy tắc nghiệp vụ được kiểm chứng:**
- Đơn `transfer` tạo Invoice + Payment ngay lúc đặt; `total = tiền hàng − giảm giá`.
- Đơn `cash` **không** tạo Invoice lúc đặt, nhưng vẫn lưu `voucher_*` trên đơn.
- Lượt dùng mã đếm bằng `COUNT(sales_orders)` với `status != 'cancelled'` → **huỷ đơn phải nhả lại lượt**.

| Mã | Mục tiêu | Kết quả mong đợi | Kết quả thực tế | KQ |
|---|---|---|---|---|
| B1 | Đơn tiền mặt + mã 10% | 201, lưu `voucher_*`, không có invoice | order#10, giảm 5.000; `invoices` 0 dòng | PASS |
| B2 | Đơn chuyển khoản + mã 50.000 | Invoice `total = 250.000−50.000` | invoice#7: `extras=250000, discount=50000, total=200000`; 1 payment `pending` | PASS |
| B3 | Đơn không dùng mã | 201, các cột `voucher_*` NULL | Đúng, không lỗi | PASS |
| B4 | Mức trần giảm | Giảm bị chặn đúng bằng cap | Đơn 500.000, 50% thô=250.000 → lưu **30.000** | PASS |
| B5 | Mã không tồn tại | 404 và **không tạo đơn** | 404; 0 đơn; tồn kho 45→45 (rollback sạch) | PASS |
| B6 | Dưới mức đơn tối thiểu | 400, không tạo đơn | 400; 0 đơn | PASS |
| B7 | Hết tổng lượt dùng | Đơn 2 bị từ chối | 400 "đã hết lượt sử dụng" | PASS |
| **B8** | **Huỷ đơn nhả lại lượt dùng** | Huỷ đơn 1 → đặt lại cùng mã phải được | Huỷ order#14 → lượt 1→0 → đặt lại **201** (order#15) | **PASS** |
| B9 | Giới hạn lượt mỗi khách | Đơn 2 cùng khách bị từ chối | 400 "Bạn đã dùng hết lượt" | PASS |
| B10 | Mã đã tắt | 400, không tạo đơn | 400 "đã ngừng áp dụng" | PASS |
| B11 | Huỷ đơn chuyển khoản có mã | Đơn `cancelled`, invoice `void`, payment `cancelled`, hoàn kho | Đủ 4 điều kiện; tồn kho 31→33 (+2) | PASS |
| B12 | Tồn kho trừ/hoàn đúng | Khớp tuyệt đối trên mọi dòng hàng | 9/9 dòng đúng (v3 −5, v9 −4, v11 −1 sau khi trừ phần hoàn) | PASS |
| B13 | QR đúng số tiền sau giảm | `qrCodeUrl` có `amount` = `total_amount` | `amount=200000` khớp invoice; đơn `cash` và đơn đã huỷ trả `qrCodeUrl=null` | PASS |

---

## 5. Nhóm C — Bán tại quầy (POS)

**Tiền điều kiện chung:** đăng nhập employee/admin, `X-Branch-Id: 1`.

**Quy tắc:** `tổng giảm = giảm giá tay + giảm từ mã` (cộng dồn); `total = max(0, tiền hàng − tổng giảm)`.

| Mã | Mục tiêu | Kết quả mong đợi | Kết quả thực tế | KQ |
|---|---|---|---|---|
| C1 | Áp mã cho đơn quầy | 200, DB lưu `voucher_*` | order#1, giảm 50.000 | PASS |
| C2 | Thanh toán có mã | Invoice `total = 120.000−50.000` | invoice#1: `discount=50000, total=70000`, payment `paid`; có dòng `discount` −50.000 | PASS |
| **C3** | **Cộng dồn mã + giảm giá tay** | `discount = 50.000+20.000` | invoice#2: `discount=70000, total=50000`; 2 dòng giảm riêng biệt | **PASS** |
| C4 | Mức trần giảm | Chặn đúng bằng cap | Đơn 250.000, 10% thô=25.000 → lưu **20.000** | PASS |
| C5 | Gỡ mã khỏi đơn | `voucher_*` về NULL, không trừ tiền nữa | Đúng; checkout `discount=0`, 0 dòng giảm | PASS |
| C6 | Áp mã không tồn tại | 404, đơn giữ nguyên mã cũ | 404; mã cũ và trạng thái không đổi | PASS |
| C7 | Áp mã cho đơn đã thanh toán | 400 | 400 "trạng thái 'paid', không thể áp mã" | PASS |
| C8 | Dưới mức đơn tối thiểu | 400 | 400; `voucher_id` vẫn NULL | PASS |
| **C9** | **Sửa giỏ sau khi đã áp mã** | Không được vượt ràng buộc của mã | **Lỗi — xem mục 7.1. Đã vá, kiểm lại ở F4** | PASS (sau vá) |
| C10 | Tồn kho trừ đúng | Trừ đúng số lượng | v9 50→47 (đúng 3). *Ghi chú: kho trừ lúc thêm dòng hàng, không phải lúc thanh toán* | PASS |
| C11 | RBAC — customer không bán hàng | 403 | 403 cho `/sales-orders`, `/voucher`, `/checkout` | PASS |
| C12 | Chống thanh toán trùng | Gọi checkout 2 lần → chỉ 1 payment | `COUNT(payments)=1`, `COUNT(invoices)=1` | PASS |

---

## 6. Nhóm F — Kiểm chứng sau khi vá lỗi

Mỗi ca **tái hiện chính xác** kịch bản đã khai thác được ở lần chạy đầu, chạy lại trên API + MySQL thật sau khi vá.

| Mã | Kịch bản tấn công | Trước khi vá | Sau khi vá | KQ |
|---|---|---|---|---|
| F1 | `PUT /vouchers/:id` đặt `discountValue=150` cho mã percent | 200 — mã giảm 100% giá trị đơn | **400** "Giảm theo % không thể vượt quá 100" | PASS |
| F2a | Tạo mã có `code` 44 ký tự (cột `VARCHAR(32)`) | 500 "Data too long for column" | **400** báo rõ giới hạn 32 ký tự | PASS |
| F2b | `description` 300 ký tự (cột `VARCHAR(255)`) | 500 | **400** | PASS |
| F3 | Tạo mã có `endsAt` < `startsAt` | 201 — mã vô dụng vĩnh viễn | **400** "Ngày kết thúc phải sau ngày bắt đầu" | PASS |
| **F4** | **Áp mã lúc đơn 275.000đ (đạt mức tối thiểu 200.000đ), rồi bỏ bớt hàng còn 25.000đ, rồi thanh toán** | **201 — hoá đơn giảm 55.000đ trên 25.000đ tiền hàng, `total=0`, các dòng cộng lại ra −30.000đ** | **400** "Đơn hàng cần tối thiểu 200.000đ mới dùng được mã này" | **PASS** |
| F5 | Đơn 25.000đ, thu ngân nhập giảm giá tay 999.999đ | `discount_amount=999999` ghi thẳng vào sổ | **`discount_amount=25000`** (chặn trần đúng bằng tiền hàng) | PASS |
| F6 | Quầy áp mã → admin tắt mã → quầy thanh toán | 201 — vẫn trừ 30.000đ | **400** "Mã giảm giá này đã ngừng áp dụng" | PASS |
| F7 | **Không vá quá tay:** đơn hợp lệ dùng mã `usageLimit=1` | — | **201**, `total=40.000đ` đúng (đơn không tự đếm mình là 1 lượt) | PASS |

**Kiểm tra tính nhất quán hoá đơn sau khi vá** (SQL đối chiếu `total_amount` với tổng `invoice_lines`):

| Hoá đơn | Tiền hàng | Giảm | Tổng | Tổng các dòng | Kết quả |
|---|---|---|---|---|---|
| #14 (sau vá) | 25.000 | 25.000 | 0 | 0 | **KHỚP** |
| #15 (sau vá) | 50.000 | 10.000 | 40.000 | 40.000 | **KHỚP** |
| #12 (trước vá, giữ làm bằng chứng) | 25.000 | 999.999 | 0 | −974.999 | LỆCH |

---

## 7. Lỗi phát hiện được và cách xử lý

Toàn bộ 7 lỗi dưới đây **do bộ test này phát hiện**, đều nằm trong mã nguồn của
chính 2 giai đoạn đang kiểm thử, và **đều đã được vá + kiểm chứng lại** ở nhóm F.

### 7.1. [NGHIÊM TRỌNG] Số tiền giảm bị "đóng băng", không kiểm tra lại lúc thanh toán

- **Hiện tượng:** `applyVoucher` chốt `voucherDiscountAmount` vào đơn; `addLine`/`removeLine`
  không tính lại; `checkout` chỉ đọc số đã chốt. Hệ quả: áp mã lúc giỏ hàng "đẹp" rồi sửa
  giỏ là vượt được **mọi** ràng buộc — `minOrderAmount`, `maxDiscountAmount`, `isActive`,
  cả khung thời gian hiệu lực.
- **Bằng chứng đo được:** hoá đơn #4 — tiền hàng 25.000đ, giảm 55.000đ, `total_amount=0`,
  hai dòng hoá đơn cộng lại ra −30.000đ (hoá đơn tự mâu thuẫn).
- **Chỉ ảnh hưởng luồng POS.** `OnlineOrderService.placeOrder` tính mã trong cùng một lời
  gọi tạo dòng hàng nên không thể lệch.
- **Cách vá:** `checkout` gọi lại `VoucherService.validateAndCompute` trên giỏ hàng cuối
  cùng, kèm tham số mới `excludeOrderId` để đơn không tự đếm mình là một lượt đã dùng
  (nếu không, mã `usageLimit=1` sẽ báo "hết lượt" ngay trên đơn hợp lệ của nó).
- **Kiểm chứng:** F4, F6, F7.

### 7.2. [NGHIÊM TRỌNG] `PUT /vouchers/:id` bỏ qua chốt chặn "% không quá 100"

- `create()` có kiểm tra, `update()` thì không → sửa mã 10% thành 150% qua API là lọt,
  và mã đó giảm trọn vẹn giá trị đơn.
- **Cách vá:** tách thành `VoucherService.assertConsistent()` dùng chung cho cả tạo lẫn sửa,
  kiểm trên **giá trị sau khi ghép** (sửa mỗi `discountValue` mà không gửi `discountType`
  thì vẫn phải soi `discountType` đang lưu trong DB).
- **Kiểm chứng:** F1.

### 7.3. [TRUNG BÌNH] Giảm giá tay không bị chặn trần

- `checkout` tính `total = max(0, …)` nhưng lưu `discount_amount` là số thô → đơn 25.000đ
  nhập giảm 999.999đ vẫn ghi 999.999đ vào sổ, báo cáo doanh thu đọc ra số vô nghĩa.
- **Cách vá:** chặn `manualDiscount` trong khoảng `[0, tiền hàng − giảm từ mã]`.
- **Kiểm chứng:** F5.

### 7.4. [TRUNG BÌNH] Lỗi CSDL lọt ra thành HTTP 500

- `code` > 32 ký tự hoặc `description` > 255 ký tự rơi thẳng xuống MySQL → 500
  "Data too long for column" thay vì 400. Đây là đường đi có thật từ giao diện admin.
- **Cách vá:** thêm `isLength({max})` vào `voucherValidation.js` (cả tạo lẫn sửa) và
  `maxLength={32}` cho ô nhập mã ở `VoucherTab.jsx`.
- **Kiểm chứng:** F2a, F2b.

### 7.5. [THẤP] Không kiểm tra `endsAt` phải sau `startsAt`

- Tạo được mã có khoảng hiệu lực rỗng, không bao giờ dùng được.
- **Cách vá:** kiểm trong `assertConsistent()`. **Kiểm chứng:** F3.

### 7.6. [THẤP] Số tiền giảm không làm tròn về đồng nguyên

- 10% của 333.333đ ra 33.333,3đ — VND không có đơn vị nhỏ hơn 1đ, số lẻ này chui vào
  `DECIMAL(12,2)` rồi gây lệch khi đối soát.
- **Cách vá:** `Math.round()` trong `computeDiscount`. **Kiểm chứng:** unit test.

### 7.7. [THẤP] `PUT` không giữ bất biến "mã flat thì không có mức trần"

- `create` luôn ép `maxDiscountAmount = null` cho mã `flat`, `update` thì không → đổi
  percent sang flat để lại dữ liệu rác, admin nhìn bảng dễ hiểu nhầm.
- **Cách vá:** áp cùng quy tắc trong `update()`.

---

## 8. Vấn đề tồn tại sẵn (ngoài phạm vi 2 giai đoạn — mới báo cáo, **chưa** sửa)

### 8.1. Đã sửa trong đợt này

| # | Vấn đề | Mức độ | Đã sửa bằng |
|---|---|---|---|
| 1 | **CI fail:** `dateTime.test.js` dùng `getHours()` (đọc giờ máy) để kiểm hàm trả về mốc theo giờ Việt Nam → đỏ trên runner UTC | Cao | Viết lại test: dựng mốc bằng `Date.UTC(...)`, kiểm bằng `localDateString`/`localTimeString`. Đã kiểm PASS ở 4 múi giờ. **Không cần đụng `ci.yml`** — hàm `dateTime.js` vốn đã độc lập múi giờ, chỉ test viết sai |
| 2 | Tài khoản thu ngân mẫu có `employees.branch_id = NULL` → không dùng được POS từ giao diện | Trung bình | Seeder gán `branch_id`; migration `20260821100001` backfill dòng cũ và đặt lại `NOT NULL` |
| 3 | Seeder `20260815100001` có điều kiện chặn tự mâu thuẫn — luôn kích hoạt ở lần cài mới hợp lệ | Trung bình | Đổi căn cứ chặn từ *số tồn kho* (seeder trước luôn tạo) sang *sổ nhật ký kho + phiếu nhập* (chỉ thao tác thật của con người mới ghi) |
| 4 | Seeder `20260816300001` ghi cứng `employee_id` 14/15 không tồn tại → gãy khoá ngoại | Trung bình | Tra thu ngân theo `branch_id` thay vì hardcode, kèm thông báo lỗi rõ nếu chi nhánh chưa có nhân viên |

Kết quả: `npm run migrate && npm run seed` nay **chạy trọn vẹn từ DB rỗng** (35 migration + 7 seeder), không cần thao tác tay nào.

### 8.2. Còn tồn tại — mới báo cáo, **chưa** sửa

| # | Vấn đề | Mức độ | Ghi chú |
|---|---|---|---|
| 1 | **Ràng buộc `branch_id NOT NULL` chưa bao giờ có hiệu lực** trên `courts`, `bookings`, `court_sessions`, `invoices`, `payments` | Cao | Migration M1 có `changeColumn(allowNull: false)` nhưng kèm `references` nên MySQL không áp — kiểm `INFORMATION_SCHEMA` thấy cả 6 bảng đều `IS_NULLABLE = YES`. Đợt này mới xử lý `employees`; 5 bảng còn lại cần một đợt rà riêng |
| 2 | `POST /auth/login` trả **500** khi cùng một tài khoản đăng nhập đồng thời: `"Attempting to update a stale model instance: User"` — `OptimisticLockError` không được bắt | Trung bình | Nên retry hoặc trả lỗi có nghĩa |
| 3 | Đơn online chuyển khoản tạo Invoice nhưng **không tạo `invoice_lines`**, trong khi POS thì có | Trung bình | Xem hoá đơn chi tiết của đơn online sẽ trống |
| 4 | `countUsage` tính cả đơn `open` → đơn POS bỏ dở giữ một lượt mã vĩnh viễn | Thấp | Cân nhắc bổ sung cơ chế dọn đơn quầy bị bỏ quên |
| 5 | Rate limit đăng nhập 10 lần/15 phút/IP không có ngoại lệ cho môi trường test | Thấp | Là tính năng bảo mật đúng, nhưng gây khó khi chạy test tự động |

---

## 9. Kiểm thử giao diện (Playwright, web thật)

20 bước ảnh chụp trên 3 luồng, chạy với backend + MySQL thật:

**A. Admin (5 bước):** mở Bán Lẻ → tab "Mã giảm giá" → mở form → điền mã 10%/cap 50.000/đơn tối thiểu 200.000 → mã hiện trong danh sách.

**B. Khách hàng (11 bước):** cửa hàng → chi tiết sản phẩm → thêm giỏ → giỏ hàng → xác nhận đơn → **nhập mã sai (báo lỗi đúng)** → nhập mã đúng (hiện số tiền giảm) → chọn chuyển khoản → đặt hàng → **trang chi tiết hiện QR + đếm ngược 30 phút + dòng "Mã DEMO-GIAM10 −25.000đ" + tổng 225.000đ** → danh sách đơn mua.

**C. POS (4 bước):** màn hình bán hàng → thêm hàng 250.000đ → áp mã (hiện `DEMO-GIAM10 (-25.000đ)`, tổng còn 225.000đ) → thanh toán.

**Quan sát thêm về phân quyền:** tài khoản `employee` chỉ thấy 2 tab (Bán hàng, Kho bán lẻ); tài khoản `admin` thấy đủ 4 tab gồm "Danh mục sản phẩm" và "Mã giảm giá" — đúng thiết kế `adminOnly`.

**Lưu ý:** ảnh QR hiển thị trống vì môi trường container không ra được `img.vietqr.io`; bản thân URL sinh ra đã được kiểm đúng ở ca B13.

---

## 10. Unit test (Jest)

`TZ=Asia/Ho_Chi_Minh npm test` → **11 bộ / 113 ca / PASS toàn bộ**.

Hai file thuộc phạm vi tài liệu này:

- **`tests/voucherService.test.js`** (19 ca) — `normalizeCode`; `computeDiscount` (flat/percent,
  mức trần, không vượt tiền hàng, **làm tròn đồng nguyên**); `assertWithinWindow` (tắt, chưa tới
  ngày, hết hạn, vô thời hạn, mã lỗi mang `statusCode=400`); **`assertConsistent`** (% > 100,
  flat không bị nhầm là %, `endsAt` phải sau `startsAt`); `validateAndCompute` bắt buộc có transaction.
- **`tests/voucherValidation.test.js`** — bộ quy tắc express-validator của các route voucher.
