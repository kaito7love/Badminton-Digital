# Kế hoạch 39 — Kiểm thử flow Đặt sân từ website, đủ bốn góc nhìn

**Ngày:** 2026-10-16 · **Nhánh:** `test/flow-dat-san` (tách từ `test/ke-hoach-kiem-thu-bao-mat`, commit `3c1b625`)
**Trạng thái:** CHỜ DUYỆT. Chưa chạy test nào, chưa sửa dòng code nào.
**Yêu cầu của bạn:** "test thêm 1 flow booking từ website vì đó là flow chính của dự án, test hết từ mọi góc nhìn: customer, staff,
manager, admin."

## 1. Phạm vi

**Flow cần kiểm** — vòng đời một lượt đặt sân, từ lúc khách thấy lưới giờ trên website tới lúc tiền vào báo cáo:

```
Khách xem lưới (/dat-san) → chọn khung giờ → (đăng nhập/đăng ký nếu chưa) → xác nhận → booking `pending`
   → nhân viên thấy, xác nhận (`confirmed`) hoặc sửa giờ/sân → khách thấy trạng thái ở "Lịch của tôi"
   → đến sân: nhân viên mở sân từ booking → chơi → checkout (hoá đơn + thanh toán) → booking `completed`
   → quản lý/admin thấy trong báo cáo, nhật ký hoạt động, hoá đơn
   Nhánh phụ: khách/nhân viên huỷ · khung giờ trùng · quá hạn · ngoài giờ · chi nhánh khác
```

**Bốn góc nhìn (vai trò):**

| Góc nhìn | Tài khoản dùng | Câu hỏi chính |
|---|---|---|
| Khách vãng lai | chưa đăng nhập | xem được gì, bị chặn ở đâu, quay lại sau đăng nhập có mất lựa chọn không |
| Khách (`customer`) | khách demo + khách tự đăng ký mới | đặt/huỷ đúng, chỉ thấy booking của mình, không phá được người khác |
| Nhân viên (`employee`) | CN chính / CN Quận 3 | vận hành trong chi nhánh mình, đặt hộ khách vãng lai, xác nhận, sửa, mở sân, checkout |
| Quản lý chi nhánh (`branch_manager`) | QL Quận 3 / Quận 7 | như nhân viên + báo cáo, huỷ hoá đơn, nhật ký; không vượt chi nhánh |
| Admin (`admin`) | admin | toàn chuỗi, đổi chi nhánh, báo cáo so sánh, nhật ký |

Kiểm cả **đúng nghiệp vụ** (flow có chạy trơn tru không) lẫn **bảo mật** (người không có quyền làm được gì) — vì đây là flow chính.

## 2. Ma trận kiểm thử (~120 ca, gom theo góc nhìn)

### 2.1 Khách vãng lai (≈ 12 ca)
- Lưới `/dat-san` và `GET /public/availability[/day]` hiển thị đúng trạng thái `free/booked/passed/maintenance`, **không lộ** thông tin khách.
- Chọn slot → bị yêu cầu đăng nhập; lựa chọn lưu ở `sessionStorage` (`pending_booking_datsan`) và **khôi phục đúng chi nhánh/ngày/sân/giờ** sau đăng nhập và
  sau **đăng ký mới** giữa chừng; slot bị người khác lấy trong lúc đó → thông báo đúng, không đặt nhầm.
- Gọi thẳng `POST /bookings` không token → 401; token rác/hết hạn → 401.
- Ngày/chi nhánh lạ trên URL, `?date=` tương lai xa/quá khứ, tham số sai kiểu → không 500.

### 2.2 Khách `customer` (≈ 40 ca)
- **Đặt:** 1 / 2 / 3 giờ hợp lệ; 3 giờ + 1 phút, 4–6 giờ bị chặn (R15); ranh giới 14 ngày (ngày 13 được, ngày 14 bị chặn); khung đã kết thúc / đang diễn ra;
  ngoài 05:00–23:00; `startTime >= endTime`; sân bảo trì/không tồn tại/chi nhánh khác; **đặt trùng** (cùng khung, chồng một phần, sát nhau 17:00–18:00 + 18:00–19:00 hợp lệ).
