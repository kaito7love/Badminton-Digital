# Software Requirement Specification (SRS)
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.2
**Ngày:** 18/10/2026 (từ v1.1 ngày 15/08/2026, v1.0 ngày 19/07/2026 — lịch sử thay đổi ở mục 8)
**Loại tài liệu:** Software Requirement Specification (SRS)

---

## 1. Giới thiệu

### 1.1 Mục đích tài liệu
Tài liệu này mô tả chi tiết các yêu cầu chức năng và phi chức năng của hệ thống **Badminton Digital Management** — một hệ thống quản lý sân cầu lông toàn diện, phục vụ vận hành thực tế của một sân cầu lông thương mại. Tài liệu là cơ sở để đội ngũ phát triển thiết kế, triển khai và kiểm thử hệ thống, đồng thời là tài liệu tham chiếu khi trình bày dự án trong CV/portfolio.

### 1.2 Phạm vi dự án
Badminton Digital Management là một ứng dụng web full-stack, hỗ trợ:
- Quản lý sân, đặt lịch, thanh toán, hóa đơn
- Quản lý khách hàng và nhân viên
- Quản lý phụ kiện, nhà cung cấp và tồn kho (nhập kho, sổ nhật ký xuất/nhập, giá vốn bình quân gia quyền) theo từng chi nhánh
- Quản lý đa chi nhánh (branch), Admin chuyển đổi chi nhánh đang xem/thao tác
- Dashboard thống kê và báo cáo doanh thu
- Phân quyền người dùng theo vai trò (Admin, Quản lý chi nhánh, Nhân viên, Khách hàng)
- Đăng nhập bằng số điện thoại hoặc email, khách hàng tự đăng ký tài khoản
- Bán lẻ dụng cụ thể thao tại quầy (POS) độc lập với thuê sân, kèm danh mục có biến thể (size/màu), mã giảm giá và hoá đơn nhiều dòng
- Cổng khách hàng trên web: đặt sân theo lưới sân × giờ, cửa hàng nhiều chi nhánh, giỏ hàng và đơn đặt online, thông báo trong ứng dụng về lịch đặt
- Thanh toán chuyển khoản bằng mã VietQR, xác nhận tự động qua webhook (tuỳ chọn, tắt nếu chưa cấu hình tài khoản ngân hàng)
- Cập nhật thời gian thực trạng thái sân và lịch đặt (Server-Sent Events) và nhật ký hoạt động có truy vết yêu cầu
- **Thi đấu** — một dịch vụ độc lập có cơ sở dữ liệu riêng: chấm trình, điểm trình đơn/đôi, giải đấu, buổi giao lưu, bấm điểm trực tiếp, bảng xếp hạng, và khu công khai `/thi-dau` cho khách xem và tự đăng ký (mục 3.14)

Phạm vi **không bao gồm**: cổng thanh toán trực tuyến (VNPay, Momo… — hệ thống chỉ sinh mã VietQR và nhận webhook xác nhận từ dịch vụ báo có bên ngoài), thu lệ phí giải đấu trực tuyến (lệ phí chỉ hiển thị, thu tại quầy), xác minh số điện thoại bằng OTP, ứng dụng di động native (chỉ responsive web), thuế/VAT trên hoá đơn, và mô hình multi-tenant nhiều tổ chức độc lập (bảng `organizations` — vẫn để ngỏ cho khả năng mở rộng, xem `DatabaseDesign.md`).

### 1.3 Đối tượng sử dụng tài liệu
- Lập trình viên Frontend/Backend
- Người thiết kế cơ sở dữ liệu
- Tester
- Người review portfolio (nhà tuyển dụng)

### 1.4 Định nghĩa, từ viết tắt
| Từ viết tắt | Ý nghĩa |
|---|---|
| SRS | Software Requirement Specification |
| API | Application Programming Interface |
| JWT | JSON Web Token |
| CRUD | Create, Read, Update, Delete |
| ERD | Entity Relationship Diagram |
| RBAC | Role-Based Access Control |
| POS | Point of Sale — quầy bán lẻ |
| SKU | Mã định danh một biến thể sản phẩm (size/màu) |
| SSE | Server-Sent Events — luồng đẩy một chiều từ server xuống trình duyệt |
| VietQR | Chuẩn mã QR chuyển khoản ngân hàng nội địa |
| HMAC / ES256 | Chữ ký xác thực giữa các dịch vụ (HMAC cho sự kiện, ES256 cho token dịch vụ) |
| Outbox | Bảng ghi sự kiện cùng giao dịch với dữ liệu gốc để gửi đi sau, không mất sự kiện |

---

## 2. Mô tả tổng quan

### 2.1 Bối cảnh sản phẩm
Hệ thống mô phỏng quy trình vận hành của một sân cầu lông thương mại: khách đến chơi → nhân viên mở sân → hệ thống tính giờ và tiền → khách dùng thêm phụ kiện (nước, cầu, thuê vợt...) → đóng sân và thanh toán → xuất hóa đơn.

### 2.2 Chức năng tổng quan của sản phẩm
1. Authentication & Authorization
2. Dashboard thống kê
3. Quản lý sân (Court Management)
4. Quản lý đặt lịch (Booking Management)
5. Quản lý khách hàng
6. Quản lý nhân viên
7. Quản lý phụ kiện & kho hàng (danh mục, nhà cung cấp, nhập kho, tồn kho theo chi nhánh)
8. Thanh toán & Hóa đơn
9. Báo cáo & Thống kê
10. Cài đặt hệ thống
11. Quản lý đa chi nhánh (Multi-branch)
12. Bán lẻ dụng cụ (POS), danh mục sản phẩm và mã giảm giá
13. Đơn hàng online của khách (giỏ hàng, nhận hàng tại quầy, chuyển khoản VietQR)
14. Thông báo cho khách hàng
15. Cập nhật thời gian thực và nhật ký hoạt động
16. Thi đấu (dịch vụ riêng — mục 3.14)

### 2.3 Đối tượng người dùng (User Roles)

