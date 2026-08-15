# Đồng bộ realtime giữa nhiều thiết bị khi mở/đóng sân

**Câu hỏi gốc:** mở sân 1 ở thiết bị A, thiết bị B đang mở trang Sân có tự
cập nhật thành "đang mở" không, mà không cần F5 hay chuyển tab?

**Trả lời: Có bị.** Hệ thống hiện tại **không** cập nhật tự động. Tài liệu
này xác nhận bằng chứng cụ thể trong code, rồi đưa ra 3 phương án khắc phục
kèm đề xuất.

---

## 1. Bằng chứng — vì sao thiết bị B không tự cập nhật

`frontend/src/pages/Courts/CourtsPage.jsx`:

- Dòng 115-118: `fetchCourts()` chỉ được gọi **1 lần khi component mount**
  (`useEffect(() => { ...; await Promise.all([fetchCourts(), fetchExtras()]); }, [])`).
- Dòng 165-299: mọi hành động khác (sửa/xoá sân, mở sân, đóng sân, gọi thêm
  phụ kiện, chuyển sân, đổi trạng thái) đều gọi lại `fetchCourts()` — nhưng
  **chỉ trên chính thiết bị vừa thao tác**, không có cơ chế nào báo cho
  thiết bị khác biết để tự fetch lại.
- Dòng 125: có 1 `setInterval` — nhưng chỉ để tăng biến `now` mỗi giây, phục
  vụ hiển thị đồng hồ đếm giờ chơi trên UI, **không** gọi lại API.
- Grep toàn repo (`socket.io`, `WebSocket`, `EventSource`) chỉ có kết quả
  trong 3 file tài liệu kế hoạch (`docs/05-extra/ProjectGapsAndDirection.md`,
  `docs/BadmintonDigital_Realtime_Audit_Implementation_Plan.md`,
  `docs/BadmintonDigital_Audit_Report.md`) — **không có trong code thật**,
  cả backend lẫn frontend đều không cài `socket.io`/`ws`.

**Vì sao F5 hoặc chuyển tab lại thấy cập nhật:** rời khỏi trang Sân rồi quay
lại làm React unmount rồi mount lại `CourtsPage`, kích hoạt lại `useEffect`
ở dòng 115 → gọi `fetchCourts()` lại → lấy dữ liệu mới nhất từ server. Đây
là lý do bạn thấy "chuyển tab thì cập nhật" — không phải hệ thống tự đẩy dữ
liệu, mà là bạn vô tình kích hoạt lại lệnh gọi API bằng cách rời/vào lại
trang.

**Phạm vi ảnh hưởng:** không chỉ mở/đóng sân — mọi thay đổi trạng thái sân
từ thiết bị khác (mở, đóng, chuyển sân, bảo trì, gọi thêm phụ kiện vào
phiên đang chơi) đều gặp cùng vấn đề, vì tất cả đều đi qua chung 1 hàm
`fetchCourts()` chỉ chạy khi mount.

---

## 2. Ba phương án khắc phục

### A. Polling (đơn giản nhất, vá nhanh)

Thêm `setInterval` gọi lại `fetchCourts()` mỗi vài giây khi đang ở trang
Sân (ví dụ mỗi 5-10 giây), tương tự cách `setInterval` ở dòng 125 đã có
sẵn, chỉ khác là gọi API thay vì chỉ tăng biến đếm giờ.

- **Ưu điểm:** sửa trong ~10 dòng code, chỉ đụng frontend, không cần đổi
  backend, không thêm thư viện.
- **Nhược điểm:** có độ trễ bằng đúng chu kỳ polling (5-10 giây, không phải
  tức thời); tải server tăng tuyến tính theo số thiết bị đang mở trang —
  nếu 3 chi nhánh × vài nhân viên cùng mở trang Sân, server nhận hàng chục
  request lặp lại mỗi vài giây dù phần lớn thời gian chẳng có gì đổi cả.

### B. Server-Sent Events (SSE) — cân bằng, đề xuất chính

Server giữ 1 kết nối HTTP mở với mỗi client, chỉ đẩy dữ liệu xuống khi thật
sự có gì đổi (không cần client tự hỏi lại theo chu kỳ).

