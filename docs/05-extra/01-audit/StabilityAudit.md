# Đánh giá Độ ổn định & Độ tin cậy (Stability Audit)

> Phạm vi: các vấn đề về **tính đúng đắn khi vận hành thật, khả năng chịu tải, khả năng phục hồi sau lỗi** — không trùng với `SecurityAudit.md` (auth, injection, RBAC...), dù một vài phát hiện có màu sắc bảo mật (ví dụ race condition) vẫn được liệt ở đây vì gốc rễ là vấn đề đồng thời/giao dịch.
>
> Ngày rà soát: 2026-08-15. Người đọc mục tiêu: chủ dự án, không cần nền tảng kỹ thuật sâu — mỗi phát hiện đều giải thích **khi nào nó thật sự gây lỗi** (tải cao? nhiều người thao tác cùng lúc? mạng chập chờn?) chứ không liệt kê lý thuyết suông.

## 1. Mục đích tài liệu

Trả lời câu hỏi: "Nếu quán đông khách, nhiều nhân viên thao tác cùng lúc, hoặc chạy nhiều tháng liền không nghỉ, hệ thống có chỗ nào âm thầm sai lệch dữ liệu, đứng hình, hoặc sập không?" Tài liệu liệt kê từng phát hiện kèm vị trí code cụ thể (file:dòng), kịch bản gây lỗi, mức độ, và hướng khắc phục ngắn gọn — đồng thời liệt kê rõ những phần **đã làm tốt** để không tạo cảm giác cả hệ thống bấp bênh.

Kết luận nhanh: phần lõi nghiệp vụ tiền bạc (đặt sân, mở/đóng sân, thanh toán, kho hàng) được viết rất cẩn thận — transaction + khoá dòng (`FOR UPDATE`) gần như ở khắp nơi cần thiết. Các vấn đề tìm được chủ yếu nằm ở lớp ngoài rìa: một luồng ghi dữ liệu khách hàng bị bỏ sót transaction, xử lý lỗi/observability còn sơ khai, và một số điểm sẽ chỉ lộ ra khi dữ liệu/tải tăng lên theo thời gian.

## 2. Bảng tóm tắt mức độ rủi ro

| # | Phát hiện | Vị trí | Mức độ |
|---|---|---|---|
| 1 | Sửa hồ sơ khách hàng ghi 2 bảng (`users`, `customers`) không có transaction | `backend/src/services/CustomerService.js:158-192` | **Nghiêm trọng** |
| 2 | Không có `ErrorBoundary` — 1 component lỗi là trắng trang toàn app | `frontend/src/App.jsx`, không có file `ErrorBoundary` nào trong `frontend/src` | Nên cải thiện |
| 3 | `errorHandler` không phân biệt lỗi dự kiến/không dự kiến, không theo `NODE_ENV` | `backend/src/middleware/errorHandler.js:1-13` | Nên cải thiện |
| 4 | Không có handler bắt route không tồn tại trước `errorHandler` | `backend/src/server.js:44-46` | Nên cải thiện |
| 5 | Không cấu hình connection pool cho Sequelize (dùng mặc định max 5) | `backend/src/config/config.js` (toàn bộ 3 môi trường) | Nên cải thiện |
| 6 | `cancelBooking`/`confirmBooking` đọc trạng thái booking không khoá, không tái kiểm tra trong transaction | `backend/src/services/BookingService.js:281-354` | Nên cải thiện |
| 7 | Transaction `SERIALIZABLE` (đặt/sửa lịch) không có cơ chế retry khi deadlock | `backend/src/services/BookingService.js:124,195` | Nên cải thiện |
| 8 | `apiClient` không dùng chung 1 promise refresh-token khi nhiều request 401 cùng lúc; refresh thất bại không đồng bộ lại state đăng nhập | `frontend/src/services/apiClient.js:29-59` | Nên cải thiện |
| 9 | Xuất báo cáo Excel/PDF dựng toàn bộ dữ liệu + file trong bộ nhớ, không giới hạn khoảng ngày | `backend/src/services/ReportService.js:129-148`, `backend/src/utils/reportExporter.js` | Ghi chú |
| 10 | Không có index gộp `(branch_id, status, paid_at)` cho bảng `payments` dù dashboard lọc đúng 3 cột này mỗi lần mở | `backend/src/services/ReportService.js:16-63`, `backend/src/migrations/20260805000001-m1-organizations-branches.js:160-198` | Ghi chú |
| 11 | Rollback Plan giả định luôn có `down()` phục hồi được, nhưng nhiều migration cố ý không thể hoàn tác ngoài 3 migration đã nêu | `docs/DeploymentGuide.md:228-231` vs. `backend/src/migrations/20260814100005-*.js`, `20260814110001-*.js` | Ghi chú |
| 12 | Khoảng trống test: 6 file unit test backend (đều không đụng DB), 1 file test frontend — các luồng nghiệp vụ chính chưa có test | `backend/tests/*`, `frontend/src/utils/roles.test.js` | Ghi chú |
| 13 | Không có structured logging / error tracking (Sentry...) / APM | `backend/package.json`, rải rác `console.log` | Ghi chú |
| 14 | Mỗi user chỉ giữ 1 refresh token — đăng nhập thiết bị thứ 2 âm thầm đăng xuất thiết bị đầu (đã xác nhận bằng test thật, xem `SessionRefreshIssue.md`) | `backend/src/services/AuthService.js:22-80` | Ghi chú |
| 15 | **[Bổ sung 16/08]** Bundle frontend gộp 1 file JS ~800KB, chưa tách route/code-splitting | `frontend/` (kết quả `npm run build`) | Ghi chú |
| 16 | **[Bổ sung 16/08]** `depends_on` không có health check — backend có thể khởi động trước khi MySQL sẵn sàng lần đầu | `docker/docker-compose.yml` | Ghi chú |
| 17 | **[Bổ sung 16/08]** `Branch.timezone` được lưu nhưng không nơi nào dùng — mốc "hôm nay" ở báo cáo tính theo giờ server, không theo chi nhánh | `backend/src/models/Branch.js:15`, `backend/src/utils/dateTime.js` | Ghi chú |