| Vai trò | Mô tả | Quyền hạn chính |
|---|---|---|
| **Admin** | Chủ sân / quản trị hệ thống | Toàn quyền trên mọi chi nhánh: quản lý sân, nhân viên, giá, kho hàng, báo cáo, cài đặt; chuyển đổi chi nhánh đang xem/thao tác |
| **Quản lý chi nhánh (Branch Manager)** | Vai trò `branch_manager` — quản lý vận hành trong phạm vi 1 chi nhánh | Quyền rộng hơn Nhân viên (VD: thêm/sửa/xóa sân, quản lý sản phẩm bán lẻ và mã giảm giá, báo cáo, quản lý nhân viên); chỉ đọc danh mục phụ kiện và nhà cung cấp (thêm/sửa/xoá hai danh mục này chỉ Admin) nhưng luôn giới hạn ở đúng chi nhánh của mình, không chuyển được chi nhánh; chỉ được sửa/xoá tài khoản `employee`, không đụng tới `admin` hay `branch_manager` khác |
| **Nhân viên (Employee)** | Nhân viên vận hành tại quầy, giới hạn trong 1 chi nhánh | Mở/đóng sân, tạo booking, checkout, bán lẻ POS, quản lý khách hàng, nhập kho/gọi phụ kiện, không cấu hình hệ thống; giảm giá tay bị chặn trần theo cài đặt |
| **Khách hàng (Customer)** | Người thuê sân và mua hàng | Xem lịch trống, đặt lịch, đặt hàng online, nhận thông báo, xem lịch sử chơi và chi tiêu của bản thân (gộp trên mọi chi nhánh), đăng ký giải đấu và buổi giao lưu; có thể tự đăng ký tài khoản bằng số điện thoại. Chỉ truy cập dữ liệu của chính mình |
| **Khách vãng lai (chưa đăng nhập)** | Người xem web công khai | Xem trang chủ, bảng giá và lưới sân trống, cửa hàng, giải đấu, buổi giao lưu, tỉ số trực tiếp và bảng xếp hạng (hồ sơ người chơi bị che theo chế độ riêng tư); không đặt được gì |

### 2.4 Ràng buộc chung
- Toàn bộ giao diện hỗ trợ tiếng Việt.
- Hệ thống phải responsive trên Desktop, Tablet, Mobile.
- Dữ liệu nhạy cảm (mật khẩu) phải được mã hóa (bcrypt).
- Giao tiếp Frontend–Backend qua RESTful API, dữ liệu JSON.
- Mọi mốc ngày giờ lưu ở UTC; việc tính "hôm nay", giờ cao điểm, giờ mở cửa và gộp báo cáo luôn theo múi giờ của **chi nhánh**, không theo đồng hồ máy chủ.
- Tiền tệ là VND, số nguyên đồng.

### 2.5 Giả định và phụ thuộc
- Hệ thống chạy trên môi trường có kết nối Internet ổn định.
- MySQL server (từ 8.0) sẵn sàng và được cấu hình đúng; mỗi dịch vụ dùng một database riêng.
- Giả định mỗi sân chỉ phục vụ 1 nhóm khách tại 1 thời điểm.
- Thi đấu và chuyển khoản VietQR là **tuỳ chọn**: thiếu cấu hình thì tính năng tương ứng tắt hẳn (cổng thi đấu trả 503, chuyển khoản bị từ chối) chứ không chạy nửa vời.
- Webhook xác nhận chuyển khoản đến từ một dịch vụ báo có bên ngoài đã khai cùng secret với hệ thống.

---

## 3. Yêu cầu chức năng chi tiết

### 3.1 Authentication & Authorization
| Mã | Yêu cầu | Mô tả |
|---|---|---|
| FR-AUTH-01 | Đăng nhập | Người dùng đăng nhập bằng **số điện thoại hoặc email** (1 trường `identifier` duy nhất, hệ thống tự nhận diện định dạng) + password |
| FR-AUTH-02 | Đăng xuất | Hủy phiên đăng nhập hiện tại |
| FR-AUTH-03 | JWT Access Token | Cấp access token có thời hạn ngắn (15 phút) sau đăng nhập |
| FR-AUTH-04 | Refresh Token | Cấp lại access token khi hết hạn mà không cần đăng nhập lại (refresh token sống 7 ngày, chỉ lưu dạng băm sha256) |
| FR-AUTH-05 | Quên mật khẩu | Gửi link/mã đặt lại mật khẩu qua email |
| FR-AUTH-06 | Đổi mật khẩu | Người dùng đã đăng nhập có thể đổi mật khẩu |
| FR-AUTH-07 | Phân quyền theo vai trò | Hệ thống giới hạn chức năng hiển thị/thao tác theo Role (RBAC: admin/branch_manager/employee/customer) |
| FR-AUTH-08 | Khách hàng tự đăng ký | Khách hàng tự tạo tài khoản bằng họ tên + SĐT + mật khẩu (email không bắt buộc). Hệ thống **không** tự gắn tài khoản mới vào hồ sơ khách tại quầy trùng số (chưa xác minh được người đăng ký là chủ số): tài khoản luôn nhận hồ sơ riêng; nhân viên xác minh tại quầy rồi gộp lịch sử (FR-CUST-06) |
| FR-AUTH-09 | Xoay vòng refresh token | Mỗi lần làm mới phiên cấp một cặp token mới; token cũ chỉ còn hiệu lực 30 giây để hai tab hoặc luồng realtime làm mới cùng lúc không đá nhau ra, và trong khoảng đó chỉ nhận lại access token |
| FR-AUTH-10 | Thu hồi phiên tức thì | Đăng xuất, đổi mật khẩu và đặt lại mật khẩu làm mọi access token đang lưu hành hết hiệu lực ngay (không đợi 15 phút); thiết bị vừa đổi mật khẩu nhận cặp token mới |
| FR-AUTH-11 | Chính sách mật khẩu | 8–72 byte (72 là giới hạn thật của bcrypt), không nằm trong danh sách mật khẩu phổ biến, không trùng hoặc chứa SĐT, phần tên của email hay họ tên của chính người dùng; áp dụng khi đăng ký, đổi, đặt lại mật khẩu và khi tạo nhân viên hoặc tài khoản khách |
| FR-AUTH-12 | Chống dò tài khoản và chống thử mật khẩu | Thông báo đăng nhập sai giống hệt nhau dù sai tài khoản hay sai mật khẩu, tài khoản không tồn tại vẫn tốn thời gian so sánh như tài khoản có thật, "quên mật khẩu" trả cùng phản hồi cho mọi email; các endpoint đăng nhập, đăng ký, làm mới, quên và đặt lại mật khẩu có giới hạn số lần theo IP |