- **Giữ chỗ:** một khách có thể giữ **bao nhiêu** booking `pending` cùng lúc? Có tự hết hạn không? (nguy cơ giữ chỗ hàng loạt làm kín lưới.)
- **Tranh chấp:** bấm 2 lần liên tiếp; 2 tab cùng khung; 2 khách cùng khung đồng thời; đặt + huỷ đồng thời.
- **Xem:** "Lịch của tôi" chỉ có booking của mình, lọc/sắp xếp đúng; xem `GET /bookings/:id` của người khác → 403; danh sách không lẫn.
- **Huỷ:** huỷ `pending`/`confirmed` được; huỷ lần hai, huỷ của người khác, huỷ booking đã `completed`/`cancelled`; huỷ sát giờ/đã bắt đầu (**có chính sách gì không?**).
- **Sửa:** `PUT /bookings/:id` bằng khách → 403 (chỉ nhân viên).
- **Phiên giữa flow:** token hết hạn lúc đang xác nhận (refresh tự động, không mất lựa chọn); đăng xuất ở tab khác; đổi mật khẩu ở thiết bị khác (R1/R4).
- **Giao diện:** laptop 1366×768 và điện thoại 390×844; thanh tóm tắt dưới, hộp thoại xác nhận (focus trap, Esc, Tab); thông điệp lỗi tiếng Việt đúng cho 400/409/401/429.

### 2.3 Nhân viên `employee` (≈ 25 ca)
- Thấy booking của **chi nhánh mình** (lọc theo ngày/sân/trạng thái); không thấy chi nhánh khác (list + id trực tiếp + `X-Branch-Id` lạ).
- **Đặt hộ khách vãng lai:** nhập tên + SĐT; **SĐT trùng khách đã có tài khoản** → booking gắn vào ai? có đổi tên/hồ sơ của khách đó không? (kiểm toàn vẹn dữ liệu);
  không giới hạn 14 ngày/3 giờ; SĐT sai định dạng.
- **Xác nhận** (`pending → confirmed`): lần hai, trạng thái khác, chi nhánh khác.
- **Sửa** giờ/sân: trùng với booking khác, về quá khứ, sang sân bảo trì, chỉ đúng 4 trường được phép (đã kiểm ở bảo mật), booking đã `completed`.
- **Huỷ hộ khách**, ghi nhật ký đúng người làm.
- **Mở sân từ booking → chơi → chuyển sân → checkout**: booking chuyển `completed`; hoá đơn/thanh toán/tồn kho đúng; mở sân từ booking của chi nhánh khác/đã huỷ bị chặn.
- Nhân viên **không** thấy được: báo cáo, nhân viên, cài đặt, nhật ký toàn hệ thống (đã kiểm bảo mật — kiểm lại bằng giao diện).

### 2.4 Quản lý chi nhánh `branch_manager` (≈ 15 ca)
- Mọi thao tác của nhân viên trong chi nhánh mình; **không** vượt sang chi nhánh khác (đặc biệt `X-Branch-Id`).
- Báo cáo doanh thu/đặt sân của chi nhánh khớp số booking/hoá đơn vừa tạo; xuất Excel không lẫn chi nhánh khác.
- Huỷ hoá đơn (void) của booking đã checkout: booking/tồn kho/doanh thu sau void.
- Nhật ký hoạt động ghi đủ `booking.created/confirmed/updated/cancelled`, người thực hiện, `requestId`; **không** chứa mật khẩu/token.

### 2.5 Admin (≈ 12 ca)
- Đổi chi nhánh (UI + `X-Branch-Id`): booking/lưới/báo cáo đổi theo; tạo booking khi **chưa chọn** chi nhánh hành xử thế nào.
- Báo cáo so sánh chi nhánh khớp tổng các chi nhánh; nhật ký toàn chuỗi.
- Admin huỷ/xác nhận booking của bất kỳ chi nhánh; so với quản lý bị chặn.

### 2.6 Luồng xuyên vai trò — "đường vàng" (≈ 8 kịch bản, chạy trên trình duyệt thật)
1. Khách mới đăng ký → đặt → nhân viên xác nhận → khách thấy `confirmed` → mở sân → checkout → khách thấy `completed`/lịch sử → quản lý thấy doanh thu → admin thấy trong báo cáo chuỗi.
2. Khách đặt rồi huỷ → ô lưới trống lại ngay cho người khác (trang công khai) → nhân viên thấy `cancelled`.
3. Nhân viên đặt hộ khách vãng lai → khách đăng ký sau bằng cùng SĐT → lịch sử gộp đúng (`merge-into-account`), không lộ booking của người khác.
4. Hai khách tranh một khung giờ cuối cùng; một thắng, một thấy thông báo và lưới tự làm mới.
5. Nhân viên sửa giờ booking khi khách đang xem "Lịch của tôi" (làm mới/SSE).
6. Booking `pending` quá lâu không ai xác nhận (hành vi hiện tại là gì).
7. Khách đặt khung 22:00–23:00 sát giờ đóng cửa → checkout sau nửa đêm: ngày/múi giờ chi nhánh đúng.
8. Đổi chi nhánh giữa flow (khách chọn CN khác trên `/dat-san`; admin đổi CN).

