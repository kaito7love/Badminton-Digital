# Tổng hợp toàn bộ vấn đề đã audit trong phiên này

Tài liệu tổng hợp lại mọi phát hiện từ đợt rà soát vừa qua, xếp theo mức độ
khẩn cấp thật sự (không theo thứ tự thời gian phát hiện). Mỗi mục có link
tới tài liệu chi tiết tương ứng để đọc sâu hơn khi cần.

**Cập nhật 16/08:** đã chạy thêm 1 đợt rà soát "kiểm tra lại chính đợt
audit" — 9 điểm mù có khả năng bị bỏ sót (formula injection khi xuất Excel,
bảo mật Docker, kích thước bundle frontend, chiến lược backup, luồng hoàn
tiền, các model chưa kiểm tra hết, route công khai...) — tìm thêm được 6
phát hiện thật sự mới, đã gộp vào đúng mục bên dưới (đánh dấu
**[Bổ sung 16/08]**). Không có gì thay đổi ở nhóm 🔴 khẩn cấp nhất.

---

## 🔴 Cần xử lý sớm nhất

### 1. Mã QR chuyển khoản trỏ vào tài khoản ngân hàng demo giả
`backend/src/utils/vietqr.js:5` — tài khoản `MB / 0987654321 / BADMINTON
DIGITAL` là dữ liệu demo, dùng chung cho **mọi chi nhánh**, không có cấu
hình tài khoản thật ở đâu cả. **Nếu hệ thống đang thu tiền chuyển khoản
thật, tiền đang không về đúng tài khoản nào** — đây là việc nghiêm trọng
nhất trong toàn bộ đợt audit, mức độ kinh doanh chứ không chỉ kỹ thuật.
→ Chi tiết: `docs/05-extra/ProjectGapsAndDirection.md`

### 2. JWT secret có giá trị dự phòng hardcode sẵn trong code
`backend/src/utils/jwt.js:3-4` — nếu thiếu biến môi trường
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, server vẫn khởi động bình thường
và âm thầm dùng 1 chuỗi cố định in sẵn trong mã nguồn. Ai đọc được code
(hoặc biết chuỗi này) có thể tự tạo token admin giả mà không cần mật khẩu.
→ Chi tiết: `docs/05-extra/SecurityAudit.md`

### 3. Webhook xác nhận thanh toán không bắt buộc xác thực
`backend/src/controllers/paymentController.js:50-53` — nếu thiếu biến môi
trường `PAYMENT_WEBHOOK_SECRET` (hiện còn chưa có cả trong
`.env.example`), endpoint nhận xác nhận thanh toán không kiểm tra gì cả.
Kết hợp mã hoá đơn dễ đoán (`BD-{branchId}-00000042`), có thể giả mạo báo
"đã thanh toán" cho 1 hoá đơn bất kỳ.
→ Chi tiết: `docs/05-extra/SecurityAudit.md`

### 4. Không giới hạn số lần thử đăng nhập
`POST /api/v1/auth/login` không có rate-limit — có thể dò mật khẩu bằng
cách thử liên tục không giới hạn.
→ Chi tiết: `docs/05-extra/SecurityAudit.md`

### 5. `CustomerService.updateCustomer` thiếu transaction
`backend/src/services/CustomerService.js:158-192` — ghi đồng thời vào
`users.phone` và `customers.phone` không bọc transaction. Nếu request bị
ngắt giữa chừng (crash, timeout, mất mạng), 2 bảng có thể lệch nhau — SĐT
đăng nhập và SĐT hồ sơ khách không còn khớp. Là chỗ **duy nhất** trong
toàn bộ service layer thiếu transaction — mọi luồng chính khác (đặt sân,
thanh toán, kho) đều làm đúng.
→ Chi tiết: `docs/05-extra/StabilityAudit.md`

---

## 🟠 Nên xử lý, chưa khẩn cấp

- **Không có UI xem nhật ký hoạt động (audit log)** dù dữ liệu ghi đầy đủ ở
  26 nơi trong code — muốn tra "ai làm gì lúc nào" chỉ có thể truy DB tay.
