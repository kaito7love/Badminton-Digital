# Kế hoạch: sửa các thao tác tại quầy làm lệch hoá đơn, kho và bảng sân (nhóm sửa 5/6)

- **Nhánh:** `fix/counter-ops-bugs`, tách từ `main` @ `eeafeda`. Nhánh nhóm 4
  (`fix/docker-deploy-readiness`, commit `1fc2aa1`) chưa merge nên không có ở đây. Commit `932887e`,
  merge vào `main` ngày 25/09/2026 cùng nhóm 4 qua nhánh tích hợp `test/merge-fix-groups-4-5`.
- **Ngày:** 25/09/2026
- **Bối cảnh:** nhóm thứ năm của đợt kiểm tra trước deploy 12/09 — `FE-01`, `FE-02`, `FE-03`,
  `DATA-01`, `RUN-01`. Chủ dự án chốt làm nhóm này trước khi lên bản demo công khai (plan 16, Q3): đây
  là những lỗi người xem demo dễ gặp nhất — bấm hai lần, đổi tab, đăng nhập giữa chừng, để trang Sân mở lâu.

---

## 0. Lỗi (đọc lại code `main` ngày 25/09)

| Mã | Lỗi | Hậu quả | Vị trí |
|---|---|---|---|
| FE-01 | Nút "Thêm món", "Trả đồ", "Mở sân", "Đổi sân" không khoá khi đang gửi; `addSessionExtra` mỗi lần tạo một dòng và trừ kho | Double-click thêm 2 chai nước → tính 4 chai, kho trừ 4; double-click trả 1 chai → trả 2 lần | `pages/Courts/CourtsPage.jsx:228-360` |
| FE-02 | `ensureOrder` không tuần tự: bấm nhanh hai sản phẩm khi chưa có đơn → 2 đơn. Đơn chỉ sống trong state của `PosTab` — đổi sang tab "Kho bán lẻ" là mất (tab bị unmount). Không có route huỷ đơn; "Huỷ giỏ" xoá từng dòng rồi bỏ lại đơn rỗng `open`; không job nào dọn đơn POS bỏ dở | Hàng đã quét vào giỏ biến khỏi tồn kho vĩnh viễn | `pages/Retail/PosTab.jsx:72-115`, `RetailPage.jsx:58`, `routes/salesOrderRoutes.js` |
| FE-03 | Giỏ lưu theo key `cart_guest` / `cart_user_<id>`; đăng nhập đổi key thì nạp giỏ của user (rỗng), không gộp. Thêm nữa, effect ghi localStorage chạy với state cũ đúng lúc đổi key | Khách mới thêm hàng → bấm Đặt hàng → đăng nhập → checkout "Không có sản phẩm nào". Đây là luồng mua chính của khách mới. Đăng ký còn bỏ mất trang đang dở, đẩy sang `/my-bookings` | `contexts/CartContext.jsx:38-51`, `pages/Login/RegisterPage.jsx:34` |
| DATA-01 | `customers.phone` unique tính cả dòng đã xoá mềm, nhưng `findOne` bỏ qua dòng xoá mềm → code tưởng số còn trống rồi `create` đụng index | Admin xoá hồ sơ khách → lần sau người đó ra quầy: mở sân, đặt sân, tạo hồ sơ đều lỗi mãi (sau nhóm 1 là 409 thay vì 500, vẫn không làm tiếp được) | `services/CustomerService.js:111-266`, `AuthService.register` |
| RUN-01 | Server đóng SSE sau 20 phút, access token sống 15 phút. Client mở lại bằng token cũ → 401 → thử lại mỗi 2 giây mãi, không bao giờ refresh token, không fetch lại khi kết nối lại. Server không gửi heartbeat nên proxy cắt kết nối rảnh | Máy quầy để trang Sân mở ~20 phút là màn hình đứng im (sân máy khác mở vẫn hiện trống), mỗi tab bắn ~1.800 request 401/giờ | `controllers/realtimeController.js`, `services/realtimeClient.js` |

---

## 1. Các lựa chọn mặc định (không có câu hỏi chặn — bác nếu không đồng ý)