### 2.7 Kiểm chéo (≈ 10 ca)
- **Nhất quán** lưới công khai ↔ `GET /bookings/availability` ↔ kết quả `POST /bookings` (cùng một câu trả lời cho cùng một khung).
- **Realtime:** nội dung sự kiện SSE khi có booking mới/huỷ — không chứa tên/SĐT khách; client chưa đăng nhập không nghe được kênh nội bộ.
- **XSS/hiển thị:** tên khách có `<script>`/HTML/ký tự dài/emoji ở booking → hiển thị an toàn ở giao diện nhân viên, bảng điều khiển, bảng TV, xuất Excel/PDF.
- **Lạm dụng:** tốc độ đặt/huỷ liên tục (có giới hạn tần suất cho `POST /bookings` không), giữ chỗ hàng loạt, vòng đặt–huỷ.
- **Mất kết nối:** server lỗi/đứt mạng giữa lúc xác nhận → giao diện không treo, không tạo booking trùng khi thử lại.

## 3. Cách làm

1. **Môi trường riêng, không đụng DB/server dev của bạn:** worktree riêng tại nhánh test (`npm ci`), DB tạm `bd_sectest_flow` (migrate + seed,
   gồm migration phiên mới), backend tạm bản production-mode + bản build frontend; **không** dùng Docker; **không** chạm bản live Render.
2. **Ba tầng:** (a) API/DB bằng script (có đối chiếu bản ghi, nhật ký, hoá đơn); (b) **Chrome headless thật** — bấm, gõ, chụp màn hình — ở 1366×768 và 390×844
   cho các luồng khách và nhân viên/quản lý/admin; (c) đua song song bằng nhiều request cùng lúc.
3. **Dữ liệu thử** tạo bằng chính API/giao diện thật, dọn sạch sau khi xong.
4. **Phân loại kết quả:** ✅ đúng · 🐞 lỗi nghiệp vụ · 🔒 lỗi bảo mật · 🎨 lỗi giao diện/trải nghiệm · ❓ hành vi chưa có quy định (cần bạn quyết).

## 4. Sản phẩm bàn giao

- **Một file báo cáo duy nhất** `40-ket-qua-kiem-thu-flow-dat-san.md` (đúng ý bạn "gôm hết vô 1 file"): tóm tắt một trang, kết quả từng ca theo bốn góc nhìn,
  ảnh chụp màn hình các luồng chính (lưu trong `docs/.../40-anh/`), danh sách phát hiện kèm mức độ, cách tái hiện và đề xuất sửa.
- **Test hồi quy** các ca đáng giữ thêm vào `backend/tests-security/` (và Vitest nếu là logic giao diện) — chỉ khi bạn đồng ý (Q4).
- **Không sửa code ứng dụng** trong lần này: lỗi tìm được chỉ ghi vào báo cáo; bạn chọn cái nào sửa thì mình lập kế hoạch riêng.

## 5. Rủi ro và giới hạn

| Rủi ro | Cách xử lý |
|---|---|
| Kiểm trên DB tạm có thể khác dữ liệu thật (mật độ booking, nhiều chi nhánh) | Seed đủ 3 chi nhánh + dữ liệu mẫu như bản demo; ghi rõ khác biệt |
| Headless Chrome không thay được điện thoại thật/Safari | Ghi vào "chưa kiểm"; đề xuất bạn thử tay vài luồng ở §2.6 trên điện thoại |
| Đua song song làm bẩn dữ liệu tạm | Mỗi kịch bản dùng sân/ngày riêng, DB bỏ đi sau khi xong |
| Phát hiện lỗi cần quyết định nghiệp vụ (chính sách huỷ, hết hạn giữ chỗ) | Gắn ❓ và gom thành danh sách câu hỏi cuối báo cáo; **không tự quyết** |

## 6. Câu hỏi cần bạn trả lời trước khi chạy

Chưa trả lời thì chưa làm; mặc định bên cạnh chỉ là đề xuất.

- **Q1.** Kiểm **cả nghiệp vụ lẫn bảo mật** như §1 (đề xuất) — hay chỉ phần bảo mật?
- **Q2.** Dùng **DB tạm + server tạm riêng** trên máy này, Chrome headless, dữ liệu thử dọn sau khi xong (đề xuất) — đồng ý?
- **Q3.** Lỗi tìm được **chỉ ghi vào báo cáo, không tự sửa** (đề xuất) — đồng ý?
- **Q4.** Có thêm các ca đáng giữ vào `backend/tests-security/` làm test hồi quy không? (đề xuất: có)
- **Q5.** Báo cáo kết quả là **một file** `40-ket-qua-kiem-thu-flow-dat-san.md` kèm thư mục ảnh chụp (đề xuất) — đồng ý?
- **Q6.** Có chấp nhận mình **chỉ đọc** bản live Render (không đặt sân thật trên đó) — đúng chứ? (đề xuất: không đụng bản live)