## 3. Chi tiết từng phát hiện

### 3.1 [Nghiêm trọng] Sửa hồ sơ khách hàng ghi 2 bảng không có transaction

**Vị trí:** `backend/src/services/CustomerService.js:158-192` (hàm `updateCustomer`)

**Vấn đề:** Khi đổi số điện thoại của một khách hàng đã có tài khoản đăng nhập (`customer.userId` khác null), hàm này thực hiện **hai lệnh ghi trên hai bảng khác nhau** nhưng không hề mở `sequelize.transaction()`:

```js
// dòng 188
await User.update({ phone: payload.phone }, { where: { id: customer.userId } });
...
// dòng 191
return await customer.update(payload);
```

So sánh với mọi service khác trong hệ thống (`EmployeeService`, `SupplierService`, `AuthService.register`, `CourtService`...) — tất cả đều bọc các thao tác ghi nhiều bước trong `sequelize.transaction()`. Đây là chỗ duy nhất tìm được vi phạm quy tắc đó.

**Kịch bản gây lỗi thật:**
- Mất kết nối DB, timeout, hoặc process bị restart đúng lúc giữa hai lệnh `update` (ví dụ deploy lại server, hoặc MySQL tạm ngắt) → `users.phone` đã đổi nhưng `customers.phone` thì chưa (hoặc ngược lại nếu thứ tự đảo). Khách hàng đăng nhập bằng SĐT mới nhưng hồ sơ khách hàng của họ (lịch sử chơi, `totalSpent`, hạng thành viên) lại vẫn tra theo SĐT cũ — hai nơi "nói khác nhau" về cùng một khách.
- Hai nhân viên sửa cùng một khách hàng gần như đồng thời (đổi sang 2 số khác nhau): không có transaction/khoá dòng nên không có gì ngăn race — trường hợp xấu nhất, `User.update` của request A chạy xong, `User.update` của request B ghi đè lên, rồi `customer.update` của A chạy sau — cuối cùng SĐT đăng nhập (`users.phone`) và SĐT hồ sơ (`customers.phone`) là của hai request khác nhau.
- Nhẹ hơn nhưng vẫn xấu: `User.update` thành công (SĐT mới không trùng ai) nhưng `customer.update` sau đó thất bại vì `customers.phone` đã có unique index (đã xác nhận qua `uk_customers_phone` trong `20260815300001-unify-customers-chain-wide.js`) — trả lỗi 409 cho nhân viên, nhưng SĐT đăng nhập của khách đã đổi rồi, không rollback được.

**Mức độ:** Nghiêm trọng — vì đây đúng là kiểu lỗi "ghi nửa chừng" gây sai lệch dữ liệu âm thầm, khó phát hiện, khó sửa tay sau này (không có log rõ ràng nào chỉ ra hai bảng đã lệch nhau).

**Hướng khắc phục:** Bọc toàn bộ thân hàm `updateCustomer` (từ đọc `customer` ban đầu tới `customer.update` cuối) trong một `sequelize.transaction()`, giống cấu trúc đã dùng ở `EmployeeService.updateEmployee` (đọc kèm `lock: transaction.LOCK.UPDATE`, rồi mọi update dùng chung transaction, cuối cùng mới `commit()`).

---

### 3.2 [Nên cải thiện] Không có ErrorBoundary ở frontend

**Vị trí:** `frontend/src/App.jsx:7-17` — không có bất kỳ file `ErrorBoundary` nào trong `frontend/src` (đã tìm `componentDidCatch`/`getDerivedStateFromError`, không có kết quả).

**Vấn đề:** React mặc định: nếu một component bất kỳ throw lỗi lúc render (ví dụ `undefined.something` do dữ liệu API trả về thiếu trường, hoặc một props không đúng dạng), toàn bộ cây component unmount — người dùng thấy **trang trắng hoàn toàn**, không có thông báo, không có nút "thử lại" hay "về trang chủ".

**Kịch bản gây lỗi thật:** Nhân viên đang thao tác ở trang Báo cáo hoặc trang Kho hàng, backend trả về một response thiếu field do một bug nhỏ không lường trước (rất dễ xảy ra khi hệ thống đang trong giai đoạn "multi-tenancy migration" như `CLAUDE.md` mô tả — schema đang đổi dần) → cả ứng dụng trắng trang, nhân viên phải F5 lại từ đầu, mất context (giỏ hàng phụ kiện đang thêm, form đang điền...).

**Mức độ:** Nên cải thiện — không gây sai lệch dữ liệu, nhưng gây gián đoạn thao tác thật ngoài quán, đặc biệt khó chịu nếu xảy ra giữa lúc đang tính tiền khách.

**Hướng khắc phục:** Thêm một `ErrorBoundary` bọc `<AppRoutes />` (hoặc bọc từng layout chính), hiển thị màn hình lỗi thân thiện + nút tải lại, thay vì để React unmount toàn bộ cây.

---

### 3.3 [Nên cải thiện] `errorHandler` không phân biệt lỗi dự kiến/không dự kiến

**Vị trí:** `backend/src/middleware/errorHandler.js:1-13`

```js
const statusCode = err.statusCode || err.status || 500;
const message = err.message || 'Lỗi máy chủ nội bộ.';
res.status(statusCode).json({ success: false, data: null, message: message, errors: err.errors || null });
```