- **3 hàm gọi API ở frontend trỏ tới route không tồn tại** (`applyDiscount`,
  `updateAccessoryPricing`, `getOccupancyReport`) — code mồ côi, không ai
  gọi cũng không route nào nhận.
- **6 bảng dữ liệu chết trong DB** (`product_categories`, `products`,
  `product_variants`, `sales_orders`, `sales_order_lines`, `invoice_lines`)
  — tàn dư từ 1 hướng thiết kế đã bỏ, không model/code nào dùng.
- **Giảm giá lúc thanh toán không có kiểm soát** — không giới hạn %, không
  bắt buộc lý do, không phê duyệt, và audit log cũng không ghi lại số tiền
  giảm/lý do nên không tra được ai giảm giá bao nhiêu và vì sao.
- **`branch_manager` không có đường tạo qua UI/API** — vai trò này đã được
  nối dây đầy đủ ở route/frontend nhưng chỉ tồn tại được nhờ seed dữ liệu
  1 lần, `EmployeeService.createEmployee` hard-code role `'employee'`.
- **Hoàn tiền/huỷ hoá đơn hoàn toàn không tồn tại** — cả `Payment.status`
  (`refunded`) lẫn `Invoice.status` (`void`) đều có sẵn trong schema nhưng
  chưa từng được service nào gán. Nếu nhân viên bấm nhầm lúc checkout hoặc
  cần hoàn tiền vì bất kỳ lý do gì, hiện **không có cách nào xử lý được**
  trong hệ thống, kể cả thao tác thủ công.
- **Xuất báo cáo Excel dính lỗ hổng formula injection** — tên khách tự đăng
  ký không lọc ký tự `=`/`+`/`-`/`@`, ghi thẳng vào file Excel xuất ra;
  người mở file bằng Excel có thể vô tình chạy phải công thức độc hại.
- **Container backend chạy quyền `root`, thiếu `.dockerignore`** — nếu
  `.env` thật tồn tại lúc build Docker image, secret có thể bị "nướng"
  luôn vào image. Cổng MySQL cũng đang mở ra ngoài host không cần thiết.
- **Bundle frontend gộp 1 file JS ~800KB**, chưa tách route — khách vào
  trang đặt sân công khai trên điện thoại vẫn phải tải cả code khu vực
  quản trị mà họ không dùng tới.
- **`Branch.timezone` được lưu nhưng không nơi nào đọc** — mốc "hôm nay"
  trên Dashboard/Báo cáo tính theo giờ máy chủ, không theo múi giờ từng chi
  nhánh; chưa gây lỗi vì hiện mọi chi nhánh cùng múi giờ Việt Nam, nhưng sẽ
  âm thầm sai nếu sau này mở chi nhánh/đổi hạ tầng ở múi giờ khác.
- **Hệ vai trò đang hardcode** (`roleMiddleware(['admin', ...])` rải rác
  ~15 file route) — dự án tự ghi trong roadmap là cần chuyển sang hệ
  permission-code (giai đoạn M5), hiện vẫn chưa làm.
- Refresh token có thiết kế **1 tài khoản chỉ 1 phiên sống tại 1 thời
  điểm** — đăng nhập nơi khác sẽ đá phiên đang dùng ra sau tối đa 15 phút.
  Đã xác nhận đây là nguyên nhân bạn bị văng đăng nhập bất chợt. **Bạn
  chọn chưa sửa lúc này** — chi tiết + hướng sửa: `docs/05-extra/SessionRefreshIssue.md`
- Chưa cấu hình `pool` cho Sequelize (mặc định tối đa 5 kết nối DB đồng
  thời) — không sao ở tải hiện tại, nhưng là điểm cần lưu ý nếu sau này
  thêm polling hoặc tăng người dùng đồng thời.
→ Chi tiết: `docs/05-extra/ProjectGapsAndDirection.md`, `docs/05-extra/StabilityAudit.md`, `docs/05-extra/SecurityAudit.md`

