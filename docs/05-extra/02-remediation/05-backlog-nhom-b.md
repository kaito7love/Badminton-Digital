# Backlog Nhóm B — cần chủ dự án quyết định chính sách trước khi lên plan (CHƯA LÀM, CHƯA LÊN PLAN CHI TIẾT)

Khác 4 file plan trước, **không file nào dưới đây sẵn sàng để "code đi"** —
mỗi mục đều cần chủ dự án trả lời một quyết định kinh doanh trước, nếu tự
đoán và code sẽ dễ làm sai hướng vận hành thật của quán. Nguồn gốc: phần "2.
Việc chưa quyết định rõ" của `../01-audit/ProjectGapsAndDirection.md`.
Thứ tự dưới đây không phải mức ưu tiên — làm mục nào trước tuỳ chủ dự án
chọn khi sẵn sàng.

## 1. `feat/checkout-discount-guardrails` — kiểm soát giảm giá lúc checkout

**Hiện trạng:** `discountAmount`/`isDiscountPercent` là 2 tham số nhân viên
nhập tay tự do ngay lúc checkout (`PaymentService.checkout`) — không có
giới hạn số tiền/phần trăm tối đa, không cần cấp trên duyệt, không log lý do
giảm giá riêng (chỉ có 1 dòng `discount` chung chung trong `invoice_lines`
từ `feat/invoice-line-items`). Về lý thuyết 1 nhân viên có thể giảm 100% mọi
hoá đơn mà hệ thống không cản.

**Câu hỏi cần chủ dự án trả lời trước khi lên plan:**
- Có cần giới hạn mức giảm tối đa (theo % hoặc số tiền) không, và giới hạn
  đó cố định hay cấu hình theo chi nhánh/theo vai trò?
- Giảm giá vượt ngưỡng có cần duyệt bởi `admin`/`branch_manager` không, hay
  chỉ cần ghi log để hậu kiểm (không chặn thao tác)?
- Có cần bắt buộc nhập lý do giảm giá không?

## 2. `feat/branch-manager-onboarding` — đường tạo tài khoản `branch_manager` qua UI/API

**Hiện trạng:** vai trò `branch_manager` đã được gán quyền đầy đủ ở hầu hết
route (sân, nhân viên, báo cáo, kho...) nhưng **chỉ tồn tại được qua seeder**
(`backend/src/seeders/20260815300003-seed-branch-managers.js`) — không có
API/UI nào để `admin` tạo thêm quản lý chi nhánh mới. Mỗi chi nhánh mới mở
hiện phải nhờ chỉnh DB tay.

**Câu hỏi cần chủ dự án trả lời trước khi lên plan:**
- `admin` tạo `branch_manager` qua màn hình nào — mở rộng
  `EmployeesPage`/API tạo nhân viên hiện có (thêm lựa chọn role), hay cần
  màn hình riêng?
- `branch_manager` mới tạo có cần gán ngay vào 1 branch cụ thể lúc tạo
  (bắt buộc), hay có thể tạo "chưa gán chi nhánh" rồi gán sau?
- Liên quan mục 2.3 trong `ProjectGapsAndDirection.md`: `branch_manager`
  hiện chưa được quản lý phụ kiện/nhà cung cấp dù được quản lý sân + nhân
  viên — có mở rộng quyền này cùng lúc không, hay giữ nguyên?

## 3. `feat/refund-void-flow` — luồng hoàn tiền / huỷ hoá đơn

**Hiện trạng:** `Payment.status` đã có sẵn giá trị `refunded`,
`Invoice.status` đã có sẵn giá trị `void` trong enum — nhưng **không có bất
kỳ code nào** (service, controller, route) xử lý việc chuyển sang 2 trạng
thái này. Nhân viên hiện không có cách nào huỷ 1 hoá đơn đã thanh toán nhầm
hoặc hoàn tiền khi khách yêu cầu, ngoài sửa tay trực tiếp trong DB.

**Câu hỏi cần chủ dự án trả lời trước khi lên plan:**
- Hoàn tiền có tách 2 loại: huỷ toàn bộ hoá đơn (`void`) và hoàn 1 phần
  (refund từng dòng) không, hay chỉ cần huỷ toàn bộ trước?
- Ai có quyền thực hiện — `employee` tự làm được, hay bắt buộc qua
  `admin`/`branch_manager` duyệt?
- Hoàn tiền có cần đồng bộ ngược lại `Customer.totalSpent`/`loyaltyTier`
  (đã cộng lúc checkout, xem `PaymentService.checkout` dòng
  167-183) không — nếu không trừ lại, khách có thể lên hạng hội viên nhờ
  đơn hàng đã hoàn tiền.
- Có liên quan tới đặt cọc (booking deposit, nằm trong roadmap M6 nhưng
  chưa triển khai) không, hay hoàn toàn độc lập?

## 4. `feat/bank-account-settings` — cấu hình số tài khoản ngân hàng thật

**Hiện trạng:** mã QR chuyển khoản (`generateVietQRUrl`) hiện dùng
`bankId`/`accountNo`/`accountName` giá trị mặc định cứng trong code (dữ liệu
demo/placeholder), không có bảng/API nào lưu thông tin ngân hàng thật của
từng chi nhánh.

**Câu hỏi cần chủ dự án trả lời trước khi lên plan:**
- Mỗi chi nhánh có tài khoản ngân hàng riêng, hay dùng chung 1 tài khoản
  cho cả chuỗi?
- Lưu ở đâu — thêm cột vào `Branch`, hay bảng `Setting` (key-value) đã có
  sẵn (`backend/src/models/Setting.js`) đủ dùng?
- Ai được sửa thông tin này — chỉ `admin`, hay `branch_manager` cũng sửa
  được cho chi nhánh của mình?

**Lưu ý phạm vi:** mục này chỉ là cấu hình số tài khoản để tạo đúng mã QR —
**không phải** tích hợp cổng thanh toán online (đã xác nhận với chủ dự án
là module riêng, chưa làm, không nằm trong backlog này).