**Vấn đề:** Với lỗi "dự kiến" (service tự throw `new Error(...)` kèm `statusCode`), cách làm này đúng và nhất quán — đây là điểm mạnh, xem mục 4. Nhưng với lỗi **không dự kiến** (ví dụ lỗi Sequelize khi mất kết nối DB, `TypeError` do bug, lỗi driver MySQL...), `err.message` gốc — vốn không phải viết ra để người dùng cuối đọc — được trả thẳng trong response JSON. Không có phân nhánh theo `process.env.NODE_ENV`, không có thông điệp chung "Đã có lỗi xảy ra, vui lòng thử lại" cho trường hợp 500 ngoài dự kiến.

**Kịch bản gây lỗi thật:** MySQL tạm thời quá tải hoặc rớt kết nối giữa lúc xử lý request (pool cạn — xem mục 3.5) → lỗi driver (dạng `SequelizeConnectionError`/`ETIMEDOUT`...) lộ thẳng ra frontend, hiển thị như một thông báo nghiệp vụ bình thường dù bản chất là lỗi hạ tầng, gây khó hiểu cho nhân viên ("app báo lỗi gì đó tôi không hiểu") và khó phân loại khi debug sau này vì log server và message trả về không được tách biệt theo loại lỗi.

**Mức độ:** Nên cải thiện — không gây mất dữ liệu, nhưng ảnh hưởng chất lượng thông báo lỗi và có thể lộ chi tiết nội bộ (tên bảng/cột, driver) không cần thiết ra client.

**Hướng khắc phục:** Trong `errorHandler`, nếu `!err.statusCode` (tức lỗi không được service chủ động throw có kiểm soát) thì trả message chung cố định, chỉ log chi tiết ở server; giữ nguyên hành vi hiện tại cho lỗi có `statusCode` tường minh.

---

### 3.4 [Nên cải thiện] Không có handler cho route không tồn tại

**Vị trí:** `backend/src/server.js:25-46` — các route được đăng ký từ dòng 27–43, rồi tới thẳng `app.use(errorHandler)` ở dòng 46. Không có `app.use((req, res) => ...)` catch-all ở giữa.

**Vấn đề:** `CLAUDE.md` ghi rõ quy ước API: mọi response phải theo envelope `{ success, data, message, errors }`. Nhưng gọi một path không khớp route nào (gõ nhầm URL, frontend gọi sai endpoint do lỗi deploy lệch phiên bản...) sẽ rơi vào handler 404 mặc định của Express — trả về HTML (`Cannot GET /...`), không phải JSON.

**Kịch bản gây lỗi thật:** Frontend và backend deploy lệch nhau tạm thời (ví dụ frontend đã gọi endpoint mới nhưng backend chưa kịp deploy) → thay vì `apiClient` nhận được JSON lỗi 404 tử tế để hiển thị, nó nhận HTML, `res.data.success` là `undefined`, mọi logic hiển thị lỗi dựa trên `res.data.message` sẽ không hoạt động như mong đợi.

**Mức độ:** Nên cải thiện — ít khi xảy ra khi hệ thống ổn định, nhưng đúng lúc deploy/rollback (thời điểm dễ có lệch phiên bản nhất) lại là lúc dễ gặp nhất.

**Hướng khắc phục:** Thêm 1 middleware catch-all ngay trước `errorHandler`: trả JSON 404 theo đúng envelope chuẩn.

---

### 3.5 [Nên cải thiện] Không cấu hình connection pool cho Sequelize

**Vị trí:** `backend/src/config/config.js` — cả 3 khối `development`/`test`/`production` đều không có key `pool`.

**Vấn đề:** Sequelize mặc định `pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }` khi không cấu hình. Với một hệ thống đa chi nhánh, nhiều nhân viên thao tác song song (mở sân, thêm phụ kiện, thanh toán, xem báo cáo) trên cùng một backend instance, 5 kết nối đồng thời tới MySQL có thể là quá ít.

**Kịch bản gây lỗi thật:** Giờ cao điểm (buổi tối cuối tuần), nhiều chi nhánh cùng lúc có nhân viên bấm "Thanh toán"/"Mở sân"/mở trang báo cáo — mỗi request giữ 1 connection trong suốt transaction. Nếu hơn 5 request cần DB cùng lúc, các request sau phải xếp hàng chờ tới 30 giây (`acquire timeout` mặc định) rồi mới báo lỗi timeout, thay vì được backend từ chối nhanh hoặc xử lý mượt. Đây là kiểu lỗi chỉ xuất hiện khi tải thật tăng lên — không thấy khi dev/test đơn lẻ.

**Mức độ:** Nên cải thiện — hiện tại (giai đoạn demo/ít tải) không phải vấn đề, nhưng là điểm nghẽn dễ đoán trước khi tăng tải thật.

**Hướng khắc phục:** Thêm `pool: { max, min, acquire, idle }` tường minh cho `production` (và có thể `development`), giá trị `max` nên tính theo số kết nối MySQL cho phép và số instance backend chạy song song.

---

### 3.6 [Nên cải thiện] `cancelBooking`/`confirmBooking` không khoá dòng khi kiểm tra trạng thái

**Vị trí:** `backend/src/services/BookingService.js:281-354`

**Vấn đề:** Cả hai hàm đọc `booking` bằng `Booking.findOne(...)` **ngoài** transaction, không `lock`, rồi kiểm tra `booking.status` hợp lệ hay không dựa trên dữ liệu đọc được lúc đó. Transaction chỉ được mở *sau* bước kiểm tra, và lệnh `booking.update({status: ...}, {transaction})` ghi thẳng theo instance đã đọc từ trước — không đọc lại có khoá bên trong transaction để xác nhận trạng thái vẫn còn hợp lệ tại thời điểm ghi.

So sánh: `createBooking`/`updateBooking` (cùng file, dòng 124 & 195) làm đúng — mở transaction `SERIALIZABLE` trước, đọc lại `Court`/`Booking` có `lock: transaction.LOCK.UPDATE` bên trong, rồi mới kiểm tra và ghi.

