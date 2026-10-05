# Kế hoạch: bước 4(c) — giao diện thi đấu trong app chính (`frontend/src/features/competition/`)

- **Ngày:** 05/10/2026.
- **Trạng thái:** chủ dự án duyệt 05/10/2026 ("theo đề xuất" — cả 7 câu ở mục 4 theo đề xuất) → **đang làm theo slice (mục 7, kết quả ở mục 9).**
- **Nhánh:** `feat/competition-integration` (tiếp tục; (a) = plan 23 và (b) = plan 24 đã xong, đã push). **Chưa merge `main` cho tới khi
  (c) xong và chủ dự án duyệt** — merge một lần cho cả ba phần.
- **Thuộc:** bước 4 của plan 18. Đặc tả màn hình: `services/competition-service/docs/07-giao-dien.md` (đã chốt qua các đợt bấm thử plan 18–21).
- **Phạm vi:** `frontend/` (thư mục tính năng mới + vài dòng ở route, menu, trang Khách hàng), một thay đổi nhỏ ở cổng nối của `backend/`
  (mục 2.1) và tài liệu. **Không** sửa nghiệp vụ của `competition-service`.

## 0. Bối cảnh

Service + cổng nối + hạ tầng đã chạy (plan 23, 24). Người dùng thật chưa dùng được vì app chính chưa có màn hình nào; cái đang bấm thử là
**bàn thử ở scratchpad** (~2 300 dòng JS thuần, không vào repo): giao lưu, giải đấu (đăng ký, bốc thăm, vận hành ngày thi đấu, sơ đồ dạng
hình, chốt giải), bấm điểm trực tiếp, nhập tỉ số, màn hình TV, BXH, hồ sơ, tự chấm trình. Phần (c) chuyển các màn hình đó sang React của app chính
**qua cổng nối**, thêm các màn hình của khách mà bàn thử chưa có, và nối vào menu.

## 1. Hiện trạng đã đọc

- Frontend: React 18 + react-router 6 + Tailwind (`darkMode: 'class'`) + axios + recharts, không TypeScript, không thư viện UI. Route lazy-load; bàn làm việc
  nhân viên dùng `SidebarLayout` (menu theo vai trò, thanh dưới trên điện thoại); khách dùng `CustomerLayout` (hệ Kinetic tối). `UIComponents.jsx` có
  `Modal`, `Badge`, `StatBox`, `Pagination`, `Table`.
- `apiClient.js`: một instance axios, gắn token + `X-Branch-Id` (admin), tự refresh khi 401; `realtimeClient.js` có sẵn các hàm thuần để mở lại SSE
  (`nextBackoffMs`, `tokenExpiresWithin`, `isConnectionSilent`) và EventSource phải truyền token qua `?token=`.
- `roles.js` (một chỗ khai ai vào đâu), `AuthContext`, `BranchContext`, `ThemeContext`.
- Vitest chạy **môi trường node**, chưa có jsdom / Testing Library; test hiện có chỉ cho hàm thuần và client.
- Cổng nối trả 503 `COMPETITION_DISABLED` khi tắt, 503 `COMPETITION_UNAVAILABLE` khi service lỗi; hai SSE `…/tournaments/:id/stream`,
  `…/sessions/:id/stream` nhận `?token=`, nhưng **chưa nhận `branchId` trên query** (EventSource không gửi được header `X-Branch-Id` của admin).
- Bàn thử + module `docs/ui-prototype/bracket-view.js` cho thấy toàn bộ hành vi cần có và các bài học bấm thử (plan 19–21) — là bản mẫu để chuyển, không làm lại từ đầu.

## 2. Thiết kế

### 2.1 Nền (slice c0)

- **Backend (nhỏ, trong cổng nối của plan 23):**
  - `GET /api/v1/competition/status` → `{ enabled, available }` (không cần đăng nhập, không gọi service; `available` theo trạng thái ngắt mạch). Frontend dùng để **ẩn menu khi
    tính năng tắt** ("Service tắt → menu ẩn", 07 đầu trang) mà không phải bắn request lỗi.
  - Cổng nhận `?branchId=` cho đường SSE và đổi sang `X-Branch-Id` (như `/realtime/stream`), để admin đang chọn chi nhánh xem đúng luồng. Có test.
- **`frontend/src/features/competition/`** — toàn bộ tính năng nằm trong thư mục này, **tháo ra được**; app chính chỉ thêm: các `<Route>`, vài mục menu, một nút ở trang Khách hàng.
  ```
  api/            competitionApi.js (axios qua apiClient: Idempotency-Key cho POST/PUT/PATCH, If-Match / ETag, dịch lỗi sang câu tiếng Việt, mã sân → tên sân)
  realtime/       competitionStream.js (SSE + refresh token trước mỗi lần nối, lùi 2→30 s, 60 s im lặng = chết, onReconnect → tải lại, dự phòng poll 10 s)
  context/        CompetitionContext.jsx (status, quyền theo vai trò: ai tạo giải, ai chỉnh điểm…)
  components/     BracketView (đã có bản mẫu), ScoreBoard, TeamNames, StatusBadge, PersonPicker (gõ tìm không dấu), ConfirmDialog, UpdateBanner ("Có cập nhật mới — Tải lại"), PhaseBar…
  pages/          mỗi màn hình một thư mục (khách / nhân viên / TV / bấm điểm)
  lib/            hàm thuần: định dạng, pha của giải ("việc cần làm"), luật tỉ số, hình học sơ đồ — có Vitest
  ```
- **Quy ước chung** (07 mục 3): điện thoại trước; ghi một lần (nút khóa khi đang gửi + `Idempotency-Key`); không tự tải lại khi đang gõ / mở hộp thoại (dải "có cập nhật mới");
  lỗi nói bằng câu dễ hiểu (409 do máy khác vừa đổi → "Trận này vừa được gọi hoặc vừa có kết quả ở máy khác" rồi tải lại); luôn giải thích con số điểm trình.

### 2.2 Các màn hình, chia theo slice (mỗi slice commit riêng, có kiểm thử thật, rồi báo cáo ngắn)