- **FE-03, khác chi nhánh khi gộp:** giỏ vừa tạo lúc chưa đăng nhập (chính là thứ khách đang mua)
  thắng; giỏ cũ đã lưu của tài khoản ở chi nhánh khác bị thay. Cùng chi nhánh thì cộng dồn.
- **DATA-01:** hồ sơ đã xoá **nhả số điện thoại** (đặt `phone = NULL`, số cũ ghi trong nhật ký) — người
  đó quay lại thì nhận hồ sơ mới; không tự khôi phục hồ sơ admin đã xoá. Hồ sơ đang gắn tài khoản đăng
  nhập thì **không xoá được** (409) — xoá là khách đó mất hồ sơ mà vẫn đăng nhập được. Phía `users`
  (tuyển lại nhân viên cũ cùng email) sau nhóm 1 đã là 409 có thông báo rõ — không làm thêm.
- **FE-02, đơn POS bỏ dở:** tự huỷ + hoàn kho khi quá **6 giờ** không có thao tác (không ai giữ giỏ tại
  quầy lâu vậy); quét cùng nhịp 5 phút với job huỷ đơn online quá hạn.
- **FE-01:** chỉ khoá phía giao diện. Idempotency-Key cho `addSessionExtra` cần thêm cột/bảng (migration)
  mà chỉ chặn được request gửi lại — axios không tự gửi lại, nguyên nhân thật là double-click.

---

## 2. Thiết kế

### 2.1 FE-01 — khoá nút khi đang gửi (`CourtsPage.jsx`)
- Một `useRef` khoá dùng chung (`runOnce`) bọc `confirmOpen`, `confirmAddExtra`, `confirmReturnExtra`,
  `confirmSwitchCourt`: lần bấm thứ hai trong lúc lần đầu chưa xong bị bỏ qua ngay trong cùng tick
  (state `disabled` thôi chưa đủ — hai click liên tiếp có thể chạy trước khi React render lại).
- State `submitting` để disable nút và đổi chữ ("Đang thêm…").
- `confirmReturnExtra` gửi các dòng trả **tuần tự** thay vì `Promise.all` song song — một dòng lỗi thì
  dừng, không để nửa được nửa không mà giao diện báo lỗi chung.

### 2.2 FE-02 — đơn POS không còn mồ côi
- **Backend:**
  - `POST /sales-orders/:id/cancel` (nhân viên, đúng chi nhánh): chỉ đơn `channel='pos'`, `status='open'`
    → hoàn kho mọi dòng + `status='cancelled'` trong một transaction (dùng lại
    `OnlineOrderService._releaseOrder`), nhật ký `sales_order.cancelled`. Đơn đã thanh toán → 400.
  - `SalesOrderService.releaseAbandonedPosOrders(now)`: đơn POS `open` mà cả đơn lẫn dòng cuối cùng đều
    quá 6 giờ không đổi → hoàn kho + huỷ, nhật ký `sales_order.abandoned_released`. Chạy trong
    `setInterval` 5 phút đã có ở `server.js`.
- **Frontend (`PosTab.jsx`):**
  - `ensureOrder` dùng chung một promise đang chạy (`useRef`) — nhiều lần bấm chỉ tạo đúng 1 đơn.
  - Lưu id đơn đang mở vào `sessionStorage` theo chi nhánh; mở lại tab/F5 thì nạp lại đơn nếu còn `open`.
  - "Huỷ giỏ" gọi route huỷ (một request, hoàn kho cả đơn) thay vì xoá từng dòng.
  - `salesOrderService.cancel` trong `apiServices.js`; Postman thêm request → `docs:build` 114 route.

### 2.3 FE-03 — gộp giỏ khách khi đăng nhập / đăng ký
- `cartReducer.mergeGuestCart(userCart, guestCart)` (hàm thuần, có test Vitest): giỏ khách rỗng → giữ
  giỏ user; giỏ user rỗng → lấy giỏ khách; cùng chi nhánh → cộng dồn bằng `addItem` (trần 99); khác chi
  nhánh → giỏ khách (mục 1).
- `CartContext`: state gắn liền với key đang dùng (`{ key, cart }`) — không còn lúc ghi giỏ cũ vào key
  mới. Đổi từ khách sang tài khoản → gộp rồi xoá `cart_guest`. Đổi tài khoản khác hay đăng xuất →
  không gộp (giỏ của người này không sang người kia).