**Kịch bản gây lỗi thật:** Nhân viên bấm "Xác nhận" một booking đang chờ đúng lúc khách gọi điện huỷ và nhân viên khác (hoặc chính khách qua app) bấm "Huỷ" gần như cùng lúc. Cả hai request đều đọc thấy `status: 'pending'` (thoả điều kiện của cả hai hàm), cả hai đều mở transaction riêng và `update` thẳng — không ai bị chặn bởi ai. Kết quả cuối phụ thuộc thứ tự commit ngẫu nhiên: có thể booking đã bị huỷ nhưng vẫn bị xác nhận lại (nếu confirm commit sau), tạo booking "đang hoạt động" cho một lịch mà khách đã báo huỷ.

**Mức độ:** Nên cải thiện — thiệt hại giới hạn ở nhầm lẫn trạng thái booking (không mất tiền trực tiếp như checkout), nhưng gây rắc rối vận hành (sân bị coi là đã đặt trong khi khách nghĩ đã huỷ).

**Hướng khắc phục:** Áp dụng đúng khuôn mẫu đã có trong `createBooking`/`updateBooking`: đọc lại `booking` **bên trong** transaction với `lock: transaction.LOCK.UPDATE`, rồi mới kiểm tra `status` hợp lệ ngay trước khi `update`.

---

### 3.7 [Nên cải thiện] Transaction `SERIALIZABLE` không có retry khi deadlock

**Vị trí:** `backend/src/services/BookingService.js:124` (`createBooking`) và `:195` (`updateBooking`) — `sequelize.transaction({ isolationLevel: 'SERIALIZABLE' })`. Đã tìm trong toàn bộ `backend/src` (`Deadlock`, `ER_LOCK_DEADLOCK`, `retry`) — không có cơ chế retry nào.

**Vấn đề:** Mức cô lập `SERIALIZABLE` là lựa chọn đúng đắn để tránh double-booking (đây là điểm mạnh, không phải lỗi) — nhưng nó cũng là mức dễ gây "deadlock"/"lock wait timeout" nhất trong MySQL khi có nhiều transaction cùng chạm vào các dòng/khoảng dữ liệu chồng lấn. Khi MySQL phát hiện deadlock, nó chủ động huỷ một trong hai transaction bằng lỗi `ER_LOCK_DEADLOCK` — hiện tại lỗi này sẽ rơi thẳng vào `catch` chung, rollback, rồi trả lỗi 500 cho người dùng.

**Kịch bản gây lỗi thật:** Hai nhân viên ở hai chi nhánh khác nhau (hoặc cùng chi nhánh) đặt lịch cho hai sân khác nhau gần như cùng lúc — với `SERIALIZABLE`, MySQL có thể khoá rộng hơn cần thiết và gây deadlock dù hai booking không thật sự xung đột nhau. Người dùng thấy lỗi 500 khó hiểu ("Internal Server Error") dù chỉ cần bấm lại là thành công — trải nghiệm giống "hệ thống bị lỗi" trong khi thực chất là tranh chấp khoá tạm thời, bình thường ở tải cao.

**Mức độ:** Nên cải thiện — không sai dữ liệu (transaction bị huỷ sạch), nhưng ảnh hưởng trải nghiệm và có thể bị hiểu nhầm là bug nghiêm trọng khi tải tăng.

**Hướng khắc phục:** Thêm một lớp retry mỏng quanh 2 hàm này (thử lại 1–2 lần khi bắt được lỗi mã `ER_LOCK_DEADLOCK`/`SequelizeDatabaseError` tương ứng), hoặc chí ít trả về thông báo "Vui lòng thử lại" thay vì lỗi 500 chung chung khi phát hiện đúng loại lỗi này.

---

### 3.8 [Nên cải thiện] `apiClient` không dùng chung 1 refresh-token request, và mất đồng bộ state khi refresh thất bại

**Vị trí:** `frontend/src/services/apiClient.js:29-59`

**Vấn đề:**
- Cờ `originalRequest._retry` (dòng 34) ngăn đúng 1 request retry vô hạn nếu bản thân request retry cũng bị 401 — đây là điểm tốt, không có nguy cơ vòng lặp vô hạn.
- Nhưng **không có promise refresh dùng chung**: nếu 5 request cùng 401 gần như đồng thời (ví dụ khi mở một trang gọi nhiều API song song ngay sau khi access token hết hạn), cả 5 request đều tự gọi `axios.post('/auth/refresh-token')` độc lập — gây 5 lần gọi refresh dư thừa thay vì 1 lần.
- Khi refresh thất bại (dòng 51-55), token bị xoá khỏi `localStorage` nhưng **không có gì báo cho `AuthContext` biết** (`setUser(null)` không được gọi) — state `user` trong React vẫn coi là "đã đăng nhập" cho tới khi người dùng điều hướng trang hoặc F5.

**Kịch bản gây lỗi thật:** Nhân viên để tab mở qua đêm, sáng hôm sau access token hết hạn, họ bấm vài thao tác liền — mỗi thao tác tự kích hoạt refresh riêng (tăng tải backend không cần thiết), và nếu refresh token cũng đã hết hạn, giao diện vẫn hiển thị như đang đăng nhập (sidebar, tên user...) trong khi mọi API đều âm thầm 401 — nhân viên không hiểu vì sao "bấm gì cũng không được" cho tới khi thử F5.

**Mức độ:** Nên cải thiện — không gây sai dữ liệu, nhưng gây trải nghiệm khó hiểu và tải dư thừa không cần thiết lên endpoint refresh-token.

**Hướng khắc phục:** Dùng một biến module-level giữ promise refresh đang chạy, mọi request 401 đến trong lúc đó `await` chung promise đó thay vì tự gọi lại. Khi refresh thất bại, gọi thêm một callback (ví dụ qua sự kiện hoặc import trực tiếp) để `AuthContext` cập nhật `setUser(null)` ngay, đồng thời điều hướng về trang đăng nhập.

---