| Slice | Nội dung | Route (đề xuất) |
|---|---|---|
| **c0 Nền** | Mục 2.1 + menu "Thi đấu" trong `SidebarLayout` (ẩn khi tắt / khi vai trò không có quyền) + mục "Trình độ" / "Xếp hạng" / "Giải của tôi" trong `CustomerLayout` | — |
| **c1 Giải đấu (nhân viên / quản lý)** | Danh sách giải; **tạo giải** (wizard 4 bước kèm bản xem trước thể thức); **chi tiết giải**: thanh tiến trình + "việc cần làm" + nút chính, 5 tab (Sân · Đăng ký & điểm danh · Lịch & kết quả · Bảng đấu & sơ đồ · Kết quả); hộp bốc thăm, khoá sơ đồ (bấm hai ô đổi chỗ), chốt giải (xem trước điểm trình), W.O. đội vắng, thêm trận tay, đổi đồng đội, sân của giải; **sơ đồ dạng hình** (plan 21) | `/competition/tournaments`, `/new`, `/:id` |
| **c2 Bấm điểm + TV** | Bấm điểm trực tiếp (điện thoại, cầm dọc: hai nửa, giao cầu, hoàn tác, đổi sân, "không đánh tiếp được"); nhập tỉ số nhanh (W.O. / bỏ cuộc); **màn hình TV** của giải và của buổi (chỉ đọc, chữ lớn, tự cập nhật) | `/competition/live/:matchId`, `/competition/score/:matchId`, `/competition/tournaments/:id/board`, `/competition/sessions/:id/board` |
| **c3 Giao lưu** | Danh sách + tạo buổi (luật điểm); chi tiết buổi: điểm danh, xếp sân trống (xem trước kéo-thả, cảnh báo cặp đã chung đội), sân đang đánh, người chờ, đổi luật, đóng buổi (xem trước điểm trình trước / sau) | `/competition/sessions`, `/:id` |
| **c4 Người chơi** | Danh sách người chơi + hồ sơ (nhân viên): chấm trình (kể cả chấm nhanh), xác nhận trình, chỉnh điểm (quản lý, bắt buộc lý do), sổ điểm; **hàng chờ duyệt** (quản lý) | `/competition/players`, `/competition/reviews` |
| **c5 Khách hàng** | **Trình độ của tôi** (hai thẻ điểm Đơn / Đôi + biểu đồ recharts + "chi tiết từng trận"); **form tự chấm** 7 bước; hồ sơ thi đấu của tôi (quyền riêng tư…); **BXH** (công khai, hai tab, lọc); hồ sơ người khác + đối đầu; **Giải của tôi**; **bấm điểm trận của tôi** (cùng màn hình bấm điểm, nút xác nhận → "chờ nhân viên xác nhận" với trận tính điểm); nút "Trình độ" ở trang **Khách hàng** (nhân viên) | `/rankings`, `/players/:id`, `/my-rating`, `/my-rating/assess`, `/my-rating/profile`, `/my-tournaments`, `/my-matches/:id/score` |
| **c6 Hoàn thiện** | Rà điện thoại 390 px + sáng / tối cho mọi màn hình, mất kết nối / service tắt (trạng thái rõ ràng, không trang trắng), hiệu năng (chunk riêng, không kéo recharts vào trang không dùng), tài liệu 07 + DeploymentGuide + `CLAUDE.md`, báo cáo tổng | — |

Thứ tự đề xuất theo giá trị với chủ dự án: **c0 → c1 → c2 → c3 → c4 → c5 → c6** (giải đấu + bấm điểm trước vì đã bấm thử nhiều nhất).

### 2.3 Phân quyền trên giao diện

Theo bảng vai trò → scope của cổng (plan 23): nhân viên thấy vận hành (đăng ký, điểm danh, gọi sân, nhập tỉ số, giao lưu); **quản lý / admin** thêm tạo giải, bốc thăm, khoá sơ đồ, chốt giải,
chỉnh điểm, duyệt; khách chỉ phần của mình. Giao diện **ẩn** nút không có quyền (khai một chỗ trong `lib/permissions.js`, có test) nhưng **service mới là chốt chặn thật** (vẫn trả 403).

### 2.4 Giao diện / kiểu dáng

- Màn hình nhân viên đi theo hệ Tailwind sáng / tối của `SidebarLayout`, dùng lại `Modal`, `Badge`, `Table`…; màn hình khách đi theo hệ Kinetic của `CustomerLayout`.
- Sơ đồ dạng hình (vàng đồng / xanh lá, nền tối) là một khối độc lập trong cả hai chế độ sáng / tối; TV luôn tối, chữ lớn.
- Tiếng Việt, ngày giờ theo múi giờ chi nhánh như phần còn lại của app.

## 3. Kiểm thử sẽ làm (thật)

- **Vitest (không thêm thư viện):** hàm thuần trong `lib/` (pha của giải, luật tỉ số, quyền, định dạng, mã sân → tên, dịch lỗi); hình học sơ đồ; **render phía máy chủ**
  (`react-dom/server`) cho các thành phần chính (sơ đồ 8 / 12 / 16 / 32 đội, bảng điểm, thẻ điểm trình) — kiểm cấu trúc HTML mà không cần jsdom.
- **Jest backend:** endpoint `status`, `?branchId=` ở SSE.
- **Trình duyệt thật (Chrome), từng slice** trên stack thật (backend + service + DB tạm, đã có sẵn): đi đúng luồng người dùng bằng chuột / phím — **laptop và điện thoại 390 px, sáng và tối** — với từng vai trò:
  - c1: tạo giải → mở đăng ký → đăng ký (gõ tìm không dấu) → điểm danh → bốc thăm → gọi trận ra sân → nhập tỉ số → khoá sơ đồ → hết giải → chốt (đúng các kịch bản plan 20–21);
  - c2: bấm điểm trên điện thoại (3 game, đổi sân, hoàn tác, retire), hai máy cùng một trận (409 → "máy khác vừa bấm"), TV nhận `score` tức thì;
  - c3: điểm danh → xếp sân → bấm điểm → đóng buổi; c4: chấm trình, chỉnh điểm; c5: khách tự chấm, xem BXH khi chưa đăng nhập, bấm điểm trận của mình, bị chặn trận người khác.
