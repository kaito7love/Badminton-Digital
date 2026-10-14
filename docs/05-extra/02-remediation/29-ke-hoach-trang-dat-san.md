# Kế hoạch 29: trang Đặt sân (`/dat-san`) — lưới sân × giờ

- **Ngày:** 14/10/2026.
- **Trạng thái:** **đã làm xong cả 6 bước (0–5) và được gộp vào `main` ngày 14/10/2026 theo lệnh "merge vào main đi" của chủ dự án.** Kết quả cuối ở mục 15, kiểm nốt ở mục 16. Gộp cục bộ; **chưa đẩy `origin`** (đẩy là quyết định riêng, vì bản demo Render tự deploy khi `main` được đẩy). Nhánh `feat/trang-dat-san` giữ nguyên, không xoá.
- **Làm lại từ đầu** theo yêu cầu của chủ dự án (14/10/2026: "làm lại trang đặt sân"): không kế thừa hướng thiết kế của ô đặt nhanh ở Trang chủ.
- **Phạm vi:** trang `/dat-san` và những gì nó cần để chạy đúng (một endpoint công khai chỉ-đọc, và nhánh vá luật giờ đang chờ gộp). Mục 7 liệt kê những gì **không** đụng.

## 1. Yêu cầu

`/dat-san` hôm nay chỉ là khung "đang được hoàn thiện" (kế hoạch 28 mục 13). Làm trang đặt sân đầy đủ: khách thấy được sân nào, giờ nào còn trống rồi đặt, thay vì điền form rồi mới biết.

## 2. Hiện trạng (đọc mã `main` @ `c3bfa5a`)

| Chỗ | Hiện trạng |
|---|---|
| `/dat-san` (`pages/Booking/BookingPage.jsx`, 35 dòng) | Tiêu đề, một câu, hai nút ("Đặt nhanh ở Trang chủ", "Lịch đặt của tôi"). Không có đặt sân. |
| Ô đặt nhanh ở Trang chủ (`HomePage.jsx` 437–529) | Form "mù": ngày, **8 mốc giờ cố định** (06, 08, 10, 14, 16, 17, 19, 21), **1–3 giờ**, một ô chọn sân. Bấm "Tìm khung giờ trống" mới biết còn trống không (`handleQuickBooking`, 187), rồi hộp xác nhận, rồi `POST /bookings`. |
| Dữ liệu công khai | `GET /public/courts` (sân + giá + giờ cao điểm), `GET /public/availability` (**một khung giờ của một sân mỗi lần**). Không có API "cả ngày, mọi sân". |
| Quy mô lưới | 3 chi nhánh, 3–4 sân mỗi chi nhánh (`backend/public/layouts/branch-*.json`); giờ mở cửa mặc định 05:00–23:00 → tối đa 4 sân × 18 giờ = 72 ô một ngày. |
| Luật giờ ở server (`BookingService.checkAvailability`, 28–72) | Chỉ kiểm: sân có tồn tại / ngưng / bảo trì, và trùng với lịch `pending`/`confirmed`. **Không có chốt giờ đã qua, không có chốt giờ mở cửa.** |
| Nhánh `fix/customer-booking-flow-round2` (worktree `.claude/worktrees/customer-flow-2`, 2 commit, **chưa gộp**) | `726dc21` chặn khung giờ đã qua (`SLOT_PASSED`, tính theo múi giờ chi nhánh) và dịch thông điệp trùng lịch sang tiếng Việt; `5258d81` chỉ nhận đặt trong giờ mở cửa (`utils/operatingHours.js`, `/public/courts` trả thêm `operatingHours`). 12 file, +840/−26, có test backend 25 + frontend 19. Dựng từ trước kế hoạch 28 nên **xung đột với `main` ở `HomePage.jsx`** (thử gộp trong bộ nhớ: 2 chỗ, đều ở phần đầu file, dòng 7–47 của bản gộp thử). |
| Đăng nhập rồi quay lại | `LoginPage` chỉ đọc `location.state.from.pathname`; Trang chủ cất lựa chọn dở dang ở `sessionStorage["pending_booking"]` rồi tự dựng lại khi quay về. |
| `/public/*` | Không có bộ giới hạn tần suất (chỉ `authRoutes` và cổng thi đấu có). |
| Server local | Lúc viết kế hoạch này cổng 5000 và 5173 **không trả lời** (đo bằng `curl`, 14/10/2026). |

## 3. Đã chốt (14/10/2026)

| Câu | Chọn |
|---|---|
| Bố cục | **Lưới sân × giờ**: chọn ngày, thấy cả bảng sân theo giờ (trống / kín / đã qua / bảo trì / cao điểm), chạm một khoảng giờ rồi đặt; trên điện thoại thành từng sân |
| Phạm vi | **Chỉ trang `/dat-san`**: ô đặt nhanh ở Trang chủ và mọi nút "Đặt sân" khác giữ nguyên |
| Backend | **Thêm 1 endpoint công khai chỉ-đọc** cho dữ liệu cả ngày |
| Nhánh chưa gộp | Ban đầu chọn "gộp vào `main` trước"; **đổi ngày 14/10/2026: gộp thẳng vào `feat/trang-dat-san`** (vì nhánh này đúng bằng `main` cộng một commit tài liệu). Hai bản vá lên `main` cùng lúc với trang mới, khi bạn nói "merge vào main đi" |

## 4. Thiết kế

**Máy tính (từ 768 px):**

| Khối | Nội dung |
|---|---|
| Trên cùng | Chọn chi nhánh (dùng chung `customer_selected_branch_id` với Trang chủ, nên chọn một nơi là cả hai nơi cùng nhớ) · dải ngày bắt đầu từ hôm nay |
| Lưới | Hàng = sân (tên, giá thường / cao điểm); cột = từng giờ trong giờ mở cửa. Ô có 5 trạng thái: **trống**, **cao điểm** (trống nhưng giá cao), **đã kín**, **đã qua**, **bảo trì**. Có chú thích màu |
| Chọn | Chạm ô đầu rồi ô cuối trên **cùng một hàng**; nếu giữa chừng có ô không trống thì ô vừa chạm thành điểm bắt đầu mới và có dòng giải thích. Chạm lại ô đã chọn để bỏ |
| Tóm tắt (dính dưới lưới) | Sân · ngày · khung giờ · số giờ · tạm tính (tách giờ thường / cao điểm) · nút **Đặt sân** |

**Điện thoại và máy tính bảng (dưới 1024 px; kế hoạch ghi 768 px, đo trên trang thật nâng lên 1024 px, xem mục 13):** không cuộn ngang. Chọn sân bằng thẻ chuyển (mỗi sân một thẻ), mỗi sân là lưới 4 cột các giờ; thanh tóm tắt dính ngay trên thanh tab dưới của header.

**Luồng:**
1. Chọn ngày → lưới tải (khung xương khi đang tải; lỗi mạng có nút Thử lại; chi nhánh không có sân; "hôm nay đã hết giờ, chọn ngày khác").
2. Chọn khoảng giờ → bấm **Đặt sân** → hộp xác nhận tóm tắt (cùng kiểu hộp xác nhận đang dùng ở Trang chủ).
3. Chưa đăng nhập: nút đổi thành **Đăng nhập để đặt sân**; cất lựa chọn vào `sessionStorage` (khoá riêng của trang này, **không** dùng `pending_booking` của Trang chủ để hai trang không đọc nhầm dạng dữ liệu của nhau), sang `/login` với `from = /dat-san`, quay về dựng lại lựa chọn và **hỏi lại server** xem khung đó còn trống không (lịch của hôm qua hay khung đã kín sau khi khách đăng nhập không được gửi thẳng lên).
4. Nhân viên (`admin`, `branch_manager`, `employee`): cùng thông báo như Trang chủ hiện nay — đặt lịch trong màn Quản Lý Đặt Sân.
5. Server từ chối (409 trùng lịch, giờ đã qua, ngoài giờ mở cửa): thông điệp tiếng Việt của server, lưới tải lại, giữ nguyên ngày và sân đang xem.
6. Thành công: như Trang chủ hôm nay — chuyển tới `/my-bookings` (lịch ở trạng thái chờ xác nhận).