### 3.2 Dashboard
| Mã | Yêu cầu |
|---|---|
| FR-DASH-01 | Hiển thị doanh thu hôm nay / tuần / tháng |
| FR-DASH-02 | Hiển thị tổng số lượt khách trong kỳ |
| FR-DASH-03 | Hiển thị trạng thái các sân đang hoạt động |
| FR-DASH-04 | Hiển thị Top sân được thuê nhiều nhất |
| FR-DASH-05 | Hiển thị Top phụ kiện bán chạy |
| FR-DASH-06 | Hiển thị biểu đồ doanh thu theo thời gian (line/bar chart) |

### 3.3 Quản lý sân (Court Management)
| Mã | Yêu cầu |
|---|---|
| FR-COURT-01 | Xem danh sách sân kèm trạng thái (Trống/Đang chơi/Bảo trì) |
| FR-COURT-02 | Thêm sân mới |
| FR-COURT-03 | Chỉnh sửa thông tin sân |
| FR-COURT-04 | Xóa sân (chỉ khi không có booking liên quan còn hiệu lực) |
| FR-COURT-05 | Mở sân cho khách chơi, ghi nhận thời điểm bắt đầu |
| FR-COURT-06 | Đóng sân, tính tiền và chuyển sang bước thanh toán |
| FR-COURT-07 | Chuyển trạng thái bảo trì / gỡ bảo trì |
| FR-COURT-08 | Chuyển khách đang chơi sang sân khác, giữ nguyên thời gian đã tính |
| FR-COURT-09 | Cài đặt giá theo khung giờ cao điểm/thấp điểm; tiền sân tính theo phần giao của phiên chơi với khung cao điểm của từng ngày (giờ chi nhánh), cộng phần đã tích luỹ ở các sân trước khi đổi sân |
| FR-COURT-10 | Trạng thái sân gồm hai khái niệm tách biệt: vòng đời khai thác (`active`/`maintenance`/`inactive`, do con người đặt) và tình trạng vận hành (đang chơi hay trống, suy ra từ phiên chơi đang mở) — xem `CourtStateModel.md`; một sân không bao giờ có hai phiên đang mở |
| FR-COURT-11 | Mở sân từ một lịch đặt: lịch phải là của hôm nay (theo chi nhánh); mở quá sớm (hơn 60 phút trước giờ bắt đầu) hoặc sau giờ kết thúc phải được nhân viên xác nhận lại một cách tường minh |
| FR-COURT-12 | Trang Sân và lịch đặt cập nhật tức thì khi có thay đổi ở máy khác (mục 3.13) |
| FR-COURT-13 | Admin hoặc quản lý chi nhánh chỉnh và lưu sơ đồ mặt bằng sân; sơ đồ hiển thị cho khách ở trang Đặt sân và trang chủ |

### 3.4 Quản lý đặt lịch (Booking Management)
| Mã | Yêu cầu |
|---|---|
| FR-BOOK-01 | Tạo lịch đặt sân theo sân, ngày, khung giờ |
| FR-BOOK-02 | Chỉnh sửa lịch đặt (đổi giờ/sân khi chưa diễn ra) |
| FR-BOOK-03 | Hủy lịch đặt |
| FR-BOOK-04 | Xác nhận lịch đặt (Pending → Confirmed) |
| FR-BOOK-05 | Kiểm tra trùng lịch trước khi tạo/sửa booking |
| FR-BOOK-06 | Xem lịch dạng ngày/tuần/tháng (calendar view) |
| FR-BOOK-07 | Nhắc lịch sắp đến (trong app hoặc email) — **chưa triển khai**; hiện hệ thống chỉ thông báo khi lịch đổi trạng thái (FR-NOTI-01) |
| FR-BOOK-08 | Một nguồn duy nhất trả lời "sân này còn nhận khung giờ này không" cho cả trang công khai, màn nhân viên và lúc tạo/sửa booking; kiểm theo thứ tự: sân tồn tại và đang khai thác → khung giờ chưa kết thúc (theo múi giờ chi nhánh) → nằm trọn trong giờ mở cửa (mặc định 05:00–23:00) → không trùng lịch `pending`/`confirmed`. Khung đã bắt đầu nhưng chưa kết thúc vẫn nhận (khách vào quầy giữa giờ) |
| FR-BOOK-09 | Lưới sân × giờ cả ngày cho khách xem không cần đăng nhập: ô 60 phút, trạng thái trống / đã đặt / đã qua / bảo trì, cờ giờ cao điểm; không lộ bất kỳ thông tin khách nào |
| FR-BOOK-10 | Khách đặt tối đa 14 ngày tính từ hôm nay và tối đa 3 giờ mỗi lần; nhân viên không bị giới hạn các mốc này (đặt xa cho giải đấu, sự kiện) |
| FR-BOOK-11 | Chính sách giữ chỗ (cài đặt `booking_policy`): một khách giữ tối đa 5 lịch `pending`/`confirmed` chưa kết thúc cùng lúc; đặt lịch của khách bị giới hạn 20 lần mỗi 10 phút; lịch **do khách tự đặt** mà chưa được duyệt tự huỷ theo hạn cấu hình (mặc định 24 giờ sau khi đặt, nhưng không muộn hơn 60 phút trước giờ bắt đầu và không sớm hơn 15 phút sau khi đặt); lịch do nhân viên tạo không bao giờ tự huỷ |
| FR-BOOK-12 | Trang Đặt sân `/dat-san` là nơi duy nhất khách đặt sân: chọn chi nhánh và ngày, chạm hoặc kéo chọn khung giờ, xem tóm tắt giá, đăng nhập hoặc đăng ký giữa chừng rồi quay lại đúng lựa chọn, xem sơ đồ mặt bằng và địa chỉ chi nhánh |
| FR-BOOK-13 | Danh sách "Lịch của tôi" tách "Sắp tới" và "Lịch sử"; khách xem và huỷ được lịch của chính mình |