- **Chịu lỗi:** tắt service giữa chừng (giao diện báo rõ, tự nối lại khi bật), token hết hạn khi đang giữ luồng SSE, mở hai tab, F5 giữa thao tác.
- **Hồi quy:** toàn bộ Vitest + Jest backend + `npm run build` frontend xanh; kích thước chunk không phình các trang không liên quan; app **tắt tính năng** vẫn như cũ (menu ẩn, không request thừa).
- Dọn sạch dữ liệu / tiến trình thử sau khi xong. Ghi kết quả từng slice vào mục 9.

## 4. Câu hỏi đã chốt (05/10/2026: chủ dự án chọn đúng đề xuất ở cả 7 câu)

1. **Cách làm việc theo slice:** mỗi slice xong thì **commit + push + báo cáo ngắn** rồi mình làm slice kế tiếp luôn (chỉ dừng hỏi khi vướng quyết định), hay **dừng chờ bạn bấm thử và duyệt từng slice**?
   **Đề xuất: làm liên tục, báo cáo từng slice; bạn có thể chen vào bấm thử và góp ý bất cứ lúc nào** (vì phạm vi lớn, chờ duyệt từng slice sẽ kéo dài nhiều ngày).
2. **Thứ tự slice** như mục 2.2 (giải đấu + bấm điểm trước, khách sau) — hay muốn đưa phần khách (c5) lên trước?
3. **Endpoint `GET /api/v1/competition/status`** và `?branchId=` cho SSE ở cổng nối (mục 2.1) — đồng ý thêm vào cổng (đề xuất: có)?
4. **Đường dẫn / menu:** màn hình nhân viên dưới `/competition/*` với nhóm menu "Thi đấu" trong sidebar; khách có `/rankings`, `/my-rating`, `/my-tournaments`… — chấp nhận như bảng 2.2 (đề xuất: có)?
5. **Màn hình TV** mở bằng chính phiên đăng nhập của nhân viên trên máy TV (07 đã ghi "nhân viên mở trên TV"), **không** làm đường xem công khai không cần đăng nhập — chấp nhận (đề xuất: có)?
6. **Kiểm thử giao diện:** Vitest hàm thuần + render phía máy chủ + chạy trình duyệt thật, **không thêm thư viện** (đề xuất) — hay thêm jsdom + Testing Library vào `devDependencies` để có test component tương tác?
7. **Bàn thử:** sau (c) chỉ còn là công cụ tạm ngoài repo, mình **không** cập nhật thêm — đồng ý (đề xuất: có)?

## 5. Không làm trong (c)

Đổi nghiệp vụ / hợp đồng của service; ứng dụng di động riêng; phân tích video AI (04); thông báo đẩy khi điểm trình đổi; xuất / in sơ đồ; i18n (chỉ tiếng Việt như app hiện tại);
thêm thư viện UI / state (dùng React + context + hook như phần còn lại).

## 6. Rủi ro

| Rủi ro | Giảm bằng |
|---|---|
| Phạm vi lớn (~30 màn hình / hộp thoại; bàn thử gần 2 300 dòng + màn hình khách mới) | Chia 7 slice, mỗi slice chạy thật + commit riêng; chuyển từ bản mẫu đã bấm thử thay vì thiết kế lại |
| Mất thao tác dở khi tự cập nhật (lỗi đã gặp ở bàn thử) | Dải "Có cập nhật mới" + `UpdateBanner` dùng chung; test hành vi trên trình duyệt thật |
| SSE qua cổng: token 15 phút, EventSource không refresh | `competitionStream.js` refresh trước mỗi lần nối (như `realtimeClient`), service đóng luồng đúng lúc token hết hạn → nối lại |
| Kéo recharts / sơ đồ nặng vào mọi trang | Route lazy-load theo slice; kiểm kích thước chunk sau `npm run build` |
| Hai máy bấm một trận | `revision` + `Idempotency-Key`; 409 `LIVE_CONFLICT` → tải lại, báo "máy khác vừa bấm" (đã có bài học ở bàn thử) |
| Tính năng tắt mà menu vẫn hiện / bắn request lỗi | `status` + `CompetitionContext`; kiểm riêng chế độ tắt |

## 7. Theo dõi tiến độ

- [x] Đọc frontend + bàn thử + đặc tả 07, lập plan (05/10/2026)
- [x] Chủ dự án duyệt plan + trả lời 7 câu mục 4 (05/10/2026, theo đề xuất)
- [x] c0 Nền (status + SSE branchId ở cổng; api / stream / context / component dùng chung; menu)
- [x] c1 Giải đấu (danh sách, tạo, chi tiết 5 tab, bốc thăm, khoá sơ đồ, chốt, sơ đồ dạng hình)
- [x] c2 Bấm điểm trực tiếp + nhập tỉ số + màn hình TV (màn TV của buổi đã viết, bấm thử cùng slice c3)
- [x] c3 Giao lưu
- [x] c4 Người chơi + hàng chờ duyệt
- [x] c5 Khách hàng (trình độ, tự chấm, BXH, hồ sơ, giải của tôi, bấm điểm trận của mình, nút ở trang Khách hàng)
- [x] c6 Hoàn thiện (điện thoại / sáng-tối / lỗi / hiệu năng / tài liệu)
- [x] Báo cáo (c) → **cả ba phần (a)(b)(c) xong → xin chủ dự án duyệt merge `main`** (không tự push main) — đã báo cáo 06/10/2026; chủ dự án duyệt "merge vô main đi" cùng ngày → `main` fast-forward `379e634` → `f8f9204`

## 8. Việc chủ dự án phải làm sau cùng (khi deploy thật)

Giữ nguyên danh sách ở plan 24 mục 5 (database thứ hai trên Aiven, secret `COMPETITION_DB_NAME`); (c) không thêm việc nào.

## 9. Kết quả

### 9.c0 Nền (05/10/2026)