### 3.9 [Ghi chú] Xuất báo cáo dựng toàn bộ dữ liệu trong bộ nhớ, không giới hạn khoảng ngày

**Vị trí:** `backend/src/services/ReportService.js:129-148` (`getSessionDetails`, mặc định `limit = 5000`, `from`/`to` là optional) và `backend/src/utils/reportExporter.js` (`buildExcel`/`buildPdf` gom toàn bộ buffer trong RAM trước khi trả về, không stream).

**Vấn đề:** Không có gì bắt buộc nhân viên phải chọn khoảng ngày khi xuất báo cáo — gọi API xuất Excel/PDF không kèm `from`/`to` sẽ kéo tối đa 5000 phiên chơi kèm đầy đủ quan hệ (`court`, `customer`, `invoice`, `payment`, `sessionExtras`...) vào bộ nhớ, dựng cả file Excel/PDF hoàn chỉnh trong RAM rồi mới gửi response.

**Kịch bản gây lỗi thật:** Sau nhiều tháng vận hành, một chi nhánh tích luỹ hàng chục nghìn phiên chơi — nhân viên bấm "Xuất báo cáo" không chọn ngày (thói quen tự nhiên: "xuất hết cho tôi xem") → request tải nhiều dữ liệu, dựng file lớn trong RAM cùng lúc với các request khác đang chạy → tăng nguy cơ hết bộ nhớ (đặc biệt nếu chạy trong container Docker giới hạn RAM thấp) hoặc request treo lâu.

**Mức độ:** Ghi chú — hiện tại (dữ liệu còn ít) không phải vấn đề thật, nhưng đáng note để theo dõi khi dữ liệu tích luỹ lớn dần theo thời gian.

**Hướng khắc phục (không gấp):** Bắt buộc chọn khoảng ngày khi xuất báo cáo, hoặc thêm giới hạn cứng hợp lý hơn cùng cảnh báo khi vượt ngưỡng; về lâu dài có thể cân nhắc stream file thay vì buffer toàn bộ.

---

### 3.10 [Ghi chú] Chưa có index gộp cho truy vấn dashboard trên bảng `payments`

**Vị trí:** `backend/src/services/ReportService.js:16-63` (`getDashboardSummary`) lọc `Payment` theo `{ branchId, status: 'paid', paidAt: {...} }` mỗi lần mở trang tổng quan. Cột `branch_id` trên `payments` chỉ có index đơn (tự động sinh ra từ khoá ngoại, thêm ở `backend/src/migrations/20260805000001-m1-organizations-branches.js:160-198`) — không có index gộp `(branch_id, status, paid_at)`.

**Vấn đề:** Với dữ liệu ít, MySQL vẫn chạy nhanh dù chỉ có index đơn cột `branch_id`. Nhưng đây là endpoint được gọi thường xuyên nhất (mỗi lần bất kỳ ai mở trang tổng quan) và không giới hạn theo thời gian bằng index — MySQL phải quét toàn bộ payment của chi nhánh đó rồi lọc `status`/`paid_at` bằng tay.

**Kịch bản gây lỗi thật:** Sau 1-2 năm vận hành, một chi nhánh đông khách tích luỹ hàng trăm nghìn payment — mỗi lần mở dashboard, quét toàn bộ lịch sử payment của chi nhánh (dù chỉ cần đúng hôm nay) sẽ ngày càng chậm, ảnh hưởng tới trải nghiệm mở app hàng ngày của nhân viên.

**Mức độ:** Ghi chú — chưa phải vấn đề ở quy mô hiện tại, nhưng là kiểu "nợ kỹ thuật" dễ đoán trước và dễ vá sớm hơn là vá muộn.

**Hướng khắc phục (không gấp):** Thêm migration bổ sung `addIndex('payments', ['branch_id', 'status', 'paid_at'])`.

---

### 3.11 [Ghi chú] Rollback Plan chưa nêu rõ giới hạn của các migration không thể hoàn tác

**Vị trí:** `docs/DeploymentGuide.md:228-231` (mục 9, "Rollback Plan") viết: *"Nếu lỗi liên quan migration DB, cần có sẵn migration 'down' tương ứng để revert schema an toàn."* Trong khi đó, `docs/DeploymentGuide.md:212` (mục 7.2) chỉ nêu tên 3 migration không thể hoàn tác đầy đủ (`20260815300001`, `20260815000002`, `20260815300002`). Rà lại `backend/src/migrations/`, còn ít nhất 2 migration khác cũng cố ý không hoàn tác được nhưng chưa được nhắc tới trong danh sách cảnh báo đó:
- `backend/src/migrations/20260814100005-backfill-guest-to-customer.js:88-92` — `down()` chỉ log cảnh báo, không revert (gộp hồ sơ khách vãng lai, không tách ngược được).
- `backend/src/migrations/20260814110001-scrub-secrets-from-activity-logs.js:52-55` — `down()` không làm gì (xoá secret khỏi log cũ là chủ đích, không thể "thêm lại" secret đã xoá).

**Vấn đề:** Bản thân các migration này được viết rất cẩn thận — mỗi cái đều có comment giải thích rõ vì sao không hoàn tác được và khuyên khôi phục từ backup (đây là điểm tốt, xem mục 4). Vấn đề duy nhất là mục "Rollback Plan" ở cấp tài liệu deploy chưa phản ánh đầy đủ danh sách này, nên người thực hiện rollback theo đúng quy trình §9 (đổi tag Docker image về bản trước) có thể tưởng nhầm là schema luôn revert được nếu chỉ đọc mục 9 mà bỏ qua mục 7.2.

**Mức độ:** Ghi chú — bản chất kỹ thuật đã đúng (comment trong code rất rõ ràng), đây chỉ là khoảng trống liên kết tài liệu.