**Độ tươi của lưới:** tải lại khi tab được focus lại và mỗi 30 giây lúc tab đang hiện, và sau mọi lần server từ chối. Không thêm luồng SSE công khai.

**Giao diện:** khung `CustomerLayout`, skin Kinetic; mọi lớp có cả cặp sáng/tối (`text-slate-900 dark:text-white`...). Ô lưới là `<button>` có `aria-label` ("Sân số 2, 18:00, trống, 95.000đ") và `aria-pressed`; thao tác được bằng bàn phím (Tab, Enter/Space).

**Luật nằm ở server, không sao chép xuống trình duyệt:** endpoint mới trả sẵn trạng thái từng ô do chính `BookingService` tính (cùng nguồn với `POST /bookings`), trang chỉ vẽ. Trình duyệt không tự suy luận "đã qua" hay "ngoài giờ" từ đồng hồ máy khách.

### 4.1 Endpoint mới

`GET /api/v1/public/availability/day?date=YYYY-MM-DD[&branchId=]` (không cần đăng nhập, chỉ đọc):

```
{ branch: { id, name }, date,
  operatingHours: { open, close }, peakHours: { peakStartHour, peakEndHour },
  courts: [{ id, name, bookable, note, peakPricePerHour, offpeakPricePerHour,
             slots: [{ start: "17:00", end: "18:00", state: "free"|"booked"|"passed"|"closed"|"maintenance", peak: true }] }] }
```

- **Không lộ** mã lịch, tên hay số điện thoại khách (cùng nguyên tắc `/public/availability`); test khoá bằng schema đóng.
- Dựa trên một truy vấn lịch `pending`/`confirmed` của cả chi nhánh trong ngày (không gọi từng ô); trạng thái ô dùng lại luật trùng lịch, giờ mở cửa và giờ đã qua của `BookingService` / `operatingHours` (sau bước 0).
- Ngày hợp lệ: từ hôm nay (theo múi giờ chi nhánh) đến một giới hạn ngày tới (câu b dưới) — để không dò lịch vô hạn; ngày quá khứ trả 400.

## 5. Đã trả lời (14/10/2026: "theo gợi ý hết, code đi")

Cột "Gợi ý" cũng là quyết định: a = 60 phút; b = 14 ngày (server chặn cùng mức); c = 3 giờ; d = như hôm nay; e = có bản mẫu; f = được bật server local.

| Câu | Hỏi | Gợi ý |
|---|---|---|
| a | **Bước giờ:** ô lưới 60 phút (như hôm nay) hay 30 phút? Giá và `priceCalculator` chịu được 30 phút, nhưng lưới đông gấp đôi và "cao điểm" lệch nửa giờ | 60 phút |
| b | **Đặt trước tối đa mấy ngày?** Server hiện không giới hạn | 14 ngày (server chặn cùng mức) |
| c | **Tối đa mấy giờ một lần đặt?** Trang chủ hôm nay 1–3 giờ, server không giới hạn | 3 giờ, như hôm nay |
| d | **Sau khi đặt xong:** chuyển tới `/my-bookings` như hôm nay, hay hiện màn xác nhận ngay trên trang rồi mới có nút tới Lịch đặt | như hôm nay |
| e | **Bản mẫu bấm thử** (Artifact riêng tư, như kế hoạch 28) trước khi code để bạn xem lưới thật sự trông thế nào | có |
| f | **Bật server local để kiểm thử thật:** backend :5000 và Vite :5173 đang không chạy. Mình bật hai tiến trình đó (nền, ngoài app, không đụng DB ngoài dữ liệu thử rồi dọn) khi bạn đồng ý | đồng ý |

## 6. Cách làm và cách kiểm (sau khi bạn nói "code đi")

Mỗi bước một commit; đo trước, sửa, đo lại bằng Chrome thật (chuột, bàn phím, điện thoại 390 / 360), không chỉ đọc mã; dữ liệu thử tạo qua API thật và dọn sau.

| Bước | Việc | Kiểm |
|---|---|---|
| 0 | **Nhánh cũ:** trong worktree `customer-flow-2` gộp `main` vào `fix/customer-booking-flow-round2`, sửa 2 chỗ xung đột ở `HomePage.jsx`, rồi gộp nhánh đó vào `feat/trang-dat-san` (không vào `main`) | Jest + Vitest toàn bộ xanh; đi lại luồng đặt ở ô Trang chủ (chưa / đã đăng nhập): chặn giờ đã qua và ngoài 05:00–23:00; báo kết quả (mục 10); `main` chỉ đổi khi bạn nói "merge vào main đi" cho cả nhánh này |
| 1 | Endpoint `/public/availability/day` + validator + test (Jest) | Test phủ: sân bảo trì, lịch kín nửa giờ, ngày hôm nay (giờ đã qua theo múi giờ chi nhánh), ngày xa, `branchId` sai; **phản hồi không chứa trường nhận dạng khách**; truy vấn thật trên MySQL: số truy vấn không tăng theo số ô |
| 2 | Phần logic thuần của trang (chọn khoảng giờ, tạm tính, cất / dựng lại lựa chọn) + test (Vitest) | Mọi quy tắc ở mục 4: khoảng bị chắn giữa chừng, đổi ngày thì bỏ chọn, vượt số giờ tối đa |
| 3 | Trang `/dat-san`: lưới, thanh tóm tắt, hộp xác nhận, trạng thái tải / lỗi / trống | Chụp sáng / tối × 1440, 1024, 768, 390, 360; không trang nào tràn ngang; đủ 5 trạng thái ô |
| 4 | Nối đặt thật + đăng nhập quay lại + nhân viên + 409 | **Luồng thật:** khách chưa đăng nhập → chọn → đăng nhập → quay lại đúng lựa chọn → đặt; hai phiên cùng giành một khung (409 → lưới tải lại); khung đã qua sau nửa đêm; tài khoản nhân viên |
| 5 | Đo cuối + báo cáo | Vitest, Jest, `vite build` sạch; ghi kết quả thật vào một mục "Kết quả" cuối file này; chờ "merge vào main đi" |

## 7. Ngoài phạm vi (không đụng, trừ khi bạn nói)

Ô đặt nhanh ở Trang chủ và các nút "Đặt sân" ở Cửa hàng, Tài khoản, Lịch đặt (vẫn trỏ `/#booking-widget`); trang Lịch đặt (`/my-bookings`); nhân viên đặt lịch ở Quản Lý Đặt Sân; thanh toán / đặt cọc online; sửa hay huỷ lịch (khách huỷ ở Lịch đặt như hôm nay); `CLAUDE.md`, `00-tien-do.md` và mọi tài liệu khác ngoài file này; backend ngoài endpoint mới và nhánh vá luật giờ.

**Biết sẵn nhưng không thuộc kế hoạch này:** server chưa giới hạn số lịch chờ xác nhận của một khách (nhánh cũ ghi một ca E2E đỏ về chuyện này); lưới làm việc "giữ nhiều khung" dễ hơn form cũ. Nói nếu muốn xử lý riêng.

## 8. Rủi ro