- **Backend:** `GET /api/v1/competition/status` (công khai, không gọi service; `available` theo ngắt mạch) + `?branchId=` cho SSE → `X-Branch-Id` (không lọt sang service). Jest gateway 30/30 (+4 test), backend **502/502**.
- **Frontend (`features/competition/`):** `api/competitionApi` (Idempotency-Key cho POST/PUT/PATCH, If-Match/ETag, lỗi dịch sang tiếng Việt), `realtime/competitionStream` (SSE + refresh token trước khi nối, lùi 2→30 s, 60 s im lặng = chết), `hooks/useLiveResource` (tải + tự cập nhật, **không tải lại khi đang dở thao tác** → dải "Có cập nhật mới", poll dự phòng, bỏ kết quả cũ về muộn), `hooks/useAction` (khoá bấm đúp), `context/CompetitionContext` (status + toast), `components/ui`, `lib/{errors,format,permissions,labels}`, trang `/competition` + menu "Thi Đấu" (ẩn khi tắt hoặc sai vai trò) + route lazy.
- **Vitest 109/109** (48 test mới: dịch lỗi, định dạng, quyền, dựng request, URL SSE, render phía máy chủ các thành phần); `npm run build` xanh, trang thi đấu là chunk riêng (`CompetitionHome`).
- **Trình duyệt thật (Chrome ngầm, stack thật), 11/11:** nhân viên thấy menu + 3 thẻ (không thấy "Hàng chờ duyệt"), admin thấy cả 4; sáng + tối; 390 px không tràn ngang; **giả lập tính năng tắt** → menu ẩn, trang báo "chưa được bật"; khách bị đưa khỏi `/competition`; không lỗi console / 5xx.

### 9.c1 Giải đấu (05/10/2026)

- **Màn hình:** `/competition/tournaments` (danh sách + lọc), `/new` (form 4 phần, gợi ý thể thức + ước tính số trận, sân bận chỉ chọn sẵn sau khi biết sân nào rảnh), `/:id` (thanh tiến trình 5 bước + "việc cần làm" + nút chính theo giai đoạn; 5 tab Sân · Đăng ký & điểm danh · Lịch & kết quả · Sơ đồ · Kết quả chung cuộc). Hộp thoại: bốc thăm xem trước (bấm hai đội / hai người để đổi chỗ), khoá sơ đồ loại trực tiếp từ vòng bảng (cảnh báo hai đội cùng bảng gặp ngay vòng 1), chốt giải (thứ hạng + điểm trình trước → sau), W.O., thêm trận tay, sân của giải (tên sân thật của chi nhánh), đổi đồng đội, gọi / chọn trận cho sân. Sơ đồ dạng hình (`BracketView` + `lib/bracketLayout`, chuyển từ mục 21) cho 2–32 đội, có bye, tranh hạng 3.
- **Tự cập nhật:** SSE `snapshot` / `score` cập nhật trang; đang mở hộp thoại hoặc đang gõ thì **không tải lại**, hiện dải "Có cập nhật mới", đóng hộp thì tự tải.
- **Vitest 167/167** toàn frontend (58 test mới cho c1: giai đoạn, mô hình, bố cục sơ đồ 2/4/8/16/32 đội, bốc thăm / đổi chỗ, nhập tỉ số, lọc người, dựng gợi ý đăng ký, sân đang dùng, vẽ sơ đồ phía máy chủ); `npm run build` xanh, trang chi tiết giải là chunk riêng 78 kB (26 kB gzip).
- **Trình duyệt thật (Chrome ngầm, stack thật):** luồng chính tạo → đăng ký 8 người → bốc thăm (đổi chỗ) → gọi ra sân → nhập tỉ số → sơ đồ 15 ô → chốt giải: laptop 24/24 (+1 đúng sau sửa kỳ vọng), điện thoại 390 px 25/25 không tràn ngang; phần 2 (vòng bảng + khoá sơ đồ, đôi cặp sẵn + điểm danh cả cặp, W.O., đổi đồng đội, chọn trận / thêm trận / sân của giải, SSE tự cập nhật 1→2, dải "Có cập nhật mới" khi đang mở hộp) 20/20; xem thêm giao diện sáng. Không lỗi console / 5xx.
- **Lỗi bắt được trong lúc bấm thật (đã sửa):** gõ ô tìm khi lần đăng ký trước chưa xong (giờ khoá ô khi đang gửi, không gợi lại người vừa đăng ký); form tạo giải chọn sẵn sân bận vì chưa tải xong "sân đang dùng".
- **Chưa bật cờ:** `lib/features.js` `liveScoring` / `tournamentBoard` = false (nút "Bấm điểm" / "Màn hình TV" ẩn đến c2).

### 9.c2 Bấm điểm trực tiếp + nhập tỉ số + màn hình TV (05/10/2026)