- `RegisterPage`: nhận `from` như `LoginPage` (link "Đăng ký" trên trang đăng nhập chuyển tiếp `from`),
  đăng ký xong quay lại đúng trang đang dở (vd `/checkout`).

### 2.4 DATA-01 — số điện thoại của hồ sơ đã xoá
- `CustomerService.releaseDeletedPhoneHolder(phone, transaction)`: dòng đã xoá mềm còn giữ số → đặt
  `phone = NULL`, nhật ký `customer.phone_released` (lưu số cũ). Gọi trước khi tạo/đổi số ở:
  `resolveWalkIn` (mở sân, đặt sân tại quầy), `createCustomer`, `updateCustomer`, `AuthService.register`
  (khi số chỉ bị hồ sơ đã xoá giữ thì tài khoản mới nhận được số).
- `deleteCustomer`: hồ sơ gắn tài khoản → 409; còn lại nhả số ngay lúc xoá, nhật ký `customer.deleted`
  kèm giá trị cũ. Dữ liệu cũ đang kẹt được xử lý dần ở các chỗ trên — không cần migration.

### 2.5 RUN-01 — bảng sân realtime không ngừng cập nhật
- **Server:** heartbeat `: ping` mỗi 25 giây (proxy/Render không cắt kết nối rảnh); vẫn đóng sau 20 phút
  để client mở lại bằng token mới.
- **Client (`realtimeClient.js`):**
  - trước mỗi lần mở lại: token còn dưới 60 giây (đọc `exp` trong JWT) → refresh bằng đúng hàm refresh
    dùng chung của `apiClient` (export `refreshAccessToken`); refresh hỏng → dừng hẳn (apiClient đã báo
    hết phiên, trang về đăng nhập) thay vì thử lại mãi;
  - backoff 2 → 4 → 8 … tối đa 30 giây, về 2 giây khi mở lại được;
  - `onopen` sau khi mất kết nối → gọi `onReconnect` để trang fetch lại (sự kiện lỡ trong lúc mất kết nối);
  - `onStatusChange('live' | 'reconnecting')` → trang Sân hiện "Mất kết nối realtime — đang kết nối lại…".
- Hàm thuần `tokenExpiresWithin`, `nextBackoffMs` có test Vitest.

---

## 3. File dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `frontend/src/pages/Courts/CourtsPage.jsx` | Khoá nút (2.1); trạng thái realtime (2.5) |
| `frontend/src/pages/Retail/PosTab.jsx` | Đơn tuần tự, nạp lại đơn, huỷ đơn (2.2) |
| `frontend/src/services/apiServices.js` | `salesOrderService.cancel` |
| `backend/src/routes/salesOrderRoutes.js`, `controllers/salesOrderController.js`, `validations/salesOrderValidation.js` | Route huỷ |
| `backend/src/services/SalesOrderService.js` | `cancelOrder`, `releaseAbandonedPosOrders` |
| `backend/src/server.js` | Gọi `releaseAbandonedPosOrders` trong job 5 phút |
| `frontend/src/contexts/cartReducer.js`, `cartReducer.test.js`, `CartContext.jsx` | Gộp giỏ (2.3) |
| `frontend/src/pages/Login/RegisterPage.jsx`, `LoginPage.jsx` | Giữ `from` |
| `backend/src/services/CustomerService.js`, `AuthService.js` | Nhả số của hồ sơ đã xoá; chặn xoá hồ sơ gắn tài khoản (2.4) |
| `backend/src/controllers/realtimeController.js` | Heartbeat |
| `frontend/src/services/realtimeClient.js`, `apiClient.js` (+ test mới) | Refresh, backoff, reconnect (2.5) |
| `backend/tests/` | **Mới:** `posOrderCancel.test.js`, `customerPhoneRelease.test.js`, `realtimeHeartbeat.test.js` |
| `postman/badminton_api_collection.json`, `backend/src/docs/openapi.yaml`, `docs/APIDesign.md` | Route huỷ đơn POS |
| `docs/05-extra/02-remediation/00-tien-do.md` | Thêm mục khi xong |

Không có migration.

---

## 4. Kiểm thử thật