### 3.5 Quản lý khách hàng
| Mã | Yêu cầu |
|---|---|
| FR-CUST-01 | Thêm/sửa/xóa khách hàng |
| FR-CUST-02 | Tìm kiếm khách hàng theo tên/SĐT |
| FR-CUST-03 | Xem lịch sử chơi của khách hàng |
| FR-CUST-04 | Xem tổng chi tiêu lũy kế |
| FR-CUST-05 | Phân loại khách hàng thân thiết (hạng `normal`/`gold`/`vip` theo tổng chi tiêu cộng dồn toàn chuỗi) |
| FR-CUST-06 | Gộp hồ sơ tại quầy vào tài khoản online cùng số điện thoại sau khi nhân viên xác minh khách: chuyển lịch sử phiên chơi, lịch đặt, đơn bán lẻ, cộng tổng chi tiêu, tính lại hạng, ghi nhật ký; không gộp tự động |
| FR-CUST-07 | Khách chỉ đọc được hồ sơ và lịch sử của chính mình; hồ sơ gắn tài khoản đăng nhập không xoá được |
| FR-CUST-08 | Số điện thoại khách vãng lai nhập ở quầy được kiểm tra định dạng (rỗng được phép, giá trị rác như `123` hay `abc` bị từ chối) |

### 3.6 Quản lý nhân viên
| Mã | Yêu cầu |
|---|---|
| FR-EMP-01 | Thêm/sửa/xóa nhân viên |
| FR-EMP-02 | Phân quyền nhân viên (gán Role) |
| FR-EMP-03 | Quản lý ca làm việc |
| FR-EMP-04 | Theo dõi hoạt động nhân viên (activity log) |
| FR-EMP-05 | Quản lý chi nhánh chỉ tạo, sửa, xoá được tài khoản `employee` trong chi nhánh của mình; không ai xoá được tài khoản `admin` hoặc chính mình |

### 3.7 Quản lý phụ kiện & kho hàng
| Mã | Yêu cầu |
|---|---|
| FR-ACC-01 | Thêm/sửa/xóa phụ kiện (danh mục dùng chung mọi chi nhánh — tên, giá, ngưỡng cảnh báo) |
| FR-ACC-02 | Quản lý tồn kho theo từng chi nhánh, cảnh báo khi sắp hết hàng |
| FR-ACC-03 | Cập nhật giá bán |
| FR-ACC-04 | Thống kê số lượng bán ra theo kỳ |
| FR-ACC-05 | Quản lý nhà cung cấp (CRUD, dùng chung mọi chi nhánh) |
| FR-ACC-06 | Tạo phiếu nhập kho (chọn nhà cung cấp, nhiều dòng sản phẩm/số lượng/đơn giá); hệ thống tự sinh mã phiếu và cộng vào tồn kho đúng chi nhánh |
| FR-ACC-07 | Tính giá vốn bình quân gia quyền, cập nhật lại mỗi lần nhập kho |
| FR-ACC-08 | Xem sổ nhật ký xuất/nhập kho (8 loại giao dịch: nhập kho, bán ra, trả hàng, điều chỉnh tăng/giảm, hàng hỏng, thất lạc, số dư đầu kỳ), lọc theo sản phẩm/loại/thời gian |
| FR-ACC-09 | Điều chỉnh kho thủ công (hỏng/mất/điều chỉnh tăng-giảm), bắt buộc nhập lý do |

### 3.8 Thanh toán & Hóa đơn
| Mã | Yêu cầu |
|---|---|
| FR-PAY-01 | Tính thời gian chơi chính xác theo giây |
| FR-PAY-02 | Tính tiền sân tự động theo khung giờ |
| FR-PAY-03 | Cộng tiền phụ kiện đã sử dụng trong phiên chơi |
| FR-PAY-04 | Áp dụng giảm giá (mã giảm giá hoặc % thủ công) |
| FR-PAY-05 | Tạo hóa đơn tổng hợp (tiền sân + phụ kiện − giảm giá) |
| FR-PAY-06 | In hóa đơn / Xuất hóa đơn PDF |
| FR-PAY-07 | Hiển thị QR Code thanh toán (chuyển khoản) — chỉ khi đã cấu hình tài khoản ngân hàng và khoá webhook; nếu chưa, mọi thanh toán chuyển khoản (sân, POS, đơn online) bị từ chối |
| FR-PAY-08 | Xác nhận chuyển khoản tự động qua webhook: bắt buộc đúng secret (thiếu cấu hình 503, sai secret 401), phải kèm số tiền khớp giao dịch, không dùng lại mã tham chiếu, không cộng tiền hai lần; mọi lần từ chối đều ghi nhật ký |
| FR-PAY-09 | Chống thanh toán trùng khi client gọi lại (`Idempotency-Key`) |
| FR-PAY-10 | Giảm giá tay phải có lý do; vai trò `employee` bị chặn trần theo cài đặt `discount_policy` (mặc định 10% số còn phải trả); `branch_manager` và `admin` không giới hạn |
| FR-PAY-11 | Huỷ hoá đơn đã thanh toán (void): hoá đơn chuyển `void`, thanh toán chuyển `refunded`, lịch đặt vẫn giữ trạng thái đã hoàn thành (buổi chơi đã diễn ra), có nhật ký; hoàn tiền thực tế thực hiện thủ công tại quầy |
| FR-PAY-12 | Hoá đơn nhiều dòng (tiền sân, phụ kiện, hàng bán lẻ, giảm giá) làm căn cứ cho báo cáo doanh thu chi tiết |

