# Software Requirement Specification (SRS)
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.0
**Ngày:** 19/07/2026
**Loại tài liệu:** Software Requirement Specification (SRS)

---

## 1. Giới thiệu

### 1.1 Mục đích tài liệu
Tài liệu này mô tả chi tiết các yêu cầu chức năng và phi chức năng của hệ thống **Badminton Digital Management** — một hệ thống quản lý sân cầu lông toàn diện, phục vụ vận hành thực tế của một sân cầu lông thương mại. Tài liệu là cơ sở để đội ngũ phát triển thiết kế, triển khai và kiểm thử hệ thống, đồng thời là tài liệu tham chiếu khi trình bày dự án trong CV/portfolio.

### 1.2 Phạm vi dự án
Badminton Digital Management là một ứng dụng web full-stack, hỗ trợ:
- Quản lý sân, đặt lịch, thanh toán, hóa đơn
- Quản lý khách hàng và nhân viên
- Quản lý phụ kiện và tồn kho
- Dashboard thống kê và báo cáo doanh thu
- Phân quyền người dùng theo vai trò (Admin, Nhân viên, Khách hàng)

Phạm vi **không bao gồm**: hệ thống thanh toán trực tuyến thực tế (cổng thanh toán), ứng dụng di động native (chỉ responsive web), và quản lý đa chi nhánh ở phiên bản đầu tiên (được để ngỏ cho khả năng mở rộng).

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
7. Quản lý phụ kiện
8. Thanh toán & Hóa đơn
9. Báo cáo & Thống kê
10. Cài đặt hệ thống

### 2.3 Đối tượng người dùng (User Roles)

| Vai trò | Mô tả | Quyền hạn chính |
|---|---|---|
| **Admin** | Chủ sân / quản trị hệ thống | Toàn quyền: quản lý sân, nhân viên, giá, báo cáo, cài đặt |
| **Nhân viên (Employee)** | Nhân viên vận hành tại quầy | Mở/đóng sân, tạo booking, checkout, quản lý khách hàng, không cấu hình hệ thống |
| **Khách hàng (Customer)** | Người thuê sân | Xem lịch trống, đặt lịch, xem lịch sử chơi và chi tiêu của bản thân |

### 2.4 Ràng buộc chung
- Toàn bộ giao diện hỗ trợ tiếng Việt.
- Hệ thống phải responsive trên Desktop, Tablet, Mobile.
- Dữ liệu nhạy cảm (mật khẩu) phải được mã hóa (bcrypt).
- Giao tiếp Frontend–Backend qua RESTful API, dữ liệu JSON.

### 2.5 Giả định và phụ thuộc
- Hệ thống chạy trên môi trường có kết nối Internet ổn định.
- MySQL server sẵn sàng và được cấu hình đúng.
- Giả định mỗi sân chỉ phục vụ 1 nhóm khách tại 1 thời điểm.

---

## 3. Yêu cầu chức năng chi tiết

### 3.1 Authentication & Authorization
| Mã | Yêu cầu | Mô tả |
|---|---|---|
| FR-AUTH-01 | Đăng nhập | Người dùng đăng nhập bằng email/username + password |
| FR-AUTH-02 | Đăng xuất | Hủy phiên đăng nhập hiện tại |
| FR-AUTH-03 | JWT Access Token | Cấp access token có thời hạn ngắn sau đăng nhập |
| FR-AUTH-04 | Refresh Token | Cấp lại access token khi hết hạn mà không cần đăng nhập lại |
| FR-AUTH-05 | Quên mật khẩu | Gửi link/mã đặt lại mật khẩu qua email |
| FR-AUTH-06 | Đổi mật khẩu | Người dùng đã đăng nhập có thể đổi mật khẩu |
| FR-AUTH-07 | Phân quyền theo vai trò | Hệ thống giới hạn chức năng hiển thị/thao tác theo Role (RBAC) |

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
| FR-COURT-09 | Cài đặt giá theo khung giờ cao điểm/thấp điểm |

### 3.4 Quản lý đặt lịch (Booking Management)
| Mã | Yêu cầu |
|---|---|
| FR-BOOK-01 | Tạo lịch đặt sân theo sân, ngày, khung giờ |
| FR-BOOK-02 | Chỉnh sửa lịch đặt (đổi giờ/sân khi chưa diễn ra) |
| FR-BOOK-03 | Hủy lịch đặt |
| FR-BOOK-04 | Xác nhận lịch đặt (Pending → Confirmed) |
| FR-BOOK-05 | Kiểm tra trùng lịch trước khi tạo/sửa booking |
| FR-BOOK-06 | Xem lịch dạng ngày/tuần/tháng (calendar view) |
| FR-BOOK-07 | Nhắc lịch sắp đến (trong app hoặc email) |

### 3.5 Quản lý khách hàng
| Mã | Yêu cầu |
|---|---|
| FR-CUST-01 | Thêm/sửa/xóa khách hàng |
| FR-CUST-02 | Tìm kiếm khách hàng theo tên/SĐT |
| FR-CUST-03 | Xem lịch sử chơi của khách hàng |
| FR-CUST-04 | Xem tổng chi tiêu lũy kế |
| FR-CUST-05 | Phân loại khách hàng thân thiết (dựa trên tần suất/chi tiêu) |

### 3.6 Quản lý nhân viên
| Mã | Yêu cầu |
|---|---|
| FR-EMP-01 | Thêm/sửa/xóa nhân viên |
| FR-EMP-02 | Phân quyền nhân viên (gán Role) |
| FR-EMP-03 | Quản lý ca làm việc |
| FR-EMP-04 | Theo dõi hoạt động nhân viên (activity log) |