**Hướng khắc phục (không gấp):** Cập nhật mục 7.2 của `DeploymentGuide.md` để liệt kê đầy đủ mọi migration có `down()` không phục hồi dữ liệu (không chỉ 3 migration của đợt M1-M3), hoặc thêm một dòng ở mục 9 trỏ ngược về mục 7.2.

---

### 3.12 [Ghi chú] Khoảng trống test coverage

**Vị trí:** `backend/tests/` và `frontend/src/utils/roles.test.js`

**Số liệu cụ thể:**
- Backend: 6 file test / 322 dòng — `dateTime.test.js`, `priceCalculator.test.js`, `phone.test.js`, `inventoryService.test.js`, `paymentValidation.test.js`, `courtService.test.js`. Tất cả đều là **unit test thuần logic, không chạm DB thật** (test hàm tính toán, format, validate — không test qua Sequelize/MySQL).
- **Chưa có test nào** cho: `BookingService`, `CustomerService`, `EmployeeService`, `AuthService`, `SupplierService`, `GoodsReceiptService`, `BranchService`, `PaymentService` (phần transaction/checkout thật), và **không có test nào ở tầng controller/route** (không có integration test dùng `supertest` dù package đã có sẵn trong `devDependencies`).
- Frontend: đúng 1 file test (`roles.test.js`) — không có test cho bất kỳ component/page nào.
- CI (`.github/workflows/ci.yml`) chỉ chạy `npm test` (đúng 6 file trên) và `npm run build` cho frontend — không có bước chạy test có DB thật.

**Vấn đề:** Đây không phải một "lỗi" mà là một khoảng trống rủi ro có thật: các luồng quan trọng nhất về tiền bạc và dữ liệu (đặt lịch, thanh toán, tạo/sửa khách hàng, tạo nhân viên) hiện **không có bất kỳ lưới an toàn tự động nào**. Một thay đổi trong tương lai (kể cả sửa nhỏ, refactor) có thể làm hỏng logic transaction/khoá dòng đã review kỹ trong tài liệu này mà CI vẫn xanh, vì CI không hề chạm tới các luồng đó.

**Mức độ:** Ghi chú (không "nghiêm trọng" theo nghĩa đang có lỗi ngay bây giờ) nhưng cần nói thẳng: đây là rủi ro thật cho **tốc độ phát triển an toàn** về sau — càng sửa nhiều mà không có test, xác suất một lần sửa vô tình phá vỡ transaction/khoá dòng đã đúng càng tăng.

**Hướng khắc phục (không gấp, ưu tiên theo giá trị):** Ưu tiên viết integration test (Jest + Supertest + DB test thật, đã có sẵn config `test` trong `config.js`) cho đúng các luồng có transaction phức tạp nhất trước: `PaymentService.checkout`/`processWebhook` (đã có cơ chế idempotency cần test), `BookingService.createBooking` (tránh double-booking), `InventoryService.postMovement`.

---

### 3.13 [Ghi chú] Không có structured logging / error tracking / APM

**Vị trí:** `backend/package.json` (không có `winston`, `pino`, `morgan`, `@sentry/node`...); lỗi được log bằng `console.error('[Error Handler]', err)` trong `errorHandler.js:2`, log khác rải rác bằng `console.log`/`console.error` trực tiếp trong service/migration.

**Điểm đã có:** `backend/src/server.js:22-23` có sẵn `GET /health` và `GET /api/v1/health` — đủ để một hệ thống giám sát bên ngoài (uptime checker, load balancer health check) biết server còn sống. Đây là điểm tốt, không phải thiếu sót hoàn toàn.

**Vấn đề còn lại:** Không có log có cấu trúc (JSON logs với level, timestamp, request id...) để dễ tra cứu/lọc khi có sự cố ở production, và không có công cụ theo dõi lỗi tự động (Sentry hoặc tương đương) — nghĩa là nếu có lỗi xảy ra ngoài giờ hành chính, sẽ **không ai biết** trừ khi người dùng chủ động báo, hoặc có người chủ động đọc log server theo cách thủ công. Không có APM/metrics nào để biết endpoint nào đang chậm dần theo thời gian trước khi nó thật sự sập.

**Mức độ:** Ghi chú — chấp nhận được ở quy mô hiện tại (một vài chi nhánh, đội vận hành nhỏ), nhưng là khoảng trống thật nếu mục tiêu là phục vụ traffic production thật với kỳ vọng phát hiện sự cố chủ động thay vì bị động chờ người dùng báo.

**Hướng khắc phục (không gấp):** Tối thiểu nên thêm một dịch vụ error-tracking miễn phí/rẻ (Sentry free tier là lựa chọn phổ biến) để nhận cảnh báo tự động khi lỗi 500 xảy ra ở production, trước khi đầu tư vào logging có cấu trúc đầy đủ.

---

### 3.14 [Ghi chú] Mỗi tài khoản chỉ giữ 1 refresh token

**Vị trí:** `backend/src/services/AuthService.js:60-64` (`login`) và `:137-144` (`logout`) — `refreshToken` được lưu là **một giá trị duy nhất** trên `users.refreshToken`, không phải danh sách các phiên.

**Vấn đề:** Đây là lựa chọn thiết kế hợp lý cho phần lớn trường hợp, nhưng có một hệ quả đáng lưu ý: đăng nhập ở thiết bị/trình duyệt thứ hai sẽ ghi đè `refreshToken`, khiến access token cũ ở thiết bị đầu tiên vẫn dùng được tới khi hết hạn (15 phút) nhưng sau đó **không refresh được nữa** — người dùng ở thiết bị đầu bị đăng xuất "vô cớ" theo góc nhìn của họ.

**Kịch bản gây lỗi thật:** Nhân viên dùng chung 1 tài khoản trên máy tính quầy lễ tân và điện thoại cá nhân để tiện thao tác — đăng nhập trên điện thoại sẽ âm thầm khiến máy tính quầy bị đăng xuất trong vòng tối đa 15 phút sau đó.