| Rủi ro | Giảm |
|---|---|
| Gộp nhánh cũ làm vỡ ô đặt nhanh ở Trang chủ (phần header mới và phần widget đụng nhau) | bước 0 đi lại luồng đặt thật trước / sau và chỉ gộp khi bạn nói |
| Lưới cho thấy "trống" nhưng lúc bấm đã có người đặt | server vẫn là nơi chốt ở `POST /bookings` (409 → tải lại lưới, thông điệp rõ); lưới tải lại theo focus và mỗi 30 giây |
| Endpoint công khai bị gọi dồn / dò lịch | một truy vấn gộp cho cả ngày; giới hạn dải ngày; không lộ dữ liệu khách. Bộ giới hạn tần suất cho `/public/*` chưa có ở bất kỳ route nào — để việc riêng nếu bạn muốn |
| Giờ "đã qua" lệch múi giờ (server đọc UTC, quán ở UTC+7) | server tính theo `branches.timezone` (đúng cách nhánh cũ làm); test ở các múi giờ khác nhau, và đo thật lúc 00:00–07:00 giờ Việt Nam |
| Ô lưới nhỏ khó chạm trên điện thoại | điện thoại dùng lưới 4 cột từng sân, ô ≥ 44 px; đo bằng cách chạm thật ở 360 px |
| Bản demo Render deploy ngay khi push `main` | không gộp, không đẩy khi bạn chưa nói "merge vào main đi" |

## 9. Cách làm việc

- Chỉ làm trên nhánh này (và worktree `customer-flow-2` cho bước 0), mỗi bước một commit; không gộp, không đẩy `main` khi chưa có lệnh của bạn.
- Không sửa `CLAUDE.md`, `00-tien-do.md` hay tài liệu nào khác ngoài file này, nếu bạn chưa nói.
- Không dừng hay chạy lại server của bạn, không chạy migration trên DB của bạn, không xóa nhánh hay Artifact khi bạn chưa nói.
- Việc gì không có trong kế hoạch này thì hỏi trước khi làm; câu hỏi chưa được trả lời không tính là đồng ý.

## 10. Kết quả bước 0 (14/10/2026)

**Nhánh cũ `fix/customer-booking-flow-round2`** (worktree `customer-flow-2`): gộp `main` vào, commit `75766e8`. Xung đột đúng 2 chỗ ở `HomePage.jsx` (phần import và hằng số đầu file), xử lý: giữ `SiteHeader` của `main`; giữ `bookingSlots`, `wallClockPassed`, `to12h` của nhánh; bỏ `useCart`, `isStaff`, `homePathForRole`, `SECTION_LINKS` vì chỉ phục vụ khối header cũ đã bị `main` thay. So với `main`, diff của `HomePage.jsx` chỉ còn phần widget và khối số liệu giờ mở cửa. **Chưa gộp vào `main`, chưa đẩy.** Sau đó gộp nhánh này vào `feat/trang-dat-san` (commit `736a123`, không xung đột): cây mã giống hệt `75766e8`, chỉ thêm file kế hoạch này (đo bằng `git diff --stat 75766e8 HEAD`), nên kết quả kiểm bên dưới vẫn đúng cho nhánh này.

| Kiểm | Kết quả |
|---|---|
| Jest (backend) | 44 suite, **589/589** xanh |
| Vitest (frontend) | 25 file, **385/385** xanh |
| `vite build` | sạch |
| API công khai, 8 ca | hôm qua và 00:00 hôm nay → "đã qua"; 02:00, 04:00, 22:30–23:30 ngày mai → "ngoài 05:00–23:00"; 05:00–06:00 hôm nay (04:53 giờ chi nhánh), 22:00–23:00 và 10:00–11:00 ngày mai → trống |
| `POST /bookings` khách hàng, 4 ca | ngày đã qua → 400; 02:00–04:00 → 400; 22:00–23:30 → 400; trùng khung vừa đặt → 409; cả bốn bằng thông điệp tiếng Việt |
| Luồng thật ở Trang chủ (Chrome, 1280) | chọn 16/10 21:00 → số giờ chỉ còn 1–2 → hộp xác nhận (21:00–23:00, 120.000đ) → "Đăng nhập để đặt sân" → đăng nhập → quay về `/` và hộp xác nhận dựng lại **đúng khung đó** → xác nhận → `/my-bookings` có lịch "chờ xác nhận" |
| Điện thoại 375 | ô đặt nhanh nằm gọn trong khung (cả bốn ô nhập, không tràn ngang). **Chưa có ảnh chụp**: cửa sổ app bị ẩn nên chụp ảnh quá thời gian; chỉ đo bằng DOM |

Dữ liệu thử: lịch #228 của khách demo (sân 1, 16/10 21:00–23:00) đã **huỷ** qua API; khung đó trống lại (kiểm bằng `/public/availability`). Lịch ở trạng thái `cancelled`, không xoá hàng khỏi DB (không có đường xoá lịch).

**Lưu ý đã thấy khi đo:**
- Danh sách `/my-bookings` xếp theo ngày tăng dần nên lịch mới đặt (16/10) nằm cuối trong 21 lịch; việc này nằm trong kế hoạch cũ chưa duyệt của nhánh đó (mục 2.E), không thuộc kế hoạch này.
- Trong worktree nhánh cũ có file chưa theo dõi `28-ke-hoach-luong-khach-dat-san-vong-2.md`: **trùng số 28** với `28-ke-hoach-header-thong-nhat.md` của `main`, trạng thái "chờ chủ dự án duyệt", và mục 2.A của nó (lưới giờ thật cho Trang chủ, endpoint `/public/availability-grid`) trùng với endpoint của kế hoạch này. Không đụng file đó; kế hoạch này không làm các mục khác của nó.
- `/public/branches` không trả `timezone` nên widget Trang chủ rơi về mặc định Việt Nam (đúng với mọi chi nhánh hiện có).

**Bản mẫu bấm thử:** <https://claude.ai/artifact/M9FUSenTXEoYva7CAu784u> (riêng tư). Lưới sân × giờ với dữ liệu minh hoạ; có chuyển sáng / tối, "xem như" khách / khách hàng / nhân viên, giờ hiện tại giả lập (04:50 / 15:30 / 22:10), trạng thái tải / lỗi, và giả lập "có người vừa đặt" để xem luồng 409. Ở bản mẫu, ô đã bắt đầu được coi là "đã qua" (chặt như widget Trang chủ, đừng nới theo lý do ghi ở `utils/bookingSlots.js`); server vẫn nhận khung đang chạy dở cho quầy.

## 11. Kết quả bước 1 (14/10/2026)

Commit `b357203` trên `feat/trang-dat-san`. Bản mẫu đã được chủ dự án duyệt ("bản mẫu ổn") trước bước này.

**Endpoint** `GET /api/v1/public/availability/day?date=YYYY-MM-DD[&branchId=]`, công khai, chỉ-đọc, `Cache-Control: no-store`. Trả `branch {id,name}`, `date`, `today`, `lastBookableDate`, `operatingHours`, `peakHours`, và mỗi sân kèm `slots[{start,end,state,peak}]` với `state` ∈ `free | booked | passed | maintenance`. Hai trường thêm so với mục 4.1 (`today`, `lastBookableDate`) để trang dựng dải ngày theo lịch của chi nhánh chứ không theo đồng hồ máy khách. Mã: `utils/daySlots.js` (thuần), `PublicCatalogService.getDayAvailability`, `routes/publicRoutes.js`; `getCourts` tách `courtCatalog` để lưới dùng chung bảng giá và cờ `bookable` với `/public/courts`.