Như nhóm 2–3: server thứ hai trỏ vào **bản sao DB dev** (dump → DB tạm, DROP sau khi xong), Vite + trình
duyệt thật cho phần giao diện; DB dev chỉ dùng cho smoke chỉ đọc cuối cùng.

### 4.1 Tái hiện trên code `main`

| # | Việc | Kỳ vọng trên code cũ |
|---|---|---|
| R1 | Gửi 2 request "thêm 2 chai nước" song song vào cùng phiên (mô phỏng double-click) | 2 dòng, kho trừ 4 |
| R2 | 2 request tạo đơn POS song song; thêm hàng rồi bỏ đơn | 2 đơn `open`; tồn kho không về |
| R3 | Xoá mềm một hồ sơ khách có số → mở sân với số đó; tạo hồ sơ với số đó | 409, không mở được sân |
| R4 | SSE: mở kết nối, theo dõi 60 giây | Không có byte nào sau `:ok` |
| R5 | Trình duyệt: khách chưa đăng nhập thêm 2 món → Đặt hàng → đăng nhập | Checkout "Không có sản phẩm nào" |

### 4.2 Sau khi sửa

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Trình duyệt: double-click "Thêm món" / "Trả đồ" / "Mở sân" | Đúng 1 request mỗi lần bấm; kho trừ/cộng đúng một lần |
| 2 | Trình duyệt POS: bấm nhanh 2 sản phẩm khi chưa có đơn | 1 đơn, 2 dòng |
| 3 | POS: quét hàng → sang tab "Kho bán lẻ" → quay lại; F5 | Giỏ còn nguyên |
| 4 | POS "Huỷ giỏ" | 1 request, đơn `cancelled`, tồn kho về đúng số trước khi quét |
| 5 | API huỷ: đơn đã thanh toán, đơn chi nhánh khác, đơn online, khách gọi | 400 / 404 / 404 / 403 |
| 6 | Job dọn: đơn POS `open` lùi `updated_at` 7 giờ (trên bản sao) → chạy hàm | Huỷ + hoàn kho + nhật ký; đơn mới không bị đụng |
| 7 | Xoá mềm hồ sơ khách (không gắn tài khoản) → mở sân với số đó; tạo hồ sơ; đăng ký bằng số đó | Hồ sơ mới mang số; hồ sơ cũ `phone NULL`; nhật ký có số cũ |
| 8 | Xoá hồ sơ gắn tài khoản | 409, không xoá |
| 9 | SSE 60 giây | Có `: ping` ~25 giây một lần |
| 10 | Trình duyệt: token hết hạn giữa chừng (đặt `JWT_ACCESS_EXPIRES=1m` cho server test), để trang Sân mở >2 phút, máy khác mở sân | Client tự refresh, kết nối lại, trang cập nhật; không có chuỗi 401 lặp mỗi 2 giây |
| 11 | Trình duyệt: khách chưa đăng nhập thêm món → Đặt hàng → đăng nhập; lặp lại với đăng ký tài khoản mới | Checkout có đủ món; đăng ký xong quay về `/checkout` |
| 12 | Hồi quy: mở/đóng/chuyển sân, thanh toán, POS thanh toán, đơn online, voucher | Như cũ |
| 13 | Jest, Vitest, build, `docs:build`; newman trọn bộ trên bản sao | Pass; 114 route |
| 14 | Smoke chỉ đọc trên server dev + DB dev | Không ghi dòng nào |

---

## 5. Ngoài phạm vi
- `PAY-17` (giỏ POS hiện tổng khác số thu; response `addLine` về muộn ghi đè giỏ mới hơn) — đợt luồng tiền 2.
- Idempotency-Key phía server cho thêm/trả phụ kiện — mục 1.
- Khôi phục tài khoản `users` đã xoá mềm (tuyển lại nhân viên cũ) — mục 1.
- Nhóm 6 (backup, log, map lỗi DB sang 4xx) — sau.

---

## 6. Kết quả (25/09/2026)

Chủ dự án chốt phạm vi "nhóm 4 + nhóm 5" (plan 16, Q3) rồi nói hoàn thiện để deploy; các lựa chọn ở mục 1
áp nguyên. Test trên bản sao DB dev `bd_g5_clone` (dump → DB tạm, nạp lại sạch trước newman), server code
nhánh qua `.claude/launch.json` tạm, Vite + trình duyệt thật.