- **`/competition/live/:matchId`** (toàn màn hình, portal vào `<body>` để che cả thanh menu điện thoại): hai nửa Đội A / Đội B đi theo bên sân (`endsSwapped`, màu đi theo đội), chạm +1 điểm, giao cầu 🏸 + "ô phải / trái", dòng trạng thái "Trận 3 game × 21 · Game 2/3 · Ván 1–0" + chip game xếp trái–phải, chọn đội giao trước (trước điểm đầu), Hoàn tác, **khung vàng hết game** (khoá hai nửa tới khi "Tiếp tục", hoàn tác thì tự tắt, "chưa nhả sân" khi 1–0 / 1–1), nhắc **đổi sân ở game quyết định** (chạm 11 / 8 / 16), **"⇆ Đổi bên"** riêng máy này (nhớ theo trận trong `localStorage`, không gọi API), đủ điểm thắng → "Trận đã xong: 21–18, 21–15" + **Xác nhận kết quả** (người chơi ở trận tính điểm: "Chờ nhân viên xác nhận"), **"Không đánh tiếp được…"** (chỉ nhân viên, trận giải), "Nhập tỉ số tay", lưu xong → nút **"← Về giải đấu / buổi giao lưu"**, giữ màn hình sáng (`wakeLock`). Mỗi lần bấm gửi `revision` + Idempotency-Key; 409 `LIVE_CONFLICT` → tải lại tỉ số + báo "máy khác vừa bấm". Cùng một component dùng cho người chơi ở c5 (`mode="player"`).
- **`/competition/score/:matchId`**: nhập tỉ số nhanh (`ScoreForm`: đánh hết / bỏ cuộc giữa trận / W.O.), lưu bằng If-Match, xong có nút về giải.
- **Màn hình TV:** `/competition/tournaments/:id/board` (mọi sân + bảng điểm trực tiếp, Sắp tới kèm giờ dự kiến, kết quả gần đây, xếp hạng bảng, sơ đồ dạng hình, thứ hạng chung cuộc) và `/competition/sessions/:id/board` (sân, hàng chờ tô sáng người vào sân tới, sắp vào sân, kết quả). Chữ lớn, chỉ đọc, nền tối, tự cập nhật SSE. Cờ `FEATURES.liveScoring` / `tournamentBoard` bật → nút "Bấm điểm" ở thẻ sân / sơ đồ và "Màn hình TV ↗" hiện ở trang giải.
- **Vitest 193/193** toàn frontend (+26: bên sân, dòng trạng thái, nghỉ giữa game, đổi sân giữa game quyết định, nơi quay về, kết quả gần đây, dòng kết quả W.O. / bỏ cuộc, vẽ sân TV phía máy chủ); `npm run build` xanh (các trang bấm điểm / TV là chunk lazy riêng).
- **Trình duyệt thật (Chrome ngầm, 390 px, stack thật) 45/45:** bấm A / B, hoàn tác, đội giao trước, **máy 2 tự đổi số qua SSE**, **hai máy: bấm bằng bản cũ → 409 "Máy khác vừa bấm", tỉ số đúng 2–1 không cộng trùng**, TV nhận điểm tức thì khi điện thoại bấm, đủ 21 → Xác nhận → service ghi đúng, "Về giải đấu"; nhập tỉ số nhanh 21–17; trận 3 game: hết game 1 (khung vàng, B sang trái, chip "G1 0–21", Ván "0–1", hoàn tác tắt khung và về 20–0, đánh lại hiện lại), game 2 (về chỗ cũ), game 3 chạm 11 → nhắc đổi sân + hai nửa đổi bên, "Đổi bên" lật riêng máy + nhớ sau F5 + không đổi `endsSwapped` trên service, "Không đánh tiếp được" → đội kia thắng, kết quả `retired` giữ 2 game; trận đã xong báo rõ; không tràn ngang; không lỗi console / 5xx.
- **Lỗi bắt được lúc bấm thật (đã sửa):** màn hình bấm điểm / TV dựng trong khung của `SidebarLayout` nên z-index bị nhốt và thanh menu dưới đè lên nút Hoàn tác → dựng bằng portal vào `<body>`; biểu tượng 🏸 trên TV quá nhỏ → to theo cỡ TV.
- **Ghi chú:** bấm hai lần trong chớp mắt thì lần hai bị bỏ (khoá bấm đúp có chủ ý — tránh cộng trùng); điểm trên điện thoại vẫn đi theo vòng gửi → nhận (không "lạc quan" cộng trước) để không lệch tỉ số khi mạng chập chờn.

### 9.c3 Giao lưu (05/10/2026)

- **`/competition/sessions`** (danh sách + lọc + "+ Tạo buổi" mở hộp thoại: tên, giờ, hình thức Đơn / Đôi, cách xếp, **luật điểm**, sân của buổi — sân đang bận có ghi chú, "tính điểm trình khi đóng buổi") và **`/competition/sessions/:id`**: dòng "việc cần làm" (đếm người có mặt / đang trên sân / chờ / sân trống), thẻ sân (đang đánh: bảng điểm trực tiếp + **Bấm điểm / Nhập tỉ số / Xong (không tỉ số) / Huỷ trận**; trống), **điểm danh** bằng ô gõ tìm không dấu (chưa có điểm → hộp chấm nhanh bằng nhãn trình; `PRESENT_ELSEWHERE` → hỏi "Rời buổi kia rồi điểm danh?" rồi gọi rời buổi kia + điểm danh lại), hàng chờ theo đúng thứ tự ưu tiên xếp sân (tô "vào sân tới"), người trên sân, đã rời, "Rời buổi", **Xếp sân trống…** (xem trước, bấm hai người để đổi chỗ giữa hai đội / hai sân / người chờ, cảnh báo đồng đội trùng lượt trước, "Xếp lại (seed khác)"), danh sách trận theo lượt, **Sửa buổi / đổi luật điểm** (trận đang đánh giữ luật cũ; khoá Đơn / Đôi khi đã có trận), **Đóng buổi…** (xem trước số trận có tỉ số / sẽ bị huỷ + điểm trình trước → sau), Huỷ buổi, "Màn hình TV ↗". Menu "Giao Lưu" trong sidebar; thẻ "Giao lưu" ở trang Thi đấu bật.
- Tách dùng chung: `hooks/useLoad`, `components/MoreMenu`, `chip` (từ trang giải) — không đổi hành vi trang giải.
- **Vitest 208/208** toàn frontend (+19: mô tả buổi, nhóm người chơi, ghi chú chờ, kế hoạch xử lý lỗi điểm danh, đổi chỗ khi xếp sân, body gửi service chỉ có seed khi chưa sửa / nguyên văn khi sửa tay, body tạo / sửa buổi); `npm run build` xanh.
- **Trình duyệt thật (Chrome ngầm, laptop + 390 px) 34/34:** tạo buổi qua hộp thoại → điểm danh 8 người bằng gõ tìm → người chưa có điểm (tạo qua `PUT /players/by-ref`) vào hộp chấm nhanh → điểm danh 9; người đang ở buổi khác → hộp hỏi rời buổi kia → service xác nhận người đó `left` ở buổi kia; **máy khác điểm danh → trang tự cập nhật (11 người)**; xếp sân trống: 2 sân, bấm hai người đổi chỗ + dải "Đã đổi tay", 3 người còn chờ, xác nhận → 2 sân "Đang đánh" và service có đúng 2 trận; TV buổi (2 sân + hàng chờ 3 người, nhận điểm vừa bấm); Bấm điểm → màn hình bấm điểm → quay lại; nhập tỉ số 21–14 → sân trống + dòng trận; "Xong (không tỉ số)"; xếp lượt 2 rồi "Huỷ trận"; Sửa buổi: Đơn / Đôi bị khoá + đổi sang 3 game × 15; Đóng buổi: xem trước + trạng thái "Đã đóng" (service `closed`); 390 px không tràn ngang; không lỗi console / 5xx. Chạy lại hồi quy c1 (24/24), c1 phần 2 (20/20), c2 (45/45) sau khi tách thành phần dùng chung: xanh.
- **Lỗi bắt được lúc bấm thật (đã sửa):** sau luồng "rời buổi kia" cờ "đang gõ dở" không được tắt nên máy khác điểm danh chỉ hiện dải "Có cập nhật mới" thay vì tự cập nhật (giờ tắt cờ khi luồng xong hoặc khi xoá trống ô gõ); buổi đã đóng vẫn hiện chữ "điểm danh đủ người rồi bấm Xếp sân trống" và danh sách "đang chờ" rỗng (giờ hiện "Không có trận" + danh sách người chơi).
- **Ghi chú:** cảnh báo đồng đội trùng lượt trước không tính lại sau khi sửa tay (service không có endpoint tính lại; ghi rõ trong hộp thoại).