### 3.9 Báo cáo & Thống kê
| Mã | Yêu cầu |
|---|---|
| FR-REP-01 | Báo cáo doanh thu theo ngày/tuần/tháng/năm |
| FR-REP-02 | Báo cáo số lượt khách |
| FR-REP-03 | Báo cáo sân hoạt động nhiều nhất |
| FR-REP-04 | Báo cáo phụ kiện bán chạy |
| FR-REP-05 | Xuất báo cáo ra Excel |
| FR-REP-06 | Xuất báo cáo ra PDF |
| FR-REP-07 | Doanh thu chi tiết theo nguồn: tiền sân / phụ kiện trong sân / bán lẻ / giảm giá; Admin xem được so sánh giữa các chi nhánh |
| FR-REP-08 | Đối chiếu nhập-bán-tồn kho: so khớp số lượng đã trừ kho với số lượng xuất hiện trên hoá đơn để lộ chênh lệch |
| FR-REP-09 | Báo cáo gộp theo ngày của chi nhánh (múi giờ chi nhánh), kể cả chi nhánh ở múi giờ khác nhau |

### 3.10 Cài đặt hệ thống
| Mã | Yêu cầu |
|---|---|
| FR-SET-01 | Cài đặt giá sân theo khung giờ |
| FR-SET-02 | Cài đặt giá phụ kiện |
| FR-SET-03 | Cài đặt giờ hoạt động của sân |
| FR-SET-04 | Cập nhật thông tin sân (tên, địa chỉ, liên hệ) |
| FR-SET-05 | Upload logo |
| FR-SET-06 | Cài đặt theme / Dark Mode (khu khách hàng có cả giao diện sáng và tối; mặc định tối) |
| FR-SET-07 | Cài đặt chính sách: giảm giá tay (`discount_policy`), giữ chỗ (`booking_policy`), thông báo email (`notification_policy`) — `discount_policy` chỉnh ở màn Cài đặt; `booking_policy` và `notification_policy` hiện chỉnh qua `PUT /settings`, chưa có màn hình riêng |

### 3.11 Quản lý đa chi nhánh (Multi-branch)
| Mã | Yêu cầu |
|---|---|
| FR-BR-01 | Admin xem/chuyển đổi chi nhánh đang thao tác qua bộ chuyển chi nhánh (mặc định chi nhánh gốc của Admin) |
| FR-BR-02 | Mọi request gắn header `X-Branch-Id`; hệ thống cách ly dữ liệu (sân, đặt sân, kho, báo cáo...) theo đúng chi nhánh đó |
| FR-BR-03 | Nhân viên / Quản lý chi nhánh bị giới hạn cứng vào đúng chi nhánh của mình, không tự chuyển được sang chi nhánh khác |
| FR-BR-04 | Khách hàng là danh tính dùng chung toàn chuỗi (không gắn theo chi nhánh) — lịch sử chơi, tổng chi tiêu, hạng thành viên được gộp trên mọi chi nhánh |
| FR-BR-05 | Số hóa đơn và mã phiếu nhập kho sinh tuần tự riêng theo từng chi nhánh (không trùng giữa các chi nhánh, không nhảy cóc số khi có giao dịch đồng thời) |
| FR-BR-06 | Chỉ tài khoản nhân viên được gửi `X-Branch-Id`; token của khách kèm header này bị từ chối, và tài khoản `employee`/`branch_manager` chưa gán chi nhánh không dùng được route nào có phạm vi chi nhánh |
| FR-BR-07 | Khách chọn chi nhánh nhận hàng và chi nhánh đặt sân; lựa chọn được nhớ giữa trang chủ, cửa hàng và trang Đặt sân |

### 3.12 Bán lẻ dụng cụ, mã giảm giá và đơn đặt online
Bán lẻ là trụ kinh doanh thứ hai, độc lập với thuê sân: khách không cần chơi sân mới mua được. Danh mục dùng chung toàn chuỗi, tồn kho tách theo chi nhánh.

| Mã | Yêu cầu |
|---|---|
| FR-RET-01 | Quản lý danh mục sản phẩm bán lẻ và nhóm hàng (vợt, áo, quần, giày, phụ kiện…), mỗi sản phẩm có một hoặc nhiều biến thể (SKU, size, màu, giá bán); biến thể có thể không theo dõi tồn kho |
| FR-RET-02 | Tồn kho hàng bán lẻ theo từng chi nhánh, cùng một sổ nhật ký xuất/nhập với phụ kiện trong sân (FR-ACC-08); số lượng chỉ đổi qua một điểm duy nhất trong transaction có khoá dòng nên không bán lố tồn |
| FR-RET-03 | Nhân viên tạo đơn bán lẻ tại quầy (POS): thêm/xoá dòng hàng — **tồn kho bị trừ ngay lúc thêm dòng**, xoá dòng hoặc huỷ đơn thì hoàn kho; mặc định đơn không gắn khách hàng |
| FR-RET-04 | Thanh toán đơn POS bằng tiền mặt (xác nhận ngay) hoặc chuyển khoản (chờ webhook), dùng chung hoá đơn và thanh toán với thuê sân |
| FR-RET-05 | Đơn POS đang mở mà không có thay đổi nào quá 6 giờ tự huỷ và hoàn kho |
| FR-VOU-01 | Quản lý mã giảm giá: giảm theo phần trăm (có trần số tiền giảm tối đa) hoặc số tiền cố định, giá trị đơn tối thiểu, thời hạn hiệu lực, tổng số lượt dùng và số lượt dùng tối đa cho mỗi khách, ngừng áp dụng |
| FR-VOU-02 | Mã áp dụng cho đơn POS và đơn online (không áp dụng cho thanh toán tiền sân); xem trước mức giảm trước khi thanh toán; mức giảm không bao giờ vượt tổng đơn và được làm tròn về đồng nguyên |
| FR-VOU-03 | Lượt dùng mã tính trên đơn đã thanh toán cộng đơn chuyển khoản đang chờ trả; huỷ hoặc hết hạn một đơn nhả lại đúng một lượt |
| FR-ORD-01 | Khách xem cửa hàng theo chi nhánh (giá và còn/hết hàng theo chi nhánh đó, không lộ giá vốn hay số tồn chính xác), có chi tiết sản phẩm và sản phẩm cùng danh mục |
| FR-ORD-02 | Khách đặt đơn online kèm họ tên, số điện thoại liên hệ và ghi chú, chọn chi nhánh nhận hàng; giá lấy từ máy chủ, tồn kho bị trừ ngay để giữ hàng; không đủ tồn thì cả đơn bị từ chối |
| FR-ORD-03 | Đơn online thanh toán **tiền mặt** khi tới nhận hàng, nhân viên chốt tại quầy; đơn **chuyển khoản** sinh hoá đơn và mã VietQR kèm hạn 30 phút, webhook xác nhận thì đơn tự chuyển `paid`, quá hạn thì tự huỷ, nhả mã giảm giá và hoàn kho |
| FR-ORD-04 | Khách xem danh sách và chi tiết đơn của chính mình (người khác đoán mã đơn vẫn nhận 404) và tự huỷ đơn chưa thanh toán |
| FR-ORD-05 | Tiền chuyển về sau khi đơn đã huỷ bị webhook từ chối (409) và ghi nhật ký kèm số tiền và mã giao dịch để quầy hoàn tiền thủ công; chưa có màn hình cảnh báo riêng cho ca này |

