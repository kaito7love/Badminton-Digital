# Kế hoạch 29: trang Đặt sân (`/dat-san`) — lưới sân × giờ

- **Ngày:** 14/10/2026.
- **Trạng thái:** chủ dự án đã duyệt kế hoạch và chọn "theo gợi ý hết" ở mục 5 (14/10/2026). **Bước 0 đã làm xong, chờ "merge vào main đi" cho nhánh cũ; bản mẫu bấm thử chờ bạn xem** (mục 10). Chưa có dòng code nào của trang mới. Nhánh `feat/trang-dat-san`, tách từ `main` @ `c3bfa5a`.
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
| Nhánh chưa gộp | **Gộp vào `main` trước** (bước 0 dưới đây), rồi mới làm trang mới |

## 4. Thiết kế

**Máy tính (từ 768 px):**

| Khối | Nội dung |
|---|---|
| Trên cùng | Chọn chi nhánh (dùng chung `customer_selected_branch_id` với Trang chủ, nên chọn một nơi là cả hai nơi cùng nhớ) · dải ngày bắt đầu từ hôm nay |
| Lưới | Hàng = sân (tên, giá thường / cao điểm); cột = từng giờ trong giờ mở cửa. Ô có 5 trạng thái: **trống**, **cao điểm** (trống nhưng giá cao), **đã kín**, **đã qua**, **bảo trì**. Có chú thích màu |
| Chọn | Chạm ô đầu rồi ô cuối trên **cùng một hàng**; nếu giữa chừng có ô không trống thì ô vừa chạm thành điểm bắt đầu mới và có dòng giải thích. Chạm lại ô đã chọn để bỏ |
| Tóm tắt (dính dưới lưới) | Sân · ngày · khung giờ · số giờ · tạm tính (tách giờ thường / cao điểm) · nút **Đặt sân** |

**Điện thoại (dưới 768 px):** không cuộn ngang. Chọn sân bằng thẻ chuyển (mỗi sân một thẻ), mỗi sân là lưới 4 cột các giờ; thanh tóm tắt dính ngay trên thanh tab dưới của header.

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
| 0 | **Nhánh cũ:** trong worktree `customer-flow-2` gộp `main` vào `fix/customer-booking-flow-round2`, sửa 2 chỗ xung đột ở `HomePage.jsx`. **Chưa gộp vào `main`** | Jest + Vitest toàn bộ xanh; đi lại luồng đặt ở ô Trang chủ (chưa / đã đăng nhập): chặn giờ đã qua và ngoài 05:00–23:00; báo kết quả rồi chờ "merge vào main đi" |
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

**Nhánh cũ `fix/customer-booking-flow-round2`** (worktree `customer-flow-2`): gộp `main` vào, commit `75766e8`. Xung đột đúng 2 chỗ ở `HomePage.jsx` (phần import và hằng số đầu file), xử lý: giữ `SiteHeader` của `main`; giữ `bookingSlots`, `wallClockPassed`, `to12h` của nhánh; bỏ `useCart`, `isStaff`, `homePathForRole`, `SECTION_LINKS` vì chỉ phục vụ khối header cũ đã bị `main` thay. So với `main`, diff của `HomePage.jsx` chỉ còn phần widget và khối số liệu giờ mở cửa. **Chưa gộp vào `main`, chưa đẩy.**

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