### 6.1 Khác với kế hoạch (đều do test thật phát hiện)

- **Heartbeat là sự kiện `ping` có tên, không phải dòng comment `: ping`, và client có watchdog.** Test tắt
  hẳn backend: proxy (ở đây là proxy dev của Vite) vẫn giữ phía trình duyệt mở, `EventSource` không báo lỗi,
  trang nằm im trên một kết nối câm. `EventSource` nuốt dòng comment nên client không thấy được heartbeat
  kiểu cũ. Giờ client ghi nhận mỗi `ping`; quá 60 giây không nhận được gì thì tự đóng và mở lại
  (`isConnectionSilent`, có test).
- **Server tạm vắng mặt không còn đá người dùng ra trang đăng nhập** (thêm vào phạm vi vì `RUN-01` cần):
  - `refreshAccessToken` chỉ xoá phiên khi server từ chối thật (thiếu refresh token, 400/401/403); lỗi
    mạng/5xx thì để nơi gọi thử lại;
  - `AuthContext` chỉ xoá phiên khi `/auth/me` trả 401/403 — trước đây lỗi gì cũng xoá. Test cũ: tải lại
    trang đúng lúc backend khởi động lại → `/auth/me` 500 → bị đăng xuất. Trên Render (service ngủ dậy)
    hay lúc reset dữ liệu 3h sáng, người xem sẽ gặp đúng lỗi này.
- **`FE-03` chưa kiểm được trên trình duyệt:** bước đăng nhập/đăng ký giữa chừng cần gõ mật khẩu vào form —
  việc mình không làm thay (các nhóm trước cũng nạp phiên qua API). Logic chuyển giỏ tách thành hàm thuần
  `resolveCartSwitch`/`mergeGuestCart` có 7 test Vitest; cần chủ dự án thử tay một lần (mục 6.4).

### 6.2 Tái hiện trên code `main` — 4/4 qua API, R5 xem 6.1

| # | Kết quả trên code cũ |
|---|---|
| R1 | 2 request "thêm 2 món" song song → 2 dòng, kho 149 → 145 |
| R2 | 2 request tạo đơn POS song song → đơn #59, #60; `POST /sales-orders/:id/cancel` → 404 (chưa có) |
| R3 | Xoá hồ sơ khách → mở sân với đúng số đó → 409 "Dữ liệu bị trùng với bản ghi đã có."; tạo lại hồ sơ → 409 |
| R4 | SSE 30 giây: chỉ có `:ok` lúc mở, không byte nào sau đó |

Bản sao còn có **10 đơn POS `open` mồ côi thật** (cũ nhất 16/08) và **4 hồ sơ đã xoá vẫn giữ số điện thoại** —
chính là dấu vết của `FE-02` và `DATA-01` trên dữ liệu dev.

### 6.3 Sau khi sửa

**API (bản sao):**

| # | Kết quả |
|---|---|
| 4 | Đơn 2 dòng (3 cái) → huỷ: kho 7 → 4 → 7, đơn `cancelled`, nhật ký `sales_order.cancelled`; huỷ lần hai → 400 |
| 5 | Đơn đã thanh toán → 400; nhân viên chi nhánh khác → 404; đơn online qua route POS → 404; tài khoản khách → 403 |
| 6 | Job dọn: đơn lùi 7 giờ (theo UTC) → `cancelled`, kho 1 → 3, có phiếu `sale_return` + nhật ký `sales_order.abandoned_released`; đơn vừa tạo không bị đụng. Lần chạy đầu trên bản sao còn dọn luôn 8 đơn mồ côi rỗng có từ trước |
| 7 | Mở sân bằng số của hồ sơ đã xoá (xoá qua API mới, và hồ sơ "xoá kiểu cũ" vẫn giữ số) → 201; hồ sơ cũ nhả số, có nhật ký `customer.phone_released` lưu số cũ; số giờ thuộc hồ sơ mới đang hoạt động, phiên chơi gắn vào hồ sơ mới. Đăng ký bằng số của hồ sơ đã xoá → hồ sơ của tài khoản mang số |
| 8 | Xoá hồ sơ đang gắn tài khoản → 409, không xoá |
| 9 | SSE 30 giây: `:ok` rồi `ping` ở giây 25 |
| 13 | newman trọn bộ (`runWrites` + `runDestructive` + `webhookSecret`, server test đặt tài khoản ngân hàng giả như nhóm 2–3) trên bản sao nạp lại sạch: **120 request, 334 assertion, 0 lỗi**. Lần chạy đầu thiếu cấu hình ngân hàng giả → 6 lỗi ở "Đặt hàng online" (chuyển khoản bị tắt đúng thiết kế), không phải hồi quy |