### 9.c4 Người chơi + hàng chờ duyệt (05/10/2026)

- **`/competition/players`**: danh sách (tên, điểm Đơn / Đôi + nhãn + độ tin cậy, cờ chưa xác thực / cần xác nhận / chấm nhanh), tìm theo tên (service tìm, không phân biệt dấu), lọc theo cờ, phân trang. **`/competition/players/:id`** (hồ sơ nhân viên): hai thẻ điểm Đơn / Đôi (đã xác nhận chưa, tạm tính, độ tin cậy), **Chấm trình…**, **Chấm nhanh…** (chỉ người chưa có điểm), **Xác nhận trình** từng nội dung và **Chỉnh điểm…** (chỉ quản lý; lý do ≥ 10 ký tự, kiểm ngay trên form), xếp hạng, **sổ điểm** ("Quản lý chỉnh tay: 3.75 → 4.10 (+0.35)" kèm lý do; "Chi tiết từng trận": kỳ vọng E, hệ số K, hệ số trận, điểm), thống kê, trận gần đây, đồng đội hay đánh. **`/competition/players/:id/assess`**: form chấm trình. **`/competition/reviews`** (quản lý): bài tự chấm "Cần xác nhận" và bài chấm AI chờ duyệt — Đồng ý (xác nhận trình, giữ điểm) / Sửa rồi duyệt (bảng 12 tiêu chí) / Từ chối. Menu "Người Chơi" (nhân viên) và "Chờ Duyệt" (quản lý / admin); nhân viên vào thẳng `/competition/reviews` được báo "chỉ quản lý duyệt".
- **Form chấm trình dùng chung** (`components/AssessmentWizard.jsx`, dùng lại cho khách ở c5): bảy bước đúng docs/03 mục 2.4 — Thông tin chơi → 4 trang tiêu chí (mỗi tiêu chí 5 thẻ mô tả, tiêu chí then chốt có nhãn) → Xem lại (bảng 12 tiêu chí bấm "Sửa", **điểm xem trước không lưu**, **giải thích bằng lời khi điểm bị trần** — "giới hạn ở 3.49 vì Trái tay chỉ ở mức 2", cờ cần xác nhận báo trước, ô ghi chú cho nhân viên) → Kết quả; **bản nháp tự lưu trên máy** (khôi phục sau F5, xoá sau khi lưu); bộ tiêu chí lấy từ service (`GET /rubrics/current`), frontend không chép lại. Người đã có trận tính điểm: chỉ quản lý chấm, điểm hiện tại không đổi (báo rõ).
- **Lỗi thật bắt được ở cổng nối (plan 23) khi bấm ô tìm:** gõ tên có **khoảng trắng** ("thanh nhan") → 400 "must be url encoded": `incoming.searchParams.delete('token')` làm URL mã hoá lại khoảng trắng thành "+" còn bộ kiểm hợp đồng của service từ chối "+". Sửa trong `gateway.js` (đổi "+" còn lại sang `%20`; dấu + thật vẫn `%2B`) + test Jest (kiểm có đỏ khi bỏ bản sửa); phía frontend `competitionApi` cũng tự mã hoá `%20` (`serializeParams`) để không phụ thuộc cổng.
- **Vitest 221/221** toàn frontend (+13 `lib/rating`: các bước, trang đủ / thiếu, thông tin chơi, body gửi service, giải thích trần, bản nháp, chỉnh điểm, câu sổ điểm; +1 mã hoá tham số); Jest backend gateway 31/31 (+1); `npm run build` xanh.
- **Trình duyệt thật (Chrome ngầm, nhân viên + quản lý, laptop và 390 px) 30/30 ở lần chạy sạch cuối + hàng chờ duyệt ở lần chạy trước (33/34, lỗi còn lại là thao tác xoá ô tìm của kịch bản):** nhân viên thấy "Người Chơi" không thấy "Chờ Duyệt"; tìm "thanh nhan"; lọc "Chấm nhanh"; chấm nhanh TB+ → 3.75 cả Đơn lẫn Đôi, "Chưa xác thực", sổ điểm "khởi tạo 3.75", nhân viên không có "Chỉnh điểm…" / "Xác nhận trình"; form chấm: giới tính bắt buộc, "Tiếp" khoá khi thiếu, F5 giữa chừng → "Đã khôi phục bản nháp (2/12)", trần 3.49 giải thích đúng, lưu → kết quả 3.49 + xoá nháp + "Nhân viên chấm"; quản lý: xác nhận trình Đơn (Đôi vẫn chưa), chỉnh điểm (lý do ngắn bị chặn, hợp lệ → 4.10, sổ điểm kèm lý do), "Chi tiết từng trận", thống kê / trận gần đây; hàng chờ có bài tự chấm của khách (kinh nghiệm mức 5), Sửa rồi duyệt → rời hàng chờ; không tràn ngang; không lỗi console / 5xx.