### 3.13 Thông báo, thời gian thực và nhật ký hoạt động
| Mã | Yêu cầu |
|---|---|
| FR-NOTI-01 | Khách có tài khoản nhận thông báo trong ứng dụng khi lịch đặt được xác nhận, bị tự huỷ do chưa được duyệt, bị nhân viên huỷ, hoặc bị đổi sân/ngày/giờ; nội dung chỉ chứa tên sân, ngày, giờ — không có tên nhân viên hay số điện thoại; thông báo được ghi trong cùng giao dịch với thay đổi lịch |
| FR-NOTI-02 | Chuông thông báo ở thanh đầu trang của khách (số chưa đọc, danh sách, đánh dấu đã đọc từng cái hoặc tất cả), trang `/notifications` đầy đủ; khách chỉ đọc và sửa được thông báo của chính mình; thông báo đã đọc quá 30 ngày và mọi thông báo quá 90 ngày tự xoá |
| FR-NOTI-03 | Thông báo qua email là phần bổ sung gửi sau khi giao dịch hoàn tất, chỉ khi đã cấu hình SMTP, khách có email và cài đặt `notification_policy.email` chưa tắt; gửi lỗi không làm hỏng nghiệp vụ |
| FR-RT-01 | Máy nhân viên nhận luồng SSE theo chi nhánh: thay đổi sân (`court:updated`) và lịch đặt (`booking:changed`) chỉ mang tín hiệu "có thay đổi" cùng mã chi nhánh/mã đối tượng, không kèm dữ liệu cá nhân; trang tự nạp lại và không nạp lại lúc nhân viên đang nhập dở form |
| FR-RT-02 | Luồng realtime tự làm mới token trước mỗi lần nối lại, lùi dần thời gian thử lại (2 → 30 giây), coi 60 giây không có nhịp `ping` là đứt kết nối và nạp lại dữ liệu khi nối lại |
| FR-LOG-01 | Ghi nhật ký hoạt động cho mọi thao tác nhạy cảm (mở/đóng sân, huỷ lịch, giảm giá, thanh toán, webhook bị từ chối, gộp hồ sơ khách, void hoá đơn…) kèm giá trị trước/sau và mã truy vết yêu cầu; có màn hình xem và lọc nhật ký cho Admin và quản lý chi nhánh |
| FR-LOG-02 | Nhật ký không bao giờ chứa mật khẩu, token hay bí mật khác |

### 3.14 Thi đấu (dịch vụ độc lập)
Thi đấu là một dịch vụ riêng (`services/competition-service`) có cơ sở dữ liệu riêng; đặc tả đầy đủ nằm ở `services/competition-service/docs/`. SRS này chỉ nêu các yêu cầu mà app chính phải đáp ứng.

| Mã | Yêu cầu |
|---|---|
| FR-COMP-01 | Chấm trình theo biểu mẫu 12 tiêu chí; điểm trình đơn và đôi trong khoảng 1.0–7.0, tự điều chỉnh theo kết quả thi đấu; người chưa có điểm phải tự chấm trước khi đăng ký thi đấu |
| FR-COMP-02 | Giải đấu 3 thể thức (vòng tròn, vòng bảng rồi loại trực tiếp, loại trực tiếp): đăng ký, bốc thăm, sơ đồ dạng hình, gọi trận kế tiếp theo sân và giờ dự kiến, điểm danh, xử thua cho đội vắng, chốt giải và bảng xếp hạng thành tích |
| FR-COMP-03 | Buổi giao lưu: đăng ký trước có giới hạn người chơi và danh sách chờ (tự thăng hạng khi có người rút), điểm danh, tự xếp sân trống và ghép cặp cân bằng, đóng buổi |
| FR-COMP-04 | Bấm điểm trực tiếp từng pha cầu trên điện thoại (nhân viên và người chơi trong trận), hoàn tác, không cộng trùng khi bấm đúp; tỉ số lên màn hình TV tức thì qua SSE |
| FR-COMP-05 | Bảng xếp hạng trình độ và thành tích, thống kê người chơi |
| FR-COMP-06 | Khu công khai `/thi-dau` xem không cần đăng nhập: giải đang mở, buổi giao lưu, bảng đấu, tỉ số trực tiếp, bảng xếp hạng; hồ sơ người chơi chỉ lộ theo chế độ riêng tư của họ (khách chưa đăng nhập chỉ thấy hồ sơ công khai bằng tên ngắn; người còn lại hiện là "Thành viên XXXX") |
| FR-COMP-07 | Khách có tài khoản tự đăng ký giải và buổi giao lưu, không cần nhân viên duyệt; giải đôi cặp cố định đăng ký cả hai người một lần, đồng đội chưa có tài khoản được tạo hồ sơ tạm (ẩn, tối đa 5 hồ sơ mới mỗi người mỗi 24 giờ) để nhân viên xác nhận điểm tại quầy; chỉ rút được trước khi bốc thăm |
| FR-COMP-08 | Lệ phí tham gia (200.000đ mỗi người) chỉ hiển thị và thu tại quầy, chưa thu trực tuyến |
| FR-COMP-09 | Dữ liệu khách hàng đổi ở app chính (sửa, gộp, xoá) được đồng bộ sang hồ sơ thi đấu qua sự kiện ký HMAC, giữ thứ tự theo từng đối tượng, có thử lại và trạng thái `dead`; sự kiện hoàn tất giải/buổi chiều ngược lại được ghi vào nhật ký hoạt động của app chính |
| FR-COMP-10 | Dịch vụ thi đấu chỉ nhận yêu cầu qua cổng của app chính với token dịch vụ ES256 sống ngắn, quyền bị cắt theo vai trò; thiếu cấu hình thì cổng trả 503 và menu "Thi đấu" tự ẩn, cấu hình nửa vời thì máy chủ không khởi động |

