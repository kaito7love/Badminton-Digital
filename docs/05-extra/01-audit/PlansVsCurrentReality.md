# Case realtime & đối chiếu kế hoạch cũ với code hiện tại

Tài liệu này trả lời 2 câu hỏi bạn đặt ra: (1) việc chưa có realtime có gây
ra rủi ro bảo mật/quá tải giống những gì `SecurityAudit.md`/
`StabilityAudit.md` đã ghi nhận không, và (2) những tài liệu kế hoạch cũ
trong repo hiện khác gì so với code thật — phần nào đã làm, phần nào chưa,
phần nào tài liệu cũ ghi sai so với thực tế.

---

## Phần 1 — Case realtime có gây lỗi bảo mật/ổn định không?

**Trả lời ngắn: bản thân việc CHƯA có realtime như hiện tại KHÔNG gây quá
tải BE/DB.** Vì hiện tại trang Sân chỉ gọi API khi có hành động thật (mở
trang lần đầu, hoặc người dùng bấm nút) — không có vòng lặp nào chạy nền,
nên tải hệ thống hiện đang ở mức thấp nhất có thể. Đây thuần túy là vấn đề
trải nghiệm (dữ liệu không tự cập nhật), không phải vấn đề tải hệ thống.

**Rủi ro chỉ xuất hiện nếu chọn sai cách sửa** — cụ thể là Phương án A
(Polling) trong `docs/05-extra/01-audit/RealtimeCourtSync.md`, và nó liên quan trực tiếp tới
1 phát hiện đã ghi trong `StabilityAudit.md`:

- `backend/src/config/config.js` **không cấu hình `pool`** cho Sequelize
  — nghĩa là đang dùng mặc định (tối đa **5 kết nối đồng thời** tới MySQL
  cho mỗi tiến trình backend đang chạy).
- Nếu chọn Polling: mỗi thiết bị mở trang Sân sẽ tự gọi lại API mỗi vài
  giây, **liên tục suốt thời gian mở trang**. Vài nhân viên ở vài chi
  nhánh cùng mở trang cùng lúc → số truy vấn đồng thời tăng lên, có thể áp
  sát hoặc vượt giới hạn 5 kết nối mặc định đó, đặc biệt vào giờ cao điểm
  khi nhiều thao tác mở/đóng sân khác cũng đang chạy cùng lúc → request bị
  xếp hàng chờ connection, độ trễ tăng, có thể timeout.
- Đây chính là lý do phương án SSE được đề xuất chính trong
  `RealtimeCourtSync.md`: SSE chỉ đẩy dữ liệu khi **thật sự có thay đổi**,
  không tạo query lặp lại theo chu kỳ cố định, nên không cộng dồn tải lên
  connection pool giống polling.
- Về chỉ mục (index): `courts` đã có `(branch_id, status)`,
  `court_sessions` đã có `(branch_id, court_id, status)` — đủ tốt cho
  truy vấn danh sách sân dù chọn polling hay SSE, **không phải điểm nghẽn**
  ở đây.

**Về bảo mật (SecurityAudit.md):** case realtime này không liên quan trực
tiếp tới 3 lỗi nghiêm trọng đã tìm thấy trước đó (JWT secret dự phòng,
webhook thanh toán không xác thực, thiếu rate-limit đăng nhập) — những lỗi
đó nằm ở luồng xác thực/thanh toán, khác với luồng đọc trạng thái sân. Tuy
nhiên nếu triển khai SSE (đã ghi trong kế hoạch), có **1 điểm bảo mật mới
cần cẩn thận**: `EventSource` của trình duyệt không gửi được header
`Authorization`, nên token phải truyền qua query string
(`?token=...`) — nếu làm không cẩn thận, đây có thể vô tình mở thêm 1
đường vòng qua middleware xác thực chuẩn hiện có, hoặc để lộ token trong
access log của server/proxy (query string thường bị ghi vào log). Cần xác
thực đúng cách ở route SSE, không bỏ qua bước này.