- **Ưu điểm:** gần như tức thời (đẩy ngay khi trạng thái đổi, không đợi chu
  kỳ polling); nhẹ hơn WebSocket vì chỉ cần 1 chiều server → client (đúng
  nhu cầu ở đây — trang Sân chỉ cần *nhận* thông báo, không cần gửi gì qua
  kênh này); dùng ngay hạ tầng Express sẵn có, không cần thư viện ngoài lớn
  như Socket.IO; dễ scope theo chi nhánh (mỗi client subscribe kèm
  `branchId`, server chỉ đẩy sự kiện đúng chi nhánh đó).
- **Nhược điểm:** một số hosting/proxy cần cấu hình timeout dài hơn cho kết
  nối giữ lâu (nếu sau này deploy sau Nginx/Cloudflare cần kiểm tra); nếu
  rất nhiều thiết bị cùng mở trang, server vẫn phải giữ từng đó kết nối mở
  cùng lúc (cần theo dõi, nhưng quy mô hệ thống này — vài chi nhánh, vài
  chục nhân viên — chưa phải vấn đề).

### C. WebSocket / Socket.IO đầy đủ (2 chiều, đầu tư dài hạn)

Đây chính là hướng đã được lên kế hoạch từ trước trong
`docs/BadmintonDigital_Realtime_Audit_Implementation_Plan.md` (đã xác nhận
ở `docs/05-extra/ProjectGapsAndDirection.md` là kế hoạch này **đang bị gác lại**,
chưa triển khai).

- **Ưu điểm:** 2 chiều thật sự, mở rộng được cho các tính năng realtime
  khác sau này (đặt sân, tồn kho, thông báo...), đúng hướng đã vạch sẵn.
- **Nhược điểm:** effort lớn nhất — cần thêm `socket.io` server, xử lý xác
  thực token qua kết nối socket, tạo "room" theo chi nhánh, xử lý
  reconnect/resync khi mất mạng, và nếu sau này chạy nhiều instance backend
  (scale ngang) cần thêm Redis adapter để các instance đồng bộ sự kiện với
  nhau — phức tạp hơn hẳn 2 phương án trên.

---

## 3. Đề xuất

Với quy mô hiện tại (hệ thống quản lý sân nội bộ vài chi nhánh, không phải
app hàng triệu người dùng), **phương án B (SSE)** là điểm cân bằng hợp lý
nhất cho đúng case bạn hỏi: tức thời, effort vừa phải, không kéo theo hạ
tầng phức tạp. Polling (A) chỉ nên chọn nếu cần vá ngay trong ngày và chấp
nhận độ trễ vài giây. Socket.IO (C) nên để dành cho giai đoạn có kế hoạch
mở rộng realtime sang nhiều tính năng khác cùng lúc — làm SSE riêng lẻ cho
từng trang sẽ thành phí công nếu 3 tháng nữa lại cần realtime cho trang Đặt
sân, trang Kho, v.v.

## 4. Kế hoạch triển khai (phương án B — SSE)

**Backend:**
1. Thêm 1 event emitter dùng chung (Node `EventEmitter`, không cần thư viện
   ngoài) — ví dụ `backend/src/utils/realtimeBus.js`.
2. Gắn `emit('court:updated', { branchId, courtId })` vào ngay sau khi
   transaction commit thành công tại các điểm đổi trạng thái sân trong
   `backend/src/services/CourtService.js`:
   - `openCourt` (dòng 198)
   - `closeCourt` (dòng 281)
   - `transferCourt` (dòng 333)
   - nhánh cập nhật trạng thái dùng `resolveStatusTransition` (dòng 420)
   - cân nhắc thêm cả `AccessoryService.addSessionExtra`/
     `returnSessionExtra` nếu muốn trang Sân cập nhật luôn phần phụ kiện
     đang gọi trong phiên chơi.
3. Thêm route mới, ví dụ `GET /api/v1/courts/stream` (đặt trong
   `courtRoutes.js`, qua `authMiddleware` + `branchContextMiddleware` như
   các route khác) — giữ kết nối SSE (`Content-Type: text/event-stream`),
   lắng nghe event emitter, chỉ đẩy xuống client sự kiện đúng `branchId`
   của họ.
   - Lưu ý: `EventSource` ở trình duyệt không set được custom header, nên
     access token cần truyền qua query string (`?token=...`) thay vì
     header `Authorization` như các API khác — cần middleware xác thực
     riêng cho route này.