---

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)

### 4.1 Hiệu năng
- Thời gian phản hồi API trung bình < 2 giây.
- Hệ thống hỗ trợ tối thiểu 100 người dùng đồng thời; đã kiểm bằng k6 (smoke, tải trộn 100 người dùng ảo, đột biến 200 người dùng ảo vào nhóm `/public`). Kết quả và cảnh báo khi đo (CSDL còn lạnh làm p95 chậm gấp nhiều lần) ở `k6/README.md` và `TestPlan.md`.
- Truy vấn cơ sở dữ liệu được tối ưu bằng index và tránh N+1 query; các endpoint công khai có số câu SQL cố định (ví dụ lưới sân × giờ luôn 6 câu).
- Khu công khai có giới hạn tần suất riêng đủ rộng cho một quán dùng chung một IP Wi-Fi.

### 4.2 Bảo mật
- Mật khẩu mã hóa bằng bcrypt (không lưu plain text); mật khẩu và refresh token không bao giờ có trong phản hồi API hay nhật ký (mô hình `User` mặc định loại các cột này, chỉ tầng xác thực mới nạp).
- Xác thực bằng JWT (access token + refresh token xoay vòng, thu hồi tức thì — FR-AUTH-09, 10).
- Phân quyền chặt chẽ theo Role ở cả Frontend và Backend (không chỉ ẩn UI) cùng cách ly dữ liệu theo chi nhánh; dữ liệu vận hành (sân, phụ kiện, sản phẩm, danh mục) chỉ cho nhân viên đọc, trang khách dùng nhóm `/public` đã lược bỏ thông tin nhạy cảm.
- Validate toàn bộ dữ liệu đầu vào (Express Validator): mã số luôn là số nguyên trong miền hợp lệ, độ dài chuỗi khớp cột, ngày giờ đúng định dạng; lỗi khoá chết hoặc hết thời gian chờ của MySQL trả 409, giá trị ngoài miền trả 400.
- Sử dụng Sequelize ORM với parameterized query để chống SQL Injection.
- Trình duyệt nhận các header bảo mật trên mọi phản hồi (Content-Security-Policy, chặn nhúng khung, chặn đoán kiểu nội dung, chính sách tham chiếu, HSTS khi chạy HTTPS); mọi phản hồi `/api/v1` trừ nhóm `/public` đều `no-store`. Thêm tên miền ngoài vào giao diện (font, CDN, ảnh) phải khai báo trong chính sách CSP.
- Tiền: chuyển khoản tắt mặc định, webhook chặn mặc định, mọi lần từ chối ghi nhật ký (FR-PAY-07, 08).
- Dịch vụ thi đấu không nhận JWT của người dùng; mọi cuộc gọi đi qua cổng với token dịch vụ ngắn hạn (FR-COMP-10).
- Cấu hình nguy hiểm khiến máy chủ **từ chối khởi động** thay vì chạy mập mờ: hai JWT secret trùng nhau hoặc còn giá trị mẫu, cấu hình thi đấu thiếu, khoá ES256 sai.
- Đã có đợt kiểm thử bảo mật toàn hệ thống (ma trận route × vai trò, IDOR, chéo chi nhánh, tiền, rò dữ liệu, header, thư viện, quét tĩnh và động); phát hiện và cách xử lý ở `docs/05-extra/02-remediation/33-ket-qua-kiem-thu-bao-mat.md` và `38-tong-hop-ket-qua-kiem-thu-bao-mat.md`.

### 4.3 Khả năng sử dụng (Usability)
- Giao diện responsive trên Mobile, Tablet, Desktop; khu khách hàng có thanh tab dưới cố định trên điện thoại.
- Ngôn ngữ giao diện: Tiếng Việt.
- Thao tác chính (mở sân, đóng sân, checkout) tối đa 3 bước.
- Toàn bộ khu khách hàng (trang chủ, đặt sân, cửa hàng, thi đấu) dùng chung một thanh đầu trang, một chân trang và một bộ nhận diện thương hiệu; mọi trang trong khu này có cả giao diện sáng và tối.
- Lỗi của luồng đặt sân hiển thị ngay trong trang bằng thông điệp tiếng Việt nói rõ cách xử lý, không dùng hộp thoại của trình duyệt; hộp xác nhận giữ tiêu điểm bàn phím.

### 4.4 Độ tin cậy & Khả dụng
- Backend ghi log ra stdout/stderr để Docker hoặc Render thu (dịch vụ thi đấu dùng `pino`); nhật ký hoạt động trong CSDL có mã truy vết yêu cầu để phục vụ debug và audit.
- Sao lưu dữ liệu định kỳ (đề xuất ở giai đoạn triển khai; bản demo là dữ liệu seed nên tái tạo được thay vì sao lưu). Sao lưu hai database (app chính và thi đấu) phải cùng thời điểm.
- Các việc nền (tự huỷ lịch chưa duyệt, tự huỷ đơn chuyển khoản quá hạn, huỷ đơn POS bỏ dở, dọn thông báo cũ) chạy mỗi 5 phút trong tiến trình backend.
- `GET /health` báo tiến trình còn sống kèm mã commit đang chạy để xác minh bản nào đã lên.
- Frontend chịu được mất mạng ngắn: chỉ đăng xuất khi máy chủ từ chối làm mới phiên, lỗi mạng hoặc 5xx thì thử lại.

### 4.5 Khả năng mở rộng (Scalability)
- Dễ dàng thêm sân mới, phụ kiện mới mà không cần thay đổi code.
- Multi-branch đã được triển khai (xem 3.11); mô hình multi-tenant nhiều tổ chức độc lập (bảng `organizations`) vẫn để ngỏ cho tương lai.
- Dễ tích hợp cổng thanh toán thực tế (VNPay, Momo...) ở giai đoạn sau; hiện đã có đường xác nhận chuyển khoản qua webhook.
- Phần thi đấu đã tách thành dịch vụ riêng với ranh giới kiểm tra được (`npm run check-boundaries`), nên có thể chạy, kiểm thử và triển khai độc lập.