**Trình duyệt thật (Vite + server code nhánh + bản sao):**

| # | Kết quả |
|---|---|
| 1 | Double-click "Bắt Đầu Tính Giờ" → đúng 1 `POST /courts/1/open`; double-click "Thêm Món" → đúng 1 `POST /sessions/78/extras`; 3 lần click trong CÙNG một tick (trước khi React kịp khoá nút) → vẫn đúng 1 request; double-click "Xác Nhận Trả Đồ" → đúng 1 request trả |
| 2 | POS: bấm 2 sản phẩm trong cùng một tick khi chưa có đơn → 1 `POST /sales-orders` (#72) + 2 dòng |
| 3 | Đổi sang tab "Kho bán lẻ" rồi quay lại, và F5 → giỏ còn nguyên (nạp lại đơn #72) |
| 4 | "Huỷ giỏ" → đúng 1 `POST /sales-orders/72/cancel`; kho 31 → 32 và 53 → 54; đơn `cancelled`; `sessionStorage` sạch |
| 10 | Token sống 1 phút; tắt hẳn backend: giây 70 (≈60 giây im lặng) hiện "Mất kết nối realtime", người dùng vẫn đăng nhập; 4 lần refresh nhận 500, giãn cách dần. Bật lại backend: refresh 200 → SSE mở lại 200 → trang tự tải lại danh sách sân → banner tắt sau 14 giây. Không có chuỗi 401 lặp. "Máy khác" mở Sân số 2 qua API → trang hiện ngay, không F5 |

Lỗi console duy nhất trong đợt test (`useAuth()` null ở `LoginPage`) xuất hiện lúc hot-reload `CartContext`
khi tab đang mở trang đăng nhập; tải sạch `/login` và `/register` ở tab mới: không lỗi nào.

**Tự động và DB dev:** Jest **291/291** (275 + 16: `posOrderCancel`, `customerPhoneRelease`,
`realtimeHeartbeat`); Vitest **61/61** (49 + 12: gộp giỏ, `realtimeClient`); build frontend; `docs:build`
khớp 1-1 **114** route. Smoke trên server dev + DB dev (dưới 5 phút, trước khi job dọn đơn chạy): 5 route
đọc 200, huỷ đơn không tồn tại 404, SSE có `ping`; đếm dòng 6 bảng trước/sau khớp hoàn toàn.

### 6.4 Còn lại / cần biết

- **Thử tay `FE-03` (1 phút):** khách chưa đăng nhập thêm 2 món → Giỏ hàng → Đặt hàng → đăng nhập bằng
  khách demo `0903333333` → trang Đặt hàng phải có đủ 2 món. Lặp lại với "Đăng ký" tài khoản mới → đăng ký
  xong quay về trang Đặt hàng.
- **Khi code này chạy trên DB dev**, job 5 phút sẽ huỷ 8 đơn POS `open` mồ côi (đều rỗng) đang có — đúng ý
  đồ sửa, nhưng là một thay đổi dữ liệu.
- **Phát hiện có sẵn, chưa sửa:** mỗi tài khoản chỉ giữ MỘT refresh token (`users.refresh_token`) — đăng
  nhập ở máy khác là vô hiệu phiên máy trước, người đó bị đăng xuất khi access token hết hạn (≤ 15 phút).
  Với bản demo dùng chung tài khoản, hai người xem cùng dùng "Quản lý Q3" sẽ lần lượt đá nhau ra. Sửa cần
  bảng refresh token riêng (migration) — chờ chủ dự án quyết.

**Dọn dẹp:** DROP `bd_g5_clone` sau khi gộp và test chung; `git checkout` `backend/public/layouts/` sau
newman; `.claude/launch.json` trả về như cũ.