### 9.c5 Khách hàng (06/10/2026)

- **Trang của khách** (vỏ `CustomerLayout`, hệ Kinetic tối; nội dung bọc khung `dark` để thành phần dùng chung luôn vẽ kiểu tối): **`/my-rating`** (hai thẻ điểm, vị trí xếp hạng hoặc "vị trí dự kiến" khi chưa đủ điều kiện, **biểu đồ recharts** điểm theo thời gian — chunk tải riêng, sổ điểm + "Chi tiết từng trận", "Chấm trình ngay" / "Chấm lại" hoặc lý do khoá), **`/my-rating/assess`** (cùng form `AssessmentWizard` với nhân viên: trần 4.5, không ô ghi chú, báo trước "cần nhân viên xác nhận"; đã có trận / nhân viên đã xác nhận → báo lý do thay vì mở form), **`/my-rating/profile`** (tên thi đấu 2–30 ký tự, quyền riêng tư Thành viên / Công khai / Ẩn có giải thích, chi nhánh thường chơi từ danh sách chi nhánh công khai, lối chơi, giới tính chỉ sửa trước trận tính điểm đầu tiên; thống kê, thành tích, trận gần đây, đồng đội hay đánh; chỉ gửi ô đã đổi), **`/my-tournaments`** (giải đang đánh / đã kết thúc, lịch trận sắp tới, **"Bạn đang thi đấu ở Sân… → Bấm điểm trận này"**, tự làm mới 8 giây vì khách không mở được SSE), **`/my-matches/:id/score`** (cùng `LiveScorePage` ở chế độ người chơi: tự tải lại tỉ số 4 giây; trận tính điểm → "Chờ nhân viên xác nhận", không có "Không đánh tiếp được" / "Nhập tỉ số tay").
- **Công khai:** **`/rankings`** (chưa đăng nhập xem được; hai tab Trình độ / Thành tích, hạng mục Đôi nam / Đôi nữ / Đơn nam / Đơn nữ (+ Đôi nam nữ ở Thành tích), lọc chi nhánh / nhóm tuổi / trình, dòng của mình đánh dấu, "Thành viên" bị che tên với người chưa đăng nhập, "Chi tiết" sáu kết quả tính điểm), **`/players/:id`** (hồ sơ rút gọn theo quyền riêng tư của người đó; người "Ẩn" → "Không mở được hồ sơ này"; khách có thêm "Đối đầu với tôi").
- **Nhân viên:** nút **"🏆 Trình độ"** ở mỗi dòng trang Khách hàng (tìm hồ sơ thi đấu `bd:customer:<id>`, chưa có thì tạo rồi mở hồ sơ; ẩn khi tính năng thi đấu tắt).
- **Menu khách:** thêm "Xếp hạng", "Trình độ", "Giải của tôi" (chỉ khi thi đấu bật); có 9 mục thì thanh trên chỉ hiện từ 1280 px (hẹp hơn dùng ☰ + thanh dưới), thanh dưới điện thoại thay ô thứ 5 bằng "Thi đấu".
- **Vitest 238/238** toàn frontend (+17 `lib/customer`: bảng mặc định, xu hướng, khi nào chấm lại được, biểu đồ gộp mốc trùng, patch hồ sơ chỉ gồm ô đổi, trạng thái giải, gom trận theo giải, câu đối đầu); `npm run build` xanh.
- **Trình độ thật (Chrome ngầm, khách đăng ký mới qua `/auth/register`; laptop + 390 px) 38/38:** chưa đăng nhập xem BXH + che tên + đổi hạng mục + tab Thành tích; khách mới: "Bạn chưa có điểm" → form tự chấm → xem trước **bị trần 4.5** + báo cần xác nhận + không ô ghi chú → kết quả 4.50 "tạm tính" → "Trình độ của tôi" ("chờ nhân viên xác nhận", "Chấm lại", vị trí dự kiến); hồ sơ: nút khoá khi chưa sửa, tên 1 ký tự bị chặn, lưu → service nhận tên / công khai / chi nhánh; BXH đã đăng nhập (tên đầy đủ + "vị trí dự kiến"); hồ sơ người khác + "Đối đầu với tôi"; **người ẩn hồ sơ → khách không mở được**; giải của tôi + **tự bấm điểm trận của mình** (21 điểm → "Trận đã xong" nhưng **không có nút xác nhận**, service từ chối khách tự xác nhận 403, nhân viên xác nhận → màn hình khách tự báo "Đã lưu kết quả"); mở trận của người khác → bị chặn; nút "Trình độ" ở trang Khách hàng; 390 px không tràn ngang; không lỗi console / 5xx. Thêm kiểm với tài khoản khách demo: biểu đồ recharts vẽ đường, "Chấm lại" khoá có lý do, `/my-rating/assess` không mở form.
- **Lỗi bắt được lúc bấm thật (đã sửa):** (1) "Giải của tôi" sập trang vì giả định sai hợp đồng — `upcomingMatches` / `playedMatches` là **số đếm** chứ không phải danh sách → lấy lịch từ `GET /me/matches?scope=upcoming` (và kết quả đã chốt từ `scope=history`); trận đang đánh chưa chốt giải thì khách chỉ thấy số trận đã đánh (service không cho khách đọc danh sách trận của giải); (2) React cảnh báo trùng khoá ở biểu đồ — chấm trình ghi hai dòng sổ điểm (Đơn + Đôi) cùng một lúc → gộp thành một mốc; (3) menu khách 9 mục bị rớt dòng trên màn 1024–1280 px → chỉ hiện thanh trên từ 1280 px khi thi đấu bật.

### 9.c6 Hoàn thiện (06/10/2026)