| Kiểm | Kết quả |
|---|---|
| Jest, hai file mới (không cần DB) | `daySlots.test.js` 22 + `publicDayAvailability.test.js` 8 = **30/30** xanh |
| Số câu SQL thật (chạy `getDayAvailability` trên DB local) | **6 câu cố định** (chi nhánh, sân, lịch cả ngày, 3 dòng setting) cho cả 4 ca: 4 sân hôm nay, 4 sân +13 ngày, 3 sân, 3 sân có 1 bảo trì; 54–72 ô mỗi ngày |
| Cột lấy từ bảng lịch | chỉ `court_id`, `start_time`, `end_time` (đọc từ SQL thật) |
| Đối chiếu mọi ô với `/public/availability` (server thật, DB thật) | 3 chi nhánh × 14 ngày × mọi sân × mọi ô = **2520 ô, 0 lệch**: 2250 trống, 9 kín, 9 đã qua, 252 bảo trì |
| Lịch thật tạo qua API (khách demo) | nguyên giờ, 2 giờ, **lệch nửa giờ** 09:30–10:30 làm kín cả hai ô 09 và 10, **13:15–13:45** làm kín ô 13, sát giờ đóng 22:00–23:00, và lịch **đã huỷ** (ô trống lại): 10/10 ô đúng |
| Rò dữ liệu | phản hồi không chứa tên, SĐT, mã khách hay mã lịch (quét chuỗi + test schema đóng) |
| Từ chối | quá khứ 400 · quá 14 ngày 400 · ngày cuối của dải 200 · `2026-02-30` 400 · sai dạng 400 · thiếu `date` 400 · chi nhánh 999 404 · `branchId=abc` 400 |
| Jest toàn bộ | 617–619 xanh; **`competitionGateway.test.js` lỗi 2–3 ca khi chạy song song cùng server đang bật**, đạt 41/41 khi chạy riêng (2 lần). Lỗi **giống hệt** trên `75766e8` (code chưa có bước 1) ở cùng điều kiện máy: đây là test dễ lỗi theo tải đã ghi nhận từ trước (giới hạn tần suất và SSE), không do thay đổi này |

**Điều chưa kiểm được:** ca "server từ chối vì khung đã đóng" trên DB thật. Lúc đo là 05:xx sáng nên chỉ có ô 05:00 là đang chạy dở (9 ô, một ô mỗi sân); các ô đã đóng hẳn chỉ được khoá bằng test đơn vị (quét nhiều mốc `now` đối chiếu `BookingService.hasSlotPassed`, kể cả hai múi giờ).

**Ghi nhận cần bạn quyết (chưa làm, không nằm trong bước này):**
1. **[Đã trả lời 14/10/2026: chặn vai `customer` thôi; đã làm, xem mục 12.] `POST /bookings` có chặn đặt quá 14 ngày không?** Mục 5 câu b ghi "server chặn cùng mức", nhưng mục 7 để backend ngoài endpoint mới là ngoài phạm vi. Hiện chỉ lưới (và dải ngày của trang) giới hạn 14 ngày; lịch gọi thẳng API vẫn đặt được xa hơn như hôm nay. *Gợi ý: chặn ở `createBooking` cho vai `customer` thôi, nhân viên đặt xa hơn cho giải đấu hay sự kiện vẫn được.*
2. **Tài liệu API chưa có endpoint mới:** `docs/APIDesign.md` (mục Public), `backend/src/docs/openapi.yaml` và bộ Postman. Mục 9 cấm sửa tài liệu khác khi bạn chưa nói.

**Server local:** backend :5000 và Vite :5173 đã chuyển từ worktree nhánh cũ sang thư mục chính (khởi động lại một lần lúc đo, có nạp `competition.env`); dịch vụ thi đấu :5102 giữ nguyên.

## 12. Kết quả bước 2 và chặn 14 ngày (14/10/2026)

### 12.1 Khách chỉ đặt trước tối đa 14 ngày (commit `2f89d85`)

Trả lời câu 1 ở mục 11: **chặn vai `customer` thôi**. `BookingService.createBooking` từ chối lịch của khách sau hôm nay + 13 ngày (theo lịch chi nhánh) bằng 400 tiếng Việt nêu rõ ngày cuối; nhân viên và quản trị không bị giới hạn. Chặn trước khi kiểm khung giờ và ghi lịch. Chỉ vai khách tốn thêm một truy vấn (múi giờ chi nhánh).

| Kiểm | Kết quả |
|---|---|
| Jest `bookingAdvanceWindow.test.js` (không cần DB) | **8/8**: biên hôm nay và hôm nay + 13 được, +14 bị chặn; "hôm nay" theo chi nhánh chứ không theo UTC (cùng mốc UTC, Việt Nam và New York khác ngày cuối); khách bị chặn **trước** khi gọi kiểm khung giờ và trước `Booking.create`, giao dịch rollback; nhân viên và quản trị +78 ngày vẫn tạo được và không tốn truy vấn múi giờ |
| API thật (server khởi động lại với mã mới) | khách +13 ngày **201**; khách +14 ngày **400** "Chỉ nhận đặt trước tối đa 14 ngày (đến 27/10/2026)…"; khách +60 ngày **400**; quản trị +60 ngày **201** |

**Hệ quả cần biết:** ô đặt nhanh ở Trang chủ (không đổi trong kế hoạch này) cho chọn ngày bất kỳ và `/public/availability` vẫn trả "còn trống" cho ngày xa; khách chọn ngày quá dải sẽ chỉ nhận thông báo ở bước xác nhận (toast hiện đúng thông điệp của server). Muốn Trang chủ báo sớm hơn thì phải đụng ô đó hoặc `/public/availability`: chưa làm.

### 12.2 Bước 2: logic thuần của trang (frontend, `pages/Booking/lib/`)

Năm module thuần, không đụng React hay DOM; trang ở bước 3 chỉ gọi và vẽ.

| Module | Việc |
|---|---|
| `daySelection.js` | chạm ô → chọn 1 giờ / kéo thành khoảng (hai chiều, tối đa 3 giờ) / bỏ chọn; khoảng bị chắn giữa chừng thì chọn lại và nói rõ; `reconcileSelection` khi lưới tải lại (người khác vừa đặt → bỏ chọn kèm lý do); `summarize` (tách giờ thường / cao điểm, tạm tính theo cờ `peak` của server); thân `POST /bookings` |
| `pendingBooking.js` | cất / lấy lựa chọn qua đăng nhập, **khoá riêng** `pending_booking_datsan`; bỏ khi ngày ra ngoài dải hoặc dữ liệu hỏng; nuốt lỗi kho bị chặn |
| `dayStrip.js` | dải 14 ngày từ `today` / `lastBookableDate` của server, số học lịch thuần (không dính múi giờ máy) |
| `gridModel.js` | hàng tiêu đề giờ, tình trạng cả ngày (`ok` / `full` / `over` / `no-courts`), nhãn trợ năng, tách "Sân số 1 (Thường)" thành tên + loại |
| `bookingError.js` | 409 / 400 / 401 / mất mạng → việc trang cần làm; dịch "Validation failed" |

| Kiểm | Kết quả |
|---|---|
| Vitest, 5 file mới | **57/57**; toàn bộ **442/442** (30 file, trước đó 385); `vite build` sạch |
| Hợp đồng với server | `day.fixture.json` là **phản hồi thật** của `/public/availability/day` (chi nhánh Quận 7: hai sân đặt được, một sân bảo trì), chỉ cố định ngày; test dựng mọi ca từ đó và có ca khẳng định dạng dữ liệu, nên server đổi dạng thì test đỏ trước khi trang vỡ |
| Thử đột biến | đổi giới hạn 3 giờ → 2: 2 test đỏ; bỏ "chạm lại thì bỏ chọn": 1 test đỏ; đã hoàn lại nguyên vẹn (`cmp`) |
| Múi giờ máy chạy | 57/57 dưới `TZ=UTC`, `Asia/Ho_Chi_Minh`, `Pacific/Auckland` |