### 3.7 Quản lý phụ kiện
| Mã | Yêu cầu |
|---|---|
| FR-ACC-01 | Thêm/sửa/xóa phụ kiện |
| FR-ACC-02 | Quản lý tồn kho, cảnh báo khi sắp hết hàng |
| FR-ACC-03 | Cập nhật giá bán |
| FR-ACC-04 | Thống kê số lượng bán ra theo kỳ |

### 3.8 Thanh toán & Hóa đơn
| Mã | Yêu cầu |
|---|---|
| FR-PAY-01 | Tính thời gian chơi chính xác theo giây |
| FR-PAY-02 | Tính tiền sân tự động theo khung giờ |
| FR-PAY-03 | Cộng tiền phụ kiện đã sử dụng trong phiên chơi |
| FR-PAY-04 | Áp dụng giảm giá (mã giảm giá hoặc % thủ công) |
| FR-PAY-05 | Tạo hóa đơn tổng hợp (tiền sân + phụ kiện − giảm giá) |
| FR-PAY-06 | In hóa đơn / Xuất hóa đơn PDF |
| FR-PAY-07 | Hiển thị QR Code thanh toán (chuyển khoản) |

### 3.9 Báo cáo & Thống kê
| Mã | Yêu cầu |
|---|---|
| FR-REP-01 | Báo cáo doanh thu theo ngày/tuần/tháng/năm |
| FR-REP-02 | Báo cáo số lượt khách |
| FR-REP-03 | Báo cáo sân hoạt động nhiều nhất |
| FR-REP-04 | Báo cáo phụ kiện bán chạy |
| FR-REP-05 | Xuất báo cáo ra Excel |
| FR-REP-06 | Xuất báo cáo ra PDF |

### 3.10 Cài đặt hệ thống
| Mã | Yêu cầu |
|---|---|
| FR-SET-01 | Cài đặt giá sân theo khung giờ |
| FR-SET-02 | Cài đặt giá phụ kiện |
| FR-SET-03 | Cài đặt giờ hoạt động của sân |
| FR-SET-04 | Cập nhật thông tin sân (tên, địa chỉ, liên hệ) |
| FR-SET-05 | Upload logo |
| FR-SET-06 | Cài đặt theme / Dark Mode |

---

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)

### 4.1 Hiệu năng
- Thời gian phản hồi API trung bình < 2 giây.
- Hệ thống hỗ trợ tối thiểu 100 người dùng đồng thời.
- Truy vấn cơ sở dữ liệu được tối ưu bằng index và tránh N+1 query.

### 4.2 Bảo mật
- Mật khẩu mã hóa bằng bcrypt (không lưu plain text).
- Xác thực bằng JWT (access token + refresh token).
- Phân quyền chặt chẽ theo Role ở cả Frontend và Backend (không chỉ ẩn UI).
- Validate toàn bộ dữ liệu đầu vào (Express Validator).
- Sử dụng Sequelize ORM với parameterized query để chống SQL Injection.

### 4.3 Khả năng sử dụng (Usability)
- Giao diện responsive trên Mobile, Tablet, Desktop.
- Ngôn ngữ giao diện: Tiếng Việt.
- Thao tác chính (mở sân, đóng sân, checkout) tối đa 3 bước.

### 4.4 Độ tin cậy & Khả dụng
- Ghi log lỗi hệ thống (logs/) để phục vụ debug.
- Sao lưu dữ liệu định kỳ (đề xuất ở giai đoạn triển khai).

### 4.5 Khả năng mở rộng (Scalability)
- Dễ dàng thêm sân mới, phụ kiện mới mà không cần thay đổi code.
- Kiến trúc cho phép mở rộng thêm chi nhánh (multi-branch) trong tương lai.
- Dễ tích hợp cổng thanh toán thực tế (VNPay, Momo...) ở giai đoạn sau.

### 4.6 Khả năng bảo trì (Maintainability)
- Code tổ chức theo kiến trúc phân lớp: routes → controllers → services → models.
- Tài liệu API bằng Swagger/OpenAPI để dễ tra cứu và mở rộng.

---

## 5. Yêu cầu giao diện ngoài (External Interface Requirements)

### 5.1 Giao diện người dùng
- Web app responsive, xây dựng bằng React + Tailwind CSS.
- Các trang chính: Login, Dashboard, Courts, Bookings, Customers, Employees, History, Reports, Settings.

### 5.2 Giao diện phần mềm
- RESTful API (JSON) giữa Frontend và Backend.
- Kết nối cơ sở dữ liệu MySQL qua Sequelize ORM.

### 5.3 Giao diện phần cứng
- Không có yêu cầu phần cứng đặc biệt; chạy trên trình duyệt web hiện đại.

---

## 6. Ma trận truy vết yêu cầu (Traceability tóm tắt)

| Module | Liên kết tài liệu tiếp theo |
|---|---|
| Court, Booking, Customer, Employee, Accessories, Payment | → Use Case Specification |
| Users, Roles, Courts, Bookings, Payments... | → Database Design / ERD |
| Toàn bộ endpoint trong mục 3 | → API Design |

---

## 7. Phụ lục
- Tài liệu này sẽ được cập nhật khi có thay đổi phạm vi hoặc yêu cầu mới.
- Các tài liệu liên quan: `UseCase.md`, `DatabaseDesign.md`, `APIDesign.md`, `Architecture.md`, `TestPlan.md`.