- **Rà toàn bộ màn hình:** 18 route của nhân viên / quản lý + 7 route của khách × (390 px tối, 390 px sáng, 1440 px sáng) = 75 lượt mở trang: không tràn ngang, không trang trắng, không "sự cố hiển thị", không lỗi console / 5xx; xem mắt thường các ảnh sáng + điện thoại. Sửa: bảng xếp hạng trên điện thoại gọn lại (cột phụ chuyển xuống dưới tên).
- **Lỗi thật bắt được khi rà (đã sửa):** mở nhiều trang có SSE liên tiếp trong **một tab** thì trang thứ 7 treo ở "đang tải" mãi — trình duyệt giữ tài liệu cũ (bộ nhớ đệm trang) cùng kết nối SSE còn mở, chạm giới hạn 6 kết nối / máy chủ. `competitionStream` giờ đóng luồng ngay khi rời trang (`pagehide`) và nối lại khi khôi phục (`pageshow`); đo lại: cả 18 route liên tiếp chạy được.
- **Chịu lỗi (chạy thật, tắt / bật competition-service trong lúc đang mở trang) 14/14:** luồng đứt → chấm "Mất kết nối — đang nối lại", trang giữ dữ liệu cũ; "Tải lại" lúc service tắt → câu báo dễ hiểu (không trang trắng); danh sách giải / BXH / "Trình độ của tôi" của khách → thông báo + "Thử lại"; đủ lỗi liên tiếp thì ngắt mạch → trang Thi đấu báo "đang tạm ngưng" và `/status` trả `available=false`; **app chính (Quản lý sân…) vẫn chạy**; bật lại → trang giải tự nối lại SSE trong ≤ 70 s không cần thao tác, `/status` trở lại `available=true`, khách tải lại bình thường. **Sửa thêm:** lần tải ĐẦU lỗi vì service tắt (chưa có dữ liệu để giữ) trước đây phải bấm "Thử lại" → `useLiveResource` tự thử lại 5 → 10 → 20 → 30 s.
- **Token hết hạn khi giữ luồng SSE (chạy thật 330 s):** luồng mở 2 lần (service đóng luồng đúng lúc token 300 s hết hạn, client lấy token mới và nối lại), điểm bấm sau 5,5 phút vẫn lên TV không cần tải lại.
- **Tính năng TẮT (giả lập `status.enabled=false`) 16/16:** menu ẩn (nhân viên + khách), mọi trang thi đấu báo "chưa được bật" thay vì lỗi; **không có lời gọi API thi đấu nào ngoài `/status`** (trước đó trang giải / "Trình độ của tôi" vẫn gọi API rồi báo lỗi 503 → thêm `FeatureGate` ở cấp route: không dựng trang khi tắt); app chính không đổi.
- **Hiệu năng:** mọi trang thi đấu là chunk lazy riêng (chi tiết giải 42 kB, chi tiết buổi 14 kB, bấm điểm 11 kB, hồ sơ 10 kB, BXH 7 kB…); recharts chỉ kéo vào trang "Trình độ của tôi" (11 kB LineChart; phần lõi 372 kB dùng chung với Dashboard / Báo cáo như cũ); chunk chính 298 → 305 kB (route + ngữ cảnh + menu).
- **Hồi quy sau mọi thay đổi c6** (chạy lại toàn bộ kịch bản Chrome thật): c1 24/24, c1 phần 2 20/20, c2 45/45, c3 34/34, c4 30/30, c5 38/38, c0 10/11 (kiểm "thẻ ghi Sắp có" hết đúng nghĩa vì cả bốn thẻ đã mở); Vitest **238/238**; Jest backend **503/503**; `npm run build` xanh.
- **Tài liệu:** `services/competition-service/docs/07-giao-dien.md` mục 6 (khác biệt giữa thiết kế và hiện thực), `CLAUDE.md` (cấu trúc frontend thi đấu), plan này mục 9.

## 10. Báo cáo tổng (c) — 06/10/2026

| Slice | Commit | Nội dung |
|---|---|---|
| c0 | `0e434b7` | Nền: cổng `/status` + SSE `branchId`, api / stream / context / component dùng chung, menu |
| c1 | `4492a88` | Giải đấu: danh sách, tạo, 5 tab vận hành, bốc thăm, khoá sơ đồ, chốt, sơ đồ dạng hình |
| c2 | `97cfba8` | Bấm điểm trực tiếp, nhập tỉ số nhanh, màn hình TV giải + buổi |
| c3 | `25b5728` | Giao lưu: tạo, điểm danh (chấm nhanh, rời buổi kia), xếp sân trống, đóng buổi |
| c4 | `cb0c966` | Người chơi, form chấm trình dùng chung, xác nhận / chỉnh điểm, hàng chờ duyệt; **sửa cổng nối** (khoảng trắng trong query) |
| c5 | `cdf5642` | Khách: trình độ, tự chấm, hồ sơ, BXH công khai, giải của tôi, tự bấm điểm; nút "Trình độ" ở trang Khách hàng |
| c6 | (commit này) | Rà 75 lượt mở trang, chịu lỗi, tính năng tắt, SSE `pagehide`, tự thử lại, tài liệu |

- **Lỗi thật tìm ra nhờ bấm trên Chrome thật (đều đã sửa, có test hoặc kịch bản giữ lại):** khoảng trắng trong query bị cổng nối mã hoá "+" → service 400 (backend); SSE giữ kết nối khi rời trang → trang thứ 7 treo; trang "Giải của tôi" sập vì giả định sai hợp đồng; cờ "đang gõ dở" làm máy khác không tự cập nhật; z-index bị nhốt trong sidebar; lần tải đầu không tự thử lại khi service tắt; trang vẫn gọi API khi tính năng tắt; biểu đồ trùng mốc; menu khách rớt dòng.
- **Còn lại / chủ dự án:** (1) duyệt merge `feat/competition-integration` vào `main` (mình **không** tự merge / push `main`); (2) lúc deploy thật: tạo database thứ hai trên Aiven + secret `COMPETITION_DB_NAME` (GitHub + Render) — mục 8; (3) dọn máy thử khi chủ dự án nói (tiến trình :5000 / :5102 / :5173 / :5303, container `bd-app` / `bd-mysql-tls`, DB `bd_int_tmp` / `cs_int_tmp` / `bd_demo` / `cs_demo`, file `backend/.keys/competition.env`).
- **Không làm (đã nói ở mục 5):** đổi nghiệp vụ service, app di động riêng, phân tích video AI, thông báo đẩy, in / xuất sơ đồ, i18n.