**Dữ liệu thử đã dọn:** các lịch thử của khách demo (#228–#235) và lịch + hồ sơ khách vãng lai "Thử dải ngày" của lần thử quản trị (#236, khách #136) đã xoá mềm (`deleted_at`), không còn hiện trong app.

## 13. Kết quả bước 3 (14/10/2026)

Commit `dc79b8f`. Trang `/dat-san` thật thay khung "đang hoàn thiện": `BookingPage.jsx` + `pages/Booking/components/` (lưới, thanh tóm tắt, hộp xác nhận, dải ngày, chú thích, các trạng thái) + `useDayAvailability.js` (tải thường và tải ngầm) + `useCompactLayout.js`; thêm `publicService.getDayAvailability`. Nối vào logic thuần của bước 2.

**Chưa nối (đúng phân chia của kế hoạch):** nút "Xác nhận đặt sân" trong hộp xác nhận đang **khoá** (hộp không có `onConfirm`); gọi `POST /bookings`, cất lựa chọn qua đăng nhập và xử lý 409 là bước 4.

### 13.1 Hai điều đo ra khác với kế hoạch / bản mẫu

| Phát hiện | Cách xử lý |
|---|---|
| Ở 768 px lưới đầy đủ 18 cột chỉ còn ô rộng **24 px**, quá nhỏ để chạm (1024 px: 38 px) | Lưới gọn (từng sân) dùng cho **mọi màn dưới 1024 px**, cùng ngưỡng với thanh tab dưới của header; ở 640–1023 px là lưới 6 cột, dưới 640 px là 4 cột; ô cao 56 px |
| `<main>` của `CustomerLayout` là `relative z-10`, chân trang cũng `relative z-10` và nằm sau: **chân trang đè lên mọi phần tử `fixed` trong `<main>`**, kể cả `z-30` / `z-50`. Đo ở 768 px: chân trang che nửa nút "Đặt sân"; hộp xác nhận không phủ tới chân trang | Thanh tóm tắt (dưới 1024 px) và hộp xác nhận dựng ra `document.body` bằng `Portal`. Từ 1024 px thanh `sticky` ở lại trong luồng. Chưa sửa `CustomerLayout` vì nó dùng chung cho cả khu khách |

### 13.2 Đo trên Chrome thật (headless, CDP; Vitest không thay được bước này)

| Kiểm | Kết quả |
|---|---|
| Cỡ màn hình | 1440×900, 1024×768, 768×1024, 390×844, 360×740, mỗi cỡ chọn một khoảng giờ: **không cỡ nào tràn ngang** (`scrollWidth` ≤ `innerWidth`) |
| Số ô, cỡ ô nhỏ nhất | máy tính 72 ô (4 sân × 18), điện thoại 18 ô mỗi sân; ô nhỏ nhất: 44 px (1440), 38 px (1024), **56 px** (≤ 1023) |
| Chọn / kéo khoảng | chạm hai ô → 2 ô `aria-pressed`, thanh tóm tắt "180.000đ · 2 giờ cao điểm" đúng; ở điện thoại dùng cảm ứng thật (`touchStart/End`) |
| Sáng / tối | 1440 và 390 cả hai; chuyển bằng `localStorage.theme`, kiểm lớp `kinetic-light` và `html.dark` |
| Xếp lớp | ở cả 5 cỡ: thanh tóm tắt và nút **ở trên cùng** tại điểm giữa (`elementFromPoint`), hộp xác nhận nằm trong `body` và **phủ** cả chân trang |
| Hộp xác nhận theo vai | khách: "Lựa chọn hiện tại được giữ…" + nút "Đăng nhập để đặt sân"; khách hàng demo: "Đặt dưới tên Nguyễn Văn Khách • …" + nút xác nhận **khoá**; (nhân viên: chỉ có test dựng) |
| Trạng thái | khung chờ (trả chậm 3 s) · lỗi 503 ("Thử lại") · hết giờ hôm nay (mọi ô đã qua → "Xem ngày mai") · hết ô trống (toàn ô kín, hint "Ngày này không còn khung trống", thanh tóm tắt khoá) · chi nhánh không có sân; ba trạng thái hiếm dựng bằng cách chặn và sửa phản hồi thật của endpoint |
| Đổi chi nhánh | Quận 7: 36 ô + dải "Bảo trì" của sân 3; `customer_selected_branch_id` = 3 (cùng khoá với ô đặt nhanh Trang chủ); tải lại trang vẫn ở Quận 7; về chi nhánh chính |
| Đổi ngày | chọn ô ở T5 rồi đổi sang T6: lựa chọn **bị bỏ**, thanh tóm tắt về "Chưa chọn" |
| **Người khác vừa đặt đúng khung đang chọn** | chọn Sân 2 · 20:00–21:00 ngày mai, tạo lịch trùng bằng API (khách demo, 201), bấm "Tải lại": lựa chọn bị bỏ, thông báo "Khung giờ bạn chọn vừa có người đặt. Mời bạn chọn khung khác." |

### 13.3 Kiểm tra mã

| Kiểm | Kết quả |
|---|---|
| Vitest `booking-ui.test.jsx` (react-dom/server) | 21: số ô khớp dữ liệu, sân bảo trì là dải không có nút, `aria-pressed` / `disabled` / nhãn đọc, hộp xác nhận ba vai và nút khoá khi thiếu `onConfirm`, dải ngày, chú thích, bốn trạng thái; quét nguồn: không có `text-white` / `bg-slate-950` trần, mỗi màu ô có biến thể `dark:` |
| Toàn bộ Vitest | **463/463** (31 file; trước bước này 442); `vite build` sạch |
| Thử nghiệm lỗi của chính test | ba lỗi đầu là test viết chưa chuẩn (nhãn đọc có kèm loại sân; regex `disabled` khớp nhầm lớp `disabled:opacity-50`; quét nguồn bị cắt chuỗi `+`), đã sửa test, không sửa thành phần |

**Điều chưa kiểm:** trình duyệt điện thoại thật (chỉ mô phỏng cỡ và cảm ứng trong Chrome); chế độ nhân viên trên trang chạy (chỉ có test dựng hộp xác nhận); đăng nhập rồi quay lại và đặt thật (bước 4); lưới lúc quá 22:00 giờ chi nhánh trên DB thật (trạng thái "hết giờ" được dựng bằng cách sửa phản hồi).

**Lỗi nhỏ đã tự sửa lúc đo (đều trong trang mới):** đổi chi nhánh bị đồng bộ kéo ngược về chi nhánh cũ (chỉ đồng bộ khi chưa có chi nhánh); nhãn tháng "TH10" khó hiểu → "Thg 10"; thanh cuộn trắng ở dải ngày; thanh tóm tắt cao 198 px ở 390 và bị nút ↑ của header che → bố cục hai cột, chừa chỗ cho nút ↑ (130 px); khung giờ bị cắt cụt ở màn hẹp → khung giờ lên dòng đầu.

**Dữ liệu thử đã dọn:** các lịch thử #237–#238 (huỷ rồi xoá mềm). Chrome headless chạy ở cổng 9333 (profile riêng trong thư mục tạm của phiên), không đụng Chrome của bạn.

## 14. Kết quả bước 4: đặt thật (14/10/2026)

Commit `a35d0b7`. Nút xác nhận gọi được: khách hàng → `POST /bookings` → `/my-bookings`; khách chưa đăng nhập → cất lựa chọn (`pending_booking_datsan`) → `/login` với `from = /dat-san` → quay về dựng lại đúng chi nhánh, ngày, sân, khung giờ, chờ lưới đúng ngày về rồi **tự mở hộp xác nhận** kèm dòng "Đã đăng nhập"; nhân viên thấy hướng dẫn, không có nút đặt, không gọi POST. Quyết định đặt thật nằm ở `lib/bookingFlow.js` (`confirmBooking`, `resumePending`) để test bằng kho giả và hàm API giả.

**Đã chốt theo "như hôm nay" (câu d):** đặt xong chuyển tới `/my-bookings`, lịch ở trạng thái chờ xác nhận.

### 14.1 Luồng thật trên Chrome (30 ca, `step4-flows.js`)

| Nhóm | Ca đạt |
|---|---|
| A. Khách chưa đăng nhập, form đăng nhập thật | chọn 18:00–20:00 Sân số 3 → "Đăng nhập để đặt" → sang `/login`, khoá cất đúng, **không** gọi POST, khoá của Trang chủ không bị đè → đăng nhập bằng gõ phím thật → quay về `/dat-san`, hộp tự mở đúng lựa chọn, nút xác nhận bấm được, khoá đã xoá → đặt → `/my-bookings` có thẻ "chờ xác nhận" đúng ngày giờ sân; server có lịch `pending`, sân 3, 18:00–20:00 |
| B. Đã đăng nhập sẵn | thanh ghi "Đặt sân", hộp "Đặt dưới tên Nguyễn Văn Khách", không có dòng "Đã đăng nhập"; đặt thẳng, server có lịch |
| C. 409 | tạo lịch trùng bằng API ngay trước khi bấm: hộp đóng, ở lại `/dat-san`, thông báo "Khung giờ này đã có người đặt…", lựa chọn bị bỏ, ô đó thành "đã kín" sau khi lưới tải lại |
| D. Mất mạng | chặn `POST` bằng `Fetch.failRequest`: hộp còn mở, thông báo "Không kết nối được máy chủ…", nút bấm lại được, lựa chọn giữ; bật mạng lại bấm lần nữa thì đặt được |
| E. 400 luật nghiệp vụ | phản hồi 400 giả lập: hộp đóng, hiện đúng câu của server, lựa chọn bị bỏ |
| F. Nhân viên (admin) | "Quản Lý Đặt Sân", chỉ có nút "Đóng", **không có POST nào** |
| G. Hết hạn | lựa chọn cất của hôm qua (khách hàng) và lựa chọn của nhân viên: không dựng lại, không mở hộp, khoá bị xoá |
| H. Điện thoại 390 px, cảm ứng | chọn Sân số 2 19:00–21:00 → đăng nhập → quay về, hộp tự mở đúng sân và thẻ sân đang xem là Sân số 2 (không phải sân đầu) → đặt, server có lịch `pending` ở sân 2 |

**Lỗi JS / `console.error` của trang trong cả bộ: 0.**

### 14.2 Nhiều loại người dùng (18 ca, `step5-diverse.js`, theo yêu cầu 14/10)

| Tình huống | Kết quả |
|---|---|
| **Khách mới đăng ký ngay giữa luồng đặt** (form `/register` thật, SĐT mới) | đăng ký xong quay về `/dat-san`, hộp tự mở đúng khung (nhờ `from` được mang qua trang đăng ký), "Đặt dưới tên" đúng tên và SĐT khách mới; server: khách mới có đúng 1 lịch `pending`; trang Lịch đặt hiện lịch |
| Khách demo đặt ở **chi nhánh khác** (Quận 7) | hộp ghi "Chi nhánh Quận 7"; lịch ở sân 8, chi nhánh 3 |
| Biên | ngày cuối của dải (hôm nay + 13), khung sát giờ đóng 22:00–23:00: đặt được; khoảng dài nhất 3 giờ chọn được; chạm ô ngoài khoảng thì chọn lại; hai lịch **liền kề** 08:00–11:00 và 11:00–12:00 cùng sân đều đặt được |
| **Hai khách khác nhau** giành một khung | khách mới đặt trước qua API; khách demo chậm hơn nhận 409, hộp đóng, thông báo đúng, ô thành "đã kín" |
| Vai nhân viên | nhân viên chi nhánh chính và quản lý Quận 3: hướng dẫn đặt ở Quản Lý Đặt Sân, không nút đặt, không POST |
| Lựa chọn hết hạn, lặp 3 lần | cả ba lần: không dựng lại, không mở hộp, khoá bị xoá |

Lỗi JS / `console.error`: 0.

### 14.3 Chuyện không suôn sẻ (ghi lại đúng như đã xảy ra)

| Việc | Chuyện gì | Kết luận |
|---|---|---|
| Lần chạy bộ kiểm đầu: 23/30, lần hai 28/30 | các "lỗi" đầu là của **script kiểm**: so chữ phân biệt hoa/thường (nút hiển thị in hoa bằng CSS), đếm nhầm thẻ chọn sân vào số ô đang chọn, và so với thẻ lịch đã huỷ của lần chạy trước | sửa script, không sửa trang |
| Ca G1 (lựa chọn của hôm qua) lỗi hai lần liên tiếp rồi **đạt** ở lần chạy sạch, và đạt 3/3 khi lặp riêng, 4/4 khi tái hiện riêng lẻ | **Chưa xác định được nguyên nhân** lúc nó lỗi (khoá cất vẫn còn trong kho sau khi mở trang). Hai lần lỗi trùng với lúc mình đang sửa file trong `src/` làm Vite dev server nạp lại trang (Tailwind coi mọi file trong `src/`, kể cả file test, là phụ thuộc của CSS) | nghi do nạp lại trang giữa chừng của dev server; **không** chứng minh được. Cần theo dõi nếu thấy lại |
| Một lần trang **trắng** (body rỗng, đã tải xong, không lỗi JS) lúc mở `/dat-san` bằng phiên nhân viên ngay sau một luồng 409; một lần lưới không hiện sau 8 s | tải lại thì bình thường. Săn lại: **42 lần tải lạnh (3 vai) + 8 vòng lặp đúng chuỗi đó: 0 lần trắng**; không có yêu cầu mạng lỗi nào, log Vite không có gì ở thời điểm đó | **chưa giải thích được, chưa tái hiện**. Chỉ thấy ở dev server (chưa chạy bản build thật). Rủi ro còn mở, ghi ở mục 15 |
| Hết hạn mức đăng nhập (10 lần / 15 phút / IP) giữa chừng | do chính các lần thử của mình | chờ cửa sổ hết hạn (11 phút), thêm bộ nhớ đệm token cho script. **Không** tắt hay nới giới hạn của server |

**Dữ liệu thử đã dọn (xoá mềm):** 19 lịch thử (#249–#253, #258–#271) và hồ sơ khách + tài khoản "Khách Thử Mới" do bài thử đăng ký tạo ra. Backend log có một chuỗi 403 `DELETE /bookings/...`: script thử gọi huỷ bằng cả hai token (chỉ một token là chủ lịch), vô hại.

## 15. Kết quả cuối và đề nghị gộp (14/10/2026)

**Nhánh `feat/trang-dat-san`, 13 commit trên `main`, 45 file, +4688/−44.** Chưa gộp, chưa đẩy. Gộp vào `main` là gộp **cả** hai bản vá giờ của nhánh cũ (chặn khung giờ đã qua; chỉ nhận đặt 05:00–23:00) cùng trang mới; bản demo Render sẽ nhận tất cả khi đẩy `main`. Không có migration, không đổi DB.

### 15.1 Đo cuối ở `HEAD`

| Kiểm | Kết quả |
|---|---|
| Jest backend | **627/627** (47 suite; `competitionGateway.test.js` từng lỗi chập chờn khi chạy song song với server đang bật, xem mục 11, lần này đạt) |
| Vitest frontend | **476/476** (32 file) |
| `vite build` | sạch |
| Luồng thật trên Chrome | **30/30** (mục 14.1) + **18/18** nhiều loại người dùng (mục 14.2); bước 3: 5 cỡ màn hình × sáng / tối, không tràn ngang, xếp lớp đúng |
| Đối chiếu lưới với `/public/availability` | 2520/2520 ô, 0 lệch (đo ở bước 1; mã endpoint không đổi từ đó) |
| Ô đặt nhanh Trang chủ | còn nguyên: mở hộp, sang `/login`, cất ở khoá `pending_booking` (khoá của trang mới không bị đụng) |

### 15.2 Việc đã làm so với yêu cầu

| Mục | Làm |
|---|---|
| Trang `/dat-san` | lưới sân × giờ, dải 14 ngày, chọn 1 giờ hoặc kéo khoảng tối đa 3 giờ, tạm tính, hộp xác nhận theo vai, các trạng thái, tải lại ngầm, đặt thật, đăng nhập quay lại |
| Backend | `GET /public/availability/day` (6 câu SQL cố định, không lộ dữ liệu khách); khách chỉ đặt trước tối đa 14 ngày ở `POST /bookings` |
| Nhánh cũ | gộp `fix/customer-booking-flow-round2` vào nhánh này (giờ đã qua, giờ mở cửa) |
| Không đụng | ô đặt nhanh Trang chủ và các nút "Đặt sân" khác; `CustomerLayout`; khu nhân viên; `CLAUDE.md`, `00-tien-do.md`, `APIDesign.md`, `openapi.yaml`, Postman |

### 15.3 Rủi ro còn mở và điều chưa kiểm

| | Nội dung |
|---|---|
| **Trang trắng chập chờn** | một lần ở dev server, không tái hiện được sau 50 lần thử (mục 14.3). Chưa chạy bản build thật (`vite preview` / Render). Nên mở thử `/dat-san` vài lần trên bản chạy thật sau khi gộp |
| Ca G1 lỗi hai lần rồi đạt | nguyên nhân chưa xác định; nghi dev server nạp lại trang giữa chừng |
| Trang Chủ vẫn cho chọn ngày quá 14 ngày | `/public/availability` trả "còn trống" cho ngày xa, khách chỉ bị từ chối ở bước xác nhận (toast đúng thông điệp). Muốn báo sớm thì phải đụng Trang chủ hoặc endpoint đó: chưa làm |
| Chưa kiểm | điện thoại thật; Safari / Firefox (chỉ Chrome); trình đọc màn hình; hai tab cùng đặt một khung; bản demo Render sau reset đêm; lưới lúc quá 22:00 giờ chi nhánh trên DB thật (trạng thái "hết giờ" dựng bằng cách sửa phản hồi); đặt thật bằng tài khoản nhân viên ở trang này (không có đường đặt, chỉ có hướng dẫn) |
| Tài liệu API | `APIDesign.md`, `openapi.yaml`, Postman chưa có endpoint mới; chờ bạn nói |
| Giới hạn đăng nhập | các lần thử của mình đã chạm 10 lần / 15 phút / IP; không đổi giới hạn của server |

### 15.4 Chờ quyết định của chủ dự án

1. **"merge vào main đi"** để gộp nhánh (kèm hai bản vá giờ của nhánh cũ), hoặc nói chỗ cần sửa.
2. Có cập nhật tài liệu API (`APIDesign.md`, `openapi.yaml`, Postman) và `CLAUDE.md` / `00-tien-do.md` cho trang và endpoint mới không.
3. Có muốn báo sớm giới hạn 14 ngày ở ô đặt nhanh Trang chủ không (đụng Trang chủ).

## 16. Kiểm nốt các mục "chưa kiểm" (14/10/2026, theo yêu cầu)

Hộp **DB tạm cô lập** `bd_reset_check_tmp` (đã xoá sau khi kiểm; DB dev của bạn không bị đụng, đã đối chiếu số bảng, chi nhánh, lịch trước và sau) + hai backend thử cổng 5200 / 5201 chạy `NODE_ENV=production` phục vụ **bản build thật** (`FRONTEND_DIST_DIR`, một tiến trình cho cả web và API như container của Render). Cả hai đã tắt; server của bạn (5000, 5173, 5102) chạy suốt, không đụng.

| Mục chưa kiểm | Cách kiểm | Kết quả |
|---|---|---|
| **Bản demo sau reset đêm** | chạy đúng `scripts/demo-reset.js` (xoá bảng → migrate → seed) vào DB tạm, **225 s**, rồi mở trang trên bản build thật với dữ liệu vừa seed | `N0–N3` **đạt**: đăng nhập khách demo, đăng nhập từ trang đặt rồi quay lại hộp tự mở đúng khung, server có lịch `pending` đúng sân. Nội dung sau reset: 4 sân (Sân số 1–3, Sân VIP), giờ cao điểm 17:00–21:00. Lại chạy cả bộ **30 ca luồng thật: 30/30**, 0 lỗi trang |
| **Trang trắng chập chờn** (mục 14.3), trên bản build thật | 40 lần tải lạnh `/dat-san` (20 khách, 20 khách hàng) | **0/40 trắng**; thời gian tới lưới: trung vị 425 ms, tối đa 871 ms; không yêu cầu mạng lỗi, không lỗi JS. Tức là hiện tượng ở dev server chưa lặp lại trên bản build; vẫn **chưa giải thích được** lần đã thấy |
| **Hai tab cùng đặt một khung** (cùng tài khoản, một trình duyệt) | hai tab đều chọn Sân số 2 16:00 và mở hộp; tab A xác nhận; tab B xác nhận sau | `C0–C2` **đạt**: tab B nhận 409, hộp đóng, ở lại `/dat-san`, lựa chọn bị bỏ, thông báo "Khung giờ này đã có người đặt…", ô thành "đã kín"; server có **đúng một** lịch cho khung đó |
| **Lưới lúc quá 22:00 trên server thật** | backend thử chạy đồng hồ lệch tới **22:31 giờ VN** (preload thay `Date`), DB tạm đã seed, **không sửa phản hồi** | `S1–S9` **đạt**: server trả mọi ô hôm nay là `passed` (kể cả ô 22:00 đang chạy dở); trang tự vẽ "Hôm nay đã hết giờ nhận đặt", không có thanh tóm tắt; "Xem ngày mai" sang ngày mai với 72 ô trống; đặt 21:00–22:00 hôm nay bị 400 "đã qua"; đặt **22:00–23:00 (đang chạy dở) server nhận** (201) — đúng luật đã ghi (chỉ từ chối khung đã đóng hẳn), còn lưới vẫn gọi ô đó là `passed` có chủ đích |
| **Trình đọc màn hình** (không có NVDA / VoiceOver trên máy) | cây trợ năng của Chrome (`Accessibility.getFullAXTree`) + thao tác chỉ bàn phím | xem 16.1 |
| **Safari, Firefox** | **không cài trên máy: không chạy được** | chỉ rà mã tĩnh, xem 16.2 |
| **Điện thoại thật** | **không có thiết bị: không kiểm được** | mô phỏng cỡ và cảm ứng trong Chrome (mục 13, 14) vẫn là mức cao nhất |

### 16.1 Trợ năng: tìm ra và sửa hai lỗi thật của hộp xác nhận

Cây trợ năng: một vùng `main`, đúng một tiêu đề cấp 1 "ĐẶT SÂN", **73 nút trong khu lịch sân đều có tên đọc được** (VD "Sân số 1 (Thường), 08:00, trống, 60.000đ"), 72/72 ô là nút bật/tắt (`pressed`), ô không đặt được là `disabled`, có vùng `status` cho gợi ý và lý do.

Bàn phím (14 ca): Tab tới ô trống đầu tiên (sau **26** lần Tab, xem dưới), Space chọn ô, Tab + Enter kéo thành khoảng 2 giờ, Tab tới nút ở thanh tóm tắt, Enter mở hộp, Escape đóng. Hai ca **lỗi lúc đầu, là lỗi thật của mã mình viết**:

| Lỗi | Hậu quả | Sửa (`07e307a`) |
|---|---|---|
| hộp khai báo `aria-modal` nhưng **Tab chạy ra phía sau hộp** | người dùng bàn phím / trình đọc màn hình lạc ra trang phía sau đang bị che | khoá tiêu điểm: Tab / Shift+Tab xoay vòng trong hộp (`focusTrap.js`, thuần, 7 test) |
| đóng hộp xong **tiêu điểm không quay về nút đã mở** | rơi về đầu trang, phải Tab lại từ đầu | trả tiêu điểm về đúng nút đã mở (không ép nếu nút đã khoá / gỡ, vd sau lỗi 409) |

Sau sửa: **14/14** ca trợ năng và bàn phím; Vitest 483/483.

**Quan sát ngoài phạm vi (không sửa):** tới được ô lưới đầu tiên phải **26 lần Tab** vì header chung có nhiều mục và **chưa có liên kết "Bỏ qua tới nội dung"**; trong lưới chỉ đi bằng Tab (không có phím mũi tên). Cả hai là của khung chung / thiết kế lưới, nói nếu muốn làm.

### 16.2 Safari, Firefox: rà mã tĩnh (không phải đã chạy)

Mã mới của trang chỉ dùng: `scrollbar-width` / `scrollbar-color` (Firefox hỗ trợ; Safari cũ bỏ qua nên chỉ hiện thanh cuộn mặc định, không vỡ), `env(safe-area-inset-bottom)` và `backdrop-filter` (Safari hỗ trợ; Tailwind thêm tiền tố), CSS grid, `matchMedia().addEventListener`. `toLocaleTimeString({ hour12: false })` chỉ dùng cho dòng "Cập nhật…" (một số engine ghi nửa đêm là 24:xx, chỉ là nhãn). Không dùng API quá mới (`:has`, `dvh`, `structuredClone`, `at()`…). **Chưa chạy trên hai trình duyệt này.**

### 16.3 Giới hạn của chính các phép kiểm này

- Bản thử là **một tiến trình trên máy bạn**, không phải ảnh Docker của Render: không có Cloudflare / ingress, không DB qua TLS (Aiven), không dịch vụ thi đấu chạy cùng, không khởi động nguội 30–60 s của gói free. Reset chạy bằng script, không qua workflow GitHub.
- Đồng hồ lệch chỉ ở **tiến trình backend thử**; trình duyệt dùng giờ thật, nên ca "quá 22:00" đúng nhờ cả hai cùng một ngày lịch.
- Hai tab dùng chung một hồ sơ trình duyệt (cùng `localStorage`), đúng như hai tab thật của một người; hai tài khoản khác nhau giành một khung đã kiểm riêng ở mục 14.2.

## 17. Việc tồn đọng đã làm sau khi gộp (14/10/2026, nhánh `docs/cap-nhat-trang-dat-san-va-han-14-ngay`)

Chủ dự án yêu cầu ba việc còn lại của mục 15.4: cập nhật tài liệu API, cập nhật `CLAUDE.md` / `00-tien-do.md`, báo sớm giới hạn 14 ngày ở ô đặt nhanh Trang chủ.

### 17.1 Ô đặt nhanh Trang chủ báo sớm giới hạn 14 ngày (commit `3328da5`)

Ô ngày có `max` = hôm nay + 13 (theo lịch chi nhánh) và dòng nhắc "Đặt trước tối đa 14 ngày (đến dd/mm)". Chọn ngày quá hạn thì dòng đó thành **đúng câu server trả** (`role="alert"`), nút "Tìm khung giờ" khoá và đổi chữ thành "Chọn ngày sớm hơn", Enter cũng không gửi yêu cầu. Trước đây khách chỉ bị từ chối ở bước xác nhận. Dùng chung hàm thuần với trang Đặt sân (`lib/dayStrip.js`: `isBeyondWindow`, `advanceLimitMessage`, `dayMonth`), nên một luật, một câu chữ; test khoá câu chữ trùng với `BookingService.advanceBookingViolation`.

| Kiểm | Kết quả |
|---|---|
| Vitest | `dayStrip.test.js` 10; toàn bộ 486/486 |
| Chrome thật (8 ca) | mặc định (`max` đúng, nút bấm được); đúng ngày cuối vẫn được; ngày thứ 15 hiện câu của server + nút khoá; Enter ở ô ngày quá hạn: 0 yêu cầu gửi đi; quay lại ngày hợp lệ thì bỏ cảnh báo và đi tiếp tới hộp xác nhận; điện thoại 390 px không tràn ngang; không lỗi JS |

### 17.2 Tài liệu API

| Tệp | Thay đổi |
|---|---|
| `postman/badminton_api_collection.json` (nguồn) | thêm request `Lưới sân × giờ cả ngày` (kèm test: 200, `success`, dạng ô, không lộ dữ liệu khách); cập nhật mô tả `Tạo booking` (luật thời gian, 14 ngày theo vai), `Kiểm tra khung giờ trống`, `Danh sách sân + bảng giá` (`operatingHours`); dòng mô tả đầu 113 → 115 endpoint |
| `backend/src/docs/openapi.yaml` | **sinh lại** bằng `npm run docs:build`: 115 operation, khớp 1-1 115 route |
| `docs/APIDesign.md` | ghi chú đầu file; §5 (luật thời gian theo thứ tự kiểm, vai trò); §12.1 (`/public/availability/day` kèm ví dụ phản hồi, `operatingHours` ở `/public/courts`); §13 (thêm 5 dòng lỗi, sửa câu 409 cũ) |
| `postman/README.md` | tổng 114 → 115, nhóm Public 5 → 6 |

**Hai điều phát hiện:**
- **`npm run docs:build` thoát mã 1 từ bước 1 tới nay** ("collection và `routes/` không khớp 1-1": thiếu `GET /public/availability/day`). Đây là hệ quả của việc thêm route mà không thêm vào collection, và mình đã không chạy lệnh này ở bước 1 (không có trong CI nên không ai thấy). Đã sửa; lần sinh lại này khớp.
- Ví dụ cũ của `GET /bookings/availability` trong `APIDesign.md` dùng sai tên tham số (`date` thay vì `bookingDate`) và thiếu `reason` / `message`; đã sửa theo mã thật.

**Cách kiểm test mới của Postman:** `newman` chưa cài trong repo và mình không tự tải gói mới, nên chạy **đúng đoạn test script trong collection** bằng một lớp giả `pm` tối thiểu trên phản hồi thật: 4/4 đạt; hai thử đột biến (phản hồi lộ `customerName`; trạng thái ô lạ) đều làm test đỏ. Chưa chạy bằng newman thật.

### 17.3 `CLAUDE.md` và `00-tien-do.md`

- `CLAUDE.md`: lệnh `npm run docs:build` (kèm cảnh báo "không sửa tay YAML, thêm route phải thêm vào collection"); đoạn **luật đặt sân và lưới theo ngày** ở phần backend; đoạn **trang Đặt sân** ở phần frontend (cấu trúc, khoá `pending_booking_datsan` tách khỏi `pending_booking`, ngưỡng 1024 px, lý do dùng `Portal`, khoá Tab); sửa câu cũ nói `/dat-san` là trang cơ bản.
- `00-tien-do.md`: mục 28 mới (yêu cầu, đã làm, kiểm chứng, lỗi thật đã sửa, chưa giải thích, đợt 2) và dòng "Cập nhật".

### 17.4 Kiểm tra cuối nhánh này

Jest 627/627 · Vitest 486/486 · `vite build` sạch · `docs:build` khớp 1-1. Chưa gộp vào `main`, chưa đẩy.