**Kết luận:** hiện tại không sao; nếu chọn sửa bằng Polling cần cấu hình
`pool` trước hoặc chấp nhận rủi ro tăng độ trễ; SSE tránh được gần như
hoàn toàn rủi ro tải, nhưng cần xử lý cẩn thận việc xác thực qua query
string.

---

## Phần 2 — Đối chiếu tài liệu kế hoạch cũ với code hiện tại

Repo có vài tài liệu ghi lại **kế hoạch/đánh giá tại một thời điểm trong
quá khứ**, không được cập nhật theo tiến độ thật. Dưới đây đối chiếu 3 tài
liệu liên quan trực tiếp tới case realtime vừa hỏi.

### 2.1 `docs/BadmintonDigital_Realtime_Audit_Implementation_Plan.md`

Tài liệu này tự ghi tiến độ theo 3 giai đoạn ở cuối file (mục 28):

| Giai đoạn | Tài liệu tự ghi | Đối chiếu code thật (kiểm tra lại trong phiên này) | Khớp? |
|---|---|---|---|
| Phase 1 — Chuẩn hoá Court/CourtSession model, derive state qua REST | `[COMPLETED]` | `Court.status` đã đúng là `ENUM('active','maintenance','inactive')` (`Court.js:24`), `CourtService` tính trạng thái động — **khớp**. Nhưng `CourtSession.status` **vẫn chỉ có** `ENUM('playing','closed')` (`CourtSession.js:58`), không có `'completed'`/`'cancelled'` như tài liệu claim đã đổi | ⚠️ Đúng 1 phần — claim "hoàn thành" hơi quá so với thực tế |
| Phase 2 — Setup Socket.IO + phân phòng theo chi nhánh | `[NEXT STEP]` | Chưa cài — `socket.io` không có trong `package.json` cả 2 phía | ✅ Khớp, đúng là chưa làm |
| Phase 3 — Frontend tích hợp realtime, resync khi mất kết nối | `[PENDING]` | Chưa có gì — `CourtsPage.jsx` chỉ fetch khi mount (xem `RealtimeCourtSync.md`) | ✅ Khớp, đúng là chưa làm |

Tài liệu này còn 1 chi tiết đáng chú ý: **event name đã được đặt sẵn**
(`court.session.started`, `court.session.completed`...) và kiến trúc phòng
theo chi nhánh (`socket.join("branch:" + branchId)`) — nếu sau này chọn
làm Phương án C (WebSocket) trong `RealtimeCourtSync.md` thay vì SSE, nên
dùng lại đúng quy ước đặt tên/kiến trúc đã có sẵn trong tài liệu này thay
vì đặt lại từ đầu.

### 2.2 `docs/BadmintonDigital_Audit_Report.md`

Đây là **ảnh chụp tại 1 thời điểm cũ** — nội dung cho thấy nó được viết
**trước khi** Phase 1 ở trên hoàn thành. Ước tính "hệ thống mới đáp ứng
15-20% kế hoạch" trong đó **đã lỗi thời đáng kể**:

| Mục audit report cũ đánh giá | Đánh giá lúc đó | Thực tế bây giờ |
|---|---|---|
| A. Hạ tầng Realtime | 0% | Vẫn đúng — vẫn 0%, chưa đổi |
| B. Court State Model | ~20%, còn ENUM cũ `empty/playing/maintenance` | Đã refactor xong, đúng như Phase 1 claim (xem 2.1) |
| C. CourtSession Lifecycle | ~30%, chưa tách người mở/đóng sân | **Vẫn gần như y nguyên** — `CourtSession.js:32` vẫn 1 field `employeeId` chung, chưa tách `openedBy`/`closedBy`; status vẫn chỉ 2 giá trị như audit cũ mô tả, KHÔNG như Phase-1-"completed" claim ở 2.1 |
| D. Concurrency & Transaction | Dự đoán "<20%, khả năng cao chưa có row lock" (chỉ là suy đoán, chưa kiểm tra) | Đã kiểm tra sâu trong `StabilityAudit.md` phiên này: **thực tế rất tốt** — có `SERIALIZABLE` + `FOR UPDATE` ở các luồng chính (đặt sân, mở/đóng sân, kho, thanh toán). **Dự đoán cũ trong audit report này là sai** — tình hình tốt hơn hẳn so với suy đoán |
| E. Branch Isolation | ~50%, "đã có nền tảng" | Đã hoàn thiện đầy đủ — `branchContextMiddleware` xác nhận đúng trong `SecurityAudit.md` phiên này |