---

## 🟡 Trải nghiệm người dùng — đã có kế hoạch, chưa triển khai

- **Trang Sân không tự đồng bộ giữa nhiều thiết bị** — mở sân ở thiết bị A
  không tự hiện lên thiết bị B, phải F5/chuyển trang mới thấy. Đã xác nhận
  bằng code, có kế hoạch khắc phục 3 phương án (Polling / SSE — đề xuất
  chính / WebSocket đầy đủ), kèm phân tích rủi ro cụ thể nếu triển khai
  (thứ tự sự kiện sai, mất kết nối không resync, emit trước khi commit...).
  → Chi tiết: `docs/05-extra/RealtimeCourtSync.md`
- Kế hoạch realtime cũ trong repo (`docs/BadmintonDigital_Realtime_Audit_Implementation_Plan.md`)
  tự nhận Phase 1 (chuẩn hoá model) đã "hoàn thành", nhưng đối chiếu code
  thật thì `CourtSession` **vẫn chưa tách được ai mở/ai đóng sân** như kế
  hoạch — tài liệu cũ ghi quá lên so với thực tế. `ProjectRoadmap.md` cũng
  đang ghi sai — Phase 5 (Frontend) vẫn ghi "PLANNED" dù đã xây xong từ lâu.
  → Chi tiết: `docs/05-extra/PlansVsCurrentReality.md`

---

## 🟢 Chỉ là ghi nhận / định hướng sản phẩm, không phải lỗi

- **Loyalty tier (hạng hội viên) chỉ là nhãn hiển thị** — tính đúng, cập
  nhật đúng, nhưng không kèm quyền lợi gì (không giảm giá, không ưu tiên
  đặt sân, không lọc được theo hạng). Hệ thống mới làm xong bước *đo
  lường*, chưa có bước *tưởng thưởng*. Tài liệu cũ (`WF-Customer.md`) từng
  ghi sai là đã có ưu đãi — đã sửa lại.
  → Chi tiết: `docs/05-extra/LoyaltyTier.md`
- Câu chuyện realtime (Socket.IO) vẫn đang ở dạng kế hoạch bị gác lại, chưa
  quyết định có làm tiếp hay bỏ hẳn.
- Mô hình chain-wide (Customer) vs branch-scoped (Booking/Invoice/Payment/
  Inventory) hiện nhất quán, nhưng không có tài liệu nào phát biểu đây là
  **nguyên tắc thiết kế chủ ý** — nên cân nhắc ghi rõ để các tính năng sau
  này áp dụng đúng theo cùng nguyên tắc.

---

## Việc đã hoàn tất trong phiên này (không cần làm lại)

- Light/dark theme cho toàn bộ khu vực quản trị — đã build/test pass, đã
  merge vào `main` (commit `2ca2672`).
- Vá xong lỗi blocker ở migration gộp khách hàng trùng SĐT (không còn tự
  động xoá nhầm khi 2 tài khoản khác nhau trùng số).
- Đồng bộ lại 26 tài liệu sống trong repo (README, SRS, UseCase,
  Architecture, DatabaseDesign, APIDesign, TestPlan, DeploymentGuide, toàn
  bộ workflow WF-01→WF-08...) khớp với code hiện tại.

---

## Nếu chỉ chọn làm 3 việc trước mắt

1. Xác nhận/thay tài khoản VietQR thật (mục 1) — nếu đang thu tiền thật,
   đây là việc duy nhất có thể gây thiệt hại tài chính ngay bây giờ.
2. Bỏ JWT secret dự phòng hardcode + bắt buộc server từ chối khởi động nếu
   thiếu secret thật (mục 2) — sửa nhanh, chặn được đường chiếm quyền admin
   rẻ nhất.
3. Bọc transaction cho `CustomerService.updateCustomer` (mục 5) — sửa nhỏ,
   chặn được lỗi lệch dữ liệu SĐT đăng nhập/hồ sơ khách.