**Mức độ:** Ghi chú — hành vi nhất quán, không phải bug, nhưng nên là lựa chọn có chủ đích chứ không phải hệ quả không lường trước; đáng để xác nhận với người vận hành xem có đúng mô hình sử dụng thực tế không (một tài khoản = một thiết bị tại một thời điểm).

**Hướng khắc phục (tuỳ chọn):** Nếu mô hình sử dụng thực tế cần nhiều thiết bị đồng thời cho cùng 1 tài khoản, cân nhắc chuyển sang lưu nhiều refresh token theo phiên (mỗi thiết bị 1 token, có thể thu hồi riêng từng cái).

**Cập nhật 16/08:** phát hiện này đã được xác nhận **bằng test thật** (gọi
trực tiếp API qua curl, không chỉ đọc code) — bao gồm loại trừ khả năng do
nhiều request đồng thời (5 request refresh song song đều thành công), xác
nhận nguyên nhân duy nhất là bị đăng nhập nơi khác ghi đè. Chi tiết đầy đủ
kèm bằng chứng: `docs/05-extra/01-audit/SessionRefreshIssue.md`.

---

### 3.15 [Ghi chú] [Bổ sung 16/08] Bundle frontend chưa tách nhỏ, 1 file JS ~800KB

**Vị trí:** `frontend/` — kết quả `npm run build`:
```
dist/assets/index-DZ-PPLwv.js   800.02 kB │ gzip: 217.43 kB
(!) Some chunks are larger than 500 kB after minification.
```

**Vấn đề:** Toàn bộ SPA (mọi trang quản trị + trang khách hàng công khai)
được gộp vào **đúng 1 file JS**, không có `React.lazy`/`Suspense`/code
splitting theo route (grep `frontend/src` cho `lazy(`/`Suspense`: không có
kết quả nào). Khách vào trang chủ đặt sân công khai (không cần đăng nhập)
vẫn phải tải toàn bộ code của cả khu vực quản trị (Kho, Báo cáo, Nhân
viên...) mà họ không bao giờ dùng tới.

**Khi nào thật sự gây khó chịu:** rõ nhất trên mạng di động chậm hoặc 3G/4G
yếu — đúng đối tượng dùng trang đặt sân công khai trên điện thoại. 800KB
(217KB đã nén gzip) là mức tải ban đầu chậm hơn đáng kể so với nếu tách
riêng "trang công khai" khỏi "khu vực quản trị".

**Mức độ:** Ghi chú — không gây lỗi, chỉ ảnh hưởng tốc độ tải lần đầu, và
mức 800KB chưa phải quá nghiêm trọng, nhưng đáng xử lý trước khi lượng
trang/tính năng tiếp tục tăng.

**Hướng khắc phục:** Tách trang chủ/đăng ký/đặt sân công khai (không cần
đăng nhập) ra 1 chunk riêng bằng `React.lazy` ở tầng route
(`frontend/src/routes/AppRoutes.jsx`), và tách khu vực quản trị (đằng sau
`ProtectedRoute`) ra chunk khác — người dùng công khai không tải code quản
trị, và ngược lại.

---

### 3.16 [Ghi chú] [Bổ sung 16/08] Backend có thể khởi động trước khi MySQL sẵn sàng

**Vị trí:** `docker/docker-compose.yml` — service `backend` chỉ khai báo
`depends_on: [mysql]` dạng thường, không có điều kiện `service_healthy`.

**Vấn đề:** `depends_on` kiểu thường chỉ đảm bảo **thứ tự khởi động
container** (mysql container start trước), không đảm bảo MySQL đã thật sự
sẵn sàng nhận kết nối bên trong. Ở lần `docker compose up` đầu tiên trên
máy mới (MySQL cần thời gian khởi tạo dữ liệu lần đầu lâu hơn bình
thường), backend có thể khởi động và cố kết nối DB trước khi MySQL sẵn
sàng.

**Mức độ:** Ghi chú — `server.js` đã có log lỗi rõ ràng khi kết nối DB thất
bại (không crash im lặng), và Docker/nodemon thường tự restart nên chỉ gây
chậm khởi động lần đầu, không mất dữ liệu hay lỗi âm thầm.

**Hướng khắc phục:** Thêm `healthcheck` cho service `mysql` trong
`docker-compose.yml` (vd `mysqladmin ping`), rồi đổi `depends_on` của
`backend` sang dạng `condition: service_healthy`.

---

### 3.17 [Ghi chú] [Bổ sung 16/08] `Branch.timezone` được lưu nhưng không được dùng ở đâu cả

**Vị trí:** `backend/src/models/Branch.js:15` (cột `timezone`, seed
`'Asia/Ho_Chi_Minh'` cho từng chi nhánh), `backend/src/utils/dateTime.js`
(`startOfLocalDay`/`endOfLocalDay`, dùng cho các mốc "hôm nay" trong báo
cáo/dashboard).

**Vấn đề:** Cột `timezone` tồn tại đúng như định hướng multi-branch (mỗi
chi nhánh có thể ở múi giờ khác nhau), nhưng `dateTime.js` hiện tính "hôm
nay bắt đầu/kết thúc lúc nào" dựa theo **giờ của máy chủ chạy backend**,
không hề đọc `branch.timezone` — cùng 1 kiểu "ghi mà không đọc" như
`loyaltyTier` (`docs/05-extra/01-audit/LoyaltyTier.md`), nhưng khác ở chỗ đây có
nguy cơ trở thành lỗi thật, không chỉ lãng phí.

**Khi nào thật sự gây lỗi:** hiện tại toàn bộ chi nhánh đều ở
`Asia/Ho_Chi_Minh`, trùng với giả định server nên chưa có triệu chứng gì.
Nếu sau này công ty mở chi nhánh ở múi giờ khác (hoặc server được host ở
vùng có múi giờ khác Việt Nam — rất phổ biến khi dùng cloud quốc tế), mốc
"doanh thu hôm nay" trên Dashboard/Báo cáo của chi nhánh đó sẽ lệch âm
thầm mà không có thông báo lỗi nào.