### 4.6 Khả năng bảo trì (Maintainability)
- Code tổ chức theo kiến trúc phân lớp: routes → controllers → services → models.
- Tài liệu API bằng Swagger/OpenAPI sinh tự động từ Postman collection và có chốt chống lệch pha với `routes/` (thêm route mà quên thêm vào collection thì `npm run docs:build` báo lỗi); dịch vụ thi đấu có spec riêng.
- Quy tắc nghiệp vụ quan trọng nằm trong các hàm thuần có kiểm thử (tính tiền sân, luật đặt sân, chính sách giữ chỗ, chính sách mật khẩu, cấu hình HTTP và triển khai); dữ liệu menu của khu khách chỉ nằm ở một nơi.
- CI chạy kiểm thử backend, dịch vụ thi đấu (trên MySQL thật), frontend và build image Docker; các action của GitHub được ghim theo mã commit.

---

## 5. Yêu cầu giao diện ngoài (External Interface Requirements)

### 5.1 Giao diện người dùng
- Web app responsive, xây dựng bằng React + Tailwind CSS.
- Khu quản trị và nhân viên: Login, Dashboard, Courts (kèm sơ đồ mặt bằng), Bookings, Retail (POS), Accessories (phụ kiện, kho, nhà cung cấp), Customers, Employees, History, Reports, Activity Log, Settings, và nhóm màn hình thi đấu (giải đấu, buổi giao lưu, bấm điểm, màn hình TV, người chơi, bảng xếp hạng).
- Khu khách hàng: Trang chủ, Đặt sân (`/dat-san`), Cửa hàng và chi tiết sản phẩm, Giỏ hàng và thanh toán, Đơn hàng, Lịch của tôi, Thông báo, Tài khoản (kèm thẻ trình độ), đăng nhập, đăng ký, quên mật khẩu.
- Khu công khai thi đấu: `/thi-dau` (giải đang mở, buổi giao lưu), trang giải, trang buổi giao lưu, bảng xếp hạng, hồ sơ người chơi.

### 5.2 Giao diện phần mềm
- RESTful API (JSON) giữa Frontend và Backend; luồng SSE cho cập nhật thời gian thực.
- Kết nối cơ sở dữ liệu MySQL qua Sequelize ORM (TLS khi dùng dịch vụ MySQL đám mây).
- Backend ↔ dịch vụ thi đấu: cổng nội bộ (token dịch vụ ES256), sự kiện hai chiều ký HMAC (`integration_outbox`, `integration_inbox`).
- Webhook nhận xác nhận chuyển khoản từ dịch vụ báo có bên ngoài (secret dùng chung).
- SMTP (tuỳ chọn) cho email quên mật khẩu và thông báo.

### 5.3 Giao diện phần cứng
- Không có yêu cầu phần cứng đặc biệt; chạy trên trình duyệt web hiện đại.

---

## 6. Ma trận truy vết yêu cầu (Traceability tóm tắt)

| Module | Liên kết tài liệu tiếp theo |
|---|---|
| Court, Booking, Customer, Employee, Accessories, Payment, Retail, Notification | → Use Case Specification |
| Users, Roles, Courts, Bookings, Payments, Products, Vouchers, Notifications, Outbox/Inbox... | → Database Design / ERD |
| Toàn bộ endpoint trong mục 3 | → API Design (và `/api-docs` khi chạy backend) |
| Kiến trúc hai dịch vụ, cổng nối, triển khai | → System Architecture, Deployment Guide |
| Mục 3.14 Thi đấu | → `services/competition-service/docs/` |
| Kiểm chứng yêu cầu | → Test Plan |

---

## 7. Phụ lục
- Tài liệu này sẽ được cập nhật khi có thay đổi phạm vi hoặc yêu cầu mới.
- Các tài liệu liên quan: `UseCase.md`, `DatabaseDesign.md`, `APIDesign.md`, `Architecture.md`, `TestPlan.md`, `DeploymentGuide.md`.
- Việc chưa làm và đã biết (không nằm trong phạm vi các yêu cầu trên): nhắc lịch sắp đến (FR-BOOK-07), thu lệ phí thi đấu trực tuyến, xác minh số điện thoại bằng OTP, màn hình chỉnh `booking_policy` và `notification_policy`, nhiều thiết bị đăng nhập cùng lúc không bị đá nhau (mỗi tài khoản giữ một refresh token), hoàn tiền tự động, thuế/VAT. Danh sách cập nhật nằm ở `docs/05-extra/02-remediation/00-tien-do.md`.

---

## 8. Lịch sử thay đổi

| Phiên bản | Ngày | Thay đổi chính |
|---|---|---|
| v1.0 | 19/07/2026 | Bản đầu tiên |
| v1.1 | 15/08/2026 | Đa chi nhánh, vai trò `branch_manager`, kho hàng và nhà cung cấp, đăng nhập bằng SĐT hoặc email, khách tự đăng ký |
| v1.2 | 18/10/2026 | Thêm bán lẻ POS, mã giảm giá, đơn online và chuyển khoản VietQR (3.12); thông báo, thời gian thực, nhật ký (3.13); dịch vụ thi đấu và khu công khai (3.14); luật đặt sân, lưới sân × giờ, chính sách giữ chỗ (FR-BOOK-08…13); xoay vòng và thu hồi phiên, chính sách mật khẩu (FR-AUTH-09…12); sửa FR-AUTH-08 (đăng ký không còn tự gắn hồ sơ khách tại quầy); gộp hồ sơ do nhân viên xác minh (FR-CUST-06); giảm giá có lý do và trần theo vai trò, void hoá đơn (FR-PAY-08…12); báo cáo doanh thu chi tiết và đối chiếu kho; bổ sung yêu cầu phi chức năng về bảo mật, độ tin cậy, bảo trì; cập nhật phạm vi, vai trò và giao diện |