**Kết luận về tài liệu này:** không nên dùng con số 15-20% trong đó để
đánh giá hiện trạng nữa — đã lỗi thời. Mục A (hạ tầng realtime) là phần
duy nhất còn nguyên giá trị, vì đúng là vẫn chưa làm.

### 2.3 `docs/01-plans/ProjectRoadmap.md` (cập nhật lần cuối ghi 23/07/2026)

| Phase | Tài liệu ghi | Thực tế hiện tại |
|---|---|---|
| Phase 5 — Frontend Web Application | `⏳ PLANNED` | Đã xây dựng đầy đủ và đang hoạt động — toàn bộ SPA React (Dashboard, Sân, Đặt sân, Phụ kiện & Kho, Khách hàng, Nhân viên, Lịch sử, Báo cáo, Cài đặt, đăng nhập SĐT/email, light/dark mode...) |
| Phase 6 — Testing, DevOps & Deployment | `⏳ PLANNED` | Đã có 1 phần: CI (`ci.yml` chạy Jest backend + build frontend), Docker compose, `DeploymentGuide.md` đầy đủ — nhưng chưa trọn vẹn đúng tên gọi Phase 6 (CI chưa có lint, chưa có test tích hợp/E2E, `postman/`/`k6/` vẫn rỗng — đã ghi rõ trong `TestPlan.md`) |

Bảng trạng thái này rõ ràng lỗi thời — Phase 5 lẽ ra đã phải là
`✅ COMPLETED` từ lâu, Phase 6 hợp lý hơn nên là `🚧 IN PROGRESS` chứ
không phải `⏳ PLANNED`.

### 2.4 Vì sao không sửa đè trực tiếp lên 3 tài liệu trên

Đây là hồ sơ ghi lại **quyết định/đánh giá tại một thời điểm** (giống nhật
ký) — sửa đè sẽ xoá mất bối cảnh "lúc đó đã nghĩ gì, quyết định gì", vốn có
giá trị tham khảo riêng. Tài liệu đối chiếu này đóng vai trò phần chú
thích cập nhật đi kèm, không thay thế bản gốc — giống cách
`docs/05-extra/01-audit/LoyaltyTier.md`/`docs/05-extra/01-audit/ProjectGapsAndDirection.md` đã làm cho các chủ
đề khác.

---

## Việc cần bạn quyết định

1. Phase 2/3 trong kế hoạch realtime cũ **chính là** Phương án C
   (WebSocket) trong `RealtimeCourtSync.md` — nếu vẫn muốn đi theo hướng đã
   vạch sẵn từ trước thay vì SSE, đây là lúc quyết định có làm tiếp không.
2. `CourtSession` vẫn thiếu phần tách `employeeId` thành người-mở/người-đóng
   theo đúng kế hoạch ban đầu — cần cho nghiệp vụ thực tế (ví dụ để biết ai
   chịu trách nhiệm khi có sai sót lúc đóng sân) hay có thể bỏ qua?
3. `docs/01-plans/ProjectRoadmap.md` nên cập nhật lại bảng trạng thái
   Phase 5/6 cho đúng hiện trạng — đây là loại tài liệu "tiến độ" nhiều chủ
   dự án muốn tự tay cập nhật, nên tôi để bạn quyết định có muốn tôi sửa
   luôn hay không.