**Frontend:**
4. Trong `CourtsPage.jsx`, thêm 1 `useEffect` mở
   `new EventSource('/api/v1/courts/stream?token=...')` khi mount, đóng
   (`.close()`) khi unmount.
5. Khi nhận sự kiện `court:updated`, gọi lại `fetchCourts()` (tái dùng
   ngay hàm đang có, đơn giản và an toàn nhất) — có thể tối ưu sau bằng
   cách chỉ cập nhật đúng 1 sân thay vì fetch lại toàn bộ danh sách, nhưng
   không bắt buộc phải làm ngay từ đầu.
6. Xử lý khi mất kết nối: `EventSource` tự động reconnect, nhưng cần xử lý
   riêng trường hợp access token hết hạn giữa chừng (15 phút/lần theo cấu
   hình JWT hiện tại) — khi đó cần dùng token mới đã refresh để mở lại kết
   nối SSE.

## 5. Nếu triển khai thật thì có dễ sinh lỗi mới không?

Trả lời thẳng: **Bản thân việc thêm realtime không tự động sinh lỗi**,
nhưng đây là loại tính năng có sẵn 1 nhóm lỗi kinh điển đặc thù (khác hẳn
lỗi CRUD thông thường) — nếu làm ẩu thì rất dễ dính, còn nếu theo đúng vài
nguyên tắc dưới đây thì rủi ro giảm xuống mức thấp và kiểm soát được. Đây
là các lỗi cần biết TRƯỚC khi code, không phải lỗi đã xảy ra hôm nay —
danh sách này áp dụng chung cho SSE lẫn WebSocket, không riêng gì trang
Sân, nên vẫn hữu ích kể cả khi bạn tự xử lý phần Sân theo cách khác.

**a) Sự kiện đến sai thứ tự → giao diện hiển thị sai trạng thái cuối.**
Mạng không đảm bảo thứ tự tuyệt đối — nếu client tự "ráp" từng sự kiện vào
state cục bộ (ví dụ: nhận `court.opened` thì tự set `status = 'playing'`,
nhận `court.closed` thì tự set lại `'available'`), 2 sự kiện đến gần nhau
có thể bị đảo thứ tự, khiến UI dừng sai ở trạng thái cũ.
→ **Cách tránh an toàn nhất:** đừng tự ráp state từ nội dung sự kiện. Sự
kiện chỉ nên đóng vai trò "có gì đó vừa đổi, gọi lại `fetchCourts()` đi" —
mỗi lần nhận sự kiện là lấy lại **toàn bộ snapshot mới nhất** từ server,
không tự suy luận. Tốn thêm 1 lần gọi API mỗi sự kiện, nhưng loại bỏ hoàn
toàn nhóm lỗi thứ tự sai — với quy mô vài sân/vài chi nhánh, chi phí này
không đáng kể.

**b) Mất kết nối tạm thời mà không đồng bộ lại → tệ hơn cả hiện tại.**
Nếu kết nối SSE/WebSocket rớt vài giây (mất mạng, chuyển mạng, tab bị hệ
điều hành tạm dừng trên điện thoại) và có sự kiện xảy ra đúng lúc đó, client
sẽ bỏ lỡ vĩnh viễn — và vì giao diện "trông có vẻ realtime", người dùng sẽ
tin tưởng nó hơn cả bản không-realtime hiện tại, dẫn tới sai sót đáng tin
cậy hơn là sai sót rõ ràng (hiện tại ít nhất người dùng biết cần F5).
→ **Bắt buộc phải fetch lại toàn bộ danh sách sân** ở 2 thời điểm: (1) mỗi
khi kết nối SSE/WebSocket mở lại sau khi rớt, (2) mỗi khi tab quay lại
foreground trên điện thoại (sự kiện `visibilitychange` — trình duyệt di
động thường tạm ngưng kết nối nền khi chuyển app).