**Mức độ:** Ghi chú — chưa gây lỗi ở cấu hình hiện tại, nhưng là "bom hẹn
giờ" thật sự nếu mở rộng ra ngoài 1 múi giờ.

**Hướng khắc phục:** Sửa `startOfLocalDay`/`endOfLocalDay` (và mọi nơi
khác tính mốc ngày cho báo cáo) nhận thêm tham số `timezone`, lấy từ
`branch.timezone` thay vì mặc định theo giờ server.

## 4. Đã ổn / đã làm đúng

Để tránh cảm giác "cả hệ thống bấp bênh", phần này liệt kê rõ những gì đã được làm đúng và cẩn thận — đây là phần lớn của codebase:

- **`BookingService.createBooking`/`updateBooking`** (`BookingService.js:118-279`): dùng transaction mức cô lập `SERIALIZABLE`, đọc lại `Court`/`Booking` có `lock: transaction.LOCK.UPDATE` bên trong transaction, kiểm tra trùng lịch (`checkAvailability`) cũng chạy trong cùng transaction/khoá — đúng khuôn mẫu chống double-booking.
- **`CourtService`** (toàn bộ file): mọi đường ghi (`createCourt`, `updateCourt`, `deleteCourt`, `openCourt`, `closeCourt`, `transferCourt`, `updateCourtStatus`) đều bọc transaction + khoá dòng liên quan (sân, phiên chơi đang mở, booking). Đặc biệt, việc đổi `courts.status` được gom về **một đường ghi duy nhất** (`updateCourtStatus`) với bảng chuyển đổi trạng thái tường minh (`COURT_STATUS_TRANSITIONS`) — thiết kế tốt giúp không có đường tắt nào bỏ sót kiểm tra nghiệp vụ.
- **`InventoryService.postMovement`** (`InventoryService.js:14-64`): là điểm ghi tồn kho duy nhất được cho phép trong toàn hệ thống (có chú thích rõ ràng), **bắt buộc phải có transaction truyền vào** (throw lỗi ngay nếu thiếu), khoá dòng tồn kho trước khi cộng/trừ, và có xử lý race an toàn khi tạo dòng tồn kho lần đầu (`_getLockedStock`: nếu 2 request cùng tạo dòng tồn kho cho 1 sản phẩm mới cùng lúc, request thua sẽ bắt lỗi và khoá lại dòng vừa được tạo thay vì crash).
- **`PaymentService.checkout`** (`PaymentService.js:9-177`): cơ chế idempotency-key hoạt động đúng — khoá theo `idempotencyKey` trước tiên, nếu đã tồn tại thì trả thẳng kết quả cũ thay vì tạo lại, không hề bị đợt merge gần đây làm hỏng.
- **`PaymentService.processWebhook`** (`PaymentService.js:234-281`): an toàn trước webhook bị gọi lại nhiều lần (điều bình thường với cổng thanh toán thật) — khoá dòng `payment`, kiểm tra `payment.status === 'paid'` để trả về ngay nếu đã xử lý rồi, không cộng dồn `totalSpent` hay tạo bản ghi trùng khi webhook được gửi lại.
- **`AccessoryService`** (thêm/trả phụ kiện vào phiên chơi): mọi thay đổi kho đều đi qua `InventoryService.postMovement` trong cùng transaction với việc tạo/xoá `SessionExtra` — không có đường tắt trực tiếp sửa tồn kho.
- **`EmployeeService`, `SupplierService`, `GoodsReceiptService`, `AccessoryService`**: rà toàn bộ các luồng ghi nhiều bước — ngoại trừ `CustomerService.updateCustomer` (mục 3.1), tất cả đều đúng khuôn mẫu transaction + khoá dòng khi cần.
- **Controller layer**: rà toàn bộ 14 file trong `backend/src/controllers/` — 100% handler async đều có `try/catch` gọi `next(err)`, không tìm thấy catch block rỗng hay catch chỉ `console.log` mà không phản hồi/re-throw ở bất kỳ đâu trong `backend/src`. Vì Express 4.19.2 không tự bắt lỗi async như Express 5, đây là điều bắt buộc phải làm đúng thủ công — và đã được làm đúng nhất quán.
- **Phân trang** (`backend/src/utils/pagination.js`): giới hạn cứng `limit` tối đa 100 bất kể client truyền gì — chặn được kiểu lỗi "client xin limit=999999 làm sập query".
- **Báo cáo (`ReportService.js`)**: không có mẫu hình N+1 (vòng lặp gọi query bên trong) — mọi danh sách đều dùng `include` để JOIN một lần, kể cả các báo cáo tổng hợp (`getTopCourts`, `getTopAccessories`) dùng `GROUP BY`/aggregate ở tầng DB thay vì tính tay ở tầng ứng dụng.
- **Migration**: mọi migration đều có `down()`; với các migration mà `down()` không thể thực sự khôi phục dữ liệu (gộp khách hàng, xoá secret khỏi log cũ, backfill khách vãng lai), migration **chủ động ghi rõ trong comment vì sao không hoàn tác được** và khuyên khôi phục từ backup, thay vì âm thầm không làm gì mà không giải thích — đây là thực hành tốt hiếm gặp.
- **Index cho các truy vấn nóng nhất**: các bảng bị lọc theo `branch_id` kết hợp cột khác thường xuyên nhất (`courts`, `bookings`, `court_sessions`, `extra_stocks`, `stock_movements`, `goods_receipts`) đều có index gộp phù hợp, không phải chỉ index đơn cột.
- **`branchContextMiddleware`/`authMiddleware`/`requestContextMiddleware`**: đều bọc `try/catch` chuyển lỗi cho `next(error)` đúng cách, không có đường nào có thể làm crash tiến trình Node.