**c) Emit sự kiện trước khi transaction commit xong.** Đây là lỗi kinh điển
nhất của loại tính năng này — cả 2 tài liệu kế hoạch cũ trong repo
(`docs/BadmintonDigital_Realtime_Audit_Implementation_Plan.md`,
`docs/BadmintonDigital_Audit_Report.md`) đều tự cảnh báo riêng về điều này.
Nếu bắn sự kiện ngay khi gọi hàm thay vì sau khi DB đã ghi xong, thiết bị
khác có thể fetch lại đúng lúc transaction chưa commit → thấy dữ liệu cũ →
tưởng là "không có gì đổi" → sự kiện đã dùng hết, không bắn lại nữa → thiết
bị đó kẹt ở dữ liệu cũ dù server đã đổi thật.
→ Chỉ emit **sau khi transaction commit thành công** (đặt logic emit ngay
sau `await transaction.commit()`, hoặc dùng hook `afterCommit` nếu
Sequelize hỗ trợ trong luồng đang dùng).

**d) Token hết hạn giữa chừng kết nối vẫn sống.** Access token hiện hết hạn
sau 15 phút, nhưng 1 kết nối SSE/WebSocket có thể sống lâu hơn thế nhiều
(người dùng mở tab cả buổi). Nếu không có cơ chế nào kiểm tra lại, một tài
khoản bị khoá hoặc đổi quyền giữa chừng vẫn tiếp tục nhận dữ liệu tới khi
tự đóng tab.
→ Giới hạn thời gian sống tối đa của kết nối (đóng chủ động sau ~15-20
phút), buộc client tự mở lại bằng token mới — vừa khớp vòng đời access
token hiện có, vừa không cần thêm cơ chế xác thực riêng phức tạp.

**e) Giới hạn khi mở rộng hạ tầng sau này.** Cách làm đơn giản nhất (dùng 1
`EventEmitter` trong-process ở backend, như đề xuất ở mục 4) chỉ hoạt động
đúng khi có **đúng 1 tiến trình backend** đang chạy — khớp với
`docker-compose` hiện tại (1 container backend). Nếu sau này chạy nhiều
bản sao backend song song để chịu tải cao hơn, thiết bị A thao tác trúng
bản sao 1 nhưng thiết bị B đang giữ kết nối với bản sao 2 sẽ **không nhận
được sự kiện** — lỗi âm thầm, chỉ xảy ra ngẫu nhiên tuỳ bộ cân bằng tải
định tuyến ai vào server nào, rất khó phát hiện khi test thủ công vì
thường chỉ có 1 backend đang chạy lúc dev. Chưa phải vấn đề bây giờ, nhưng
cần nhớ: nếu mở rộng hạ tầng, phải đổi sang cơ chế phát sự kiện dùng chung
giữa các tiến trình (ví dụ Redis pub/sub) chứ không giữ nguyên
`EventEmitter` trong-process.

**f) Chưa có test tự động cho luồng này.** Đây là code hoàn toàn mới, chưa
có hạ tầng test nào cho SSE/WebSocket trong repo — kết hợp với việc độ phủ
test toàn hệ thống vốn đã thấp (đã ghi trong `docs/05-extra/StabilityAudit.md`),
rủi ro là lỗi ở luồng này (đặc biệt 3 lỗi (a)(b)(c) ở trên) sẽ không được
phát hiện tự động trước khi lên production — nên kiểm thử thủ công kỹ
bằng 2 thiết bị/2 tab thật trước khi coi là xong, không chỉ dựa vào "chạy
được lúc dev".

**Tóm lại:** nếu áp dụng đúng (a) và (b) — luôn refetch toàn bộ thay vì tự
ráp state, luôn đồng bộ lại khi mất/mở lại kết nối — thì phần lớn rủi ro
"lỗi mới do làm realtime" đã bị loại bỏ. (c)(d) là kỷ luật lúc code, không
khó nhưng dễ quên nếu không để ý trước. (e) chỉ cần ghi nhớ cho tương lai,
không ảnh hưởng gì ở quy mô hiện tại.

## 6. Việc cần quyết định trước khi làm

- Chỉ áp dụng cho trang Sân trước, hay làm luôn cho các trang khác có cùng
  vấn đề (trang Đặt sân, Lịch sử phiên chơi cũng chỉ fetch khi mount)?
  Quyết định này ảnh hưởng tới việc nên thiết kế event emitter dùng chung
  đa mục đích ngay từ đầu, hay làm riêng lẻ cho từng trang rồi gộp sau.
- Có dự định deploy sau reverse proxy (Nginx, Cloudflare) không? Nếu có,
  cần kiểm tra cấu hình timeout cho kết nối giữ lâu trước khi triển khai
  SSE lên production.
