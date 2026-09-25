# competition-service — Giao diện (nằm ở frontend app chính)

> Service không có giao diện riêng. Các màn hình dưới đây nằm trong `frontend/src/features/competition/` của app
> chính, gọi API qua gateway `/api/v1/competition/*`. Chúng được làm ở **bước tích hợp** (plan 18, bước 4), nhưng
> chốt từ bây giờ để API ở các bước 1–3 phục vụ đúng các màn hình này.
>
> Toàn bộ thư mục tính năng tháo ra được. App chính chỉ thêm vài dòng: route, menu, một nút ở trang Khách hàng.
> Service tắt → menu ẩn.

## 1. Danh sách màn hình

### 1.1 Khách hàng (đã đăng nhập)

| Màn hình | Đường dẫn | Nội dung | API chính |
|---|---|---|---|
| **Trình độ của tôi** | `/my-rating` | Chưa chấm: nút "Chấm trình ngay". Đã chấm: hai thẻ điểm Đơn / Đôi (điểm, nhãn, độ tin cậy, cờ), biểu đồ điểm theo thời gian, nút "Chấm lại" (khi còn được) | `GET /v1/me`, `GET …/rating-history` |
| **Form tự chấm** | `/my-rating/assess` | Wizard 7 bước (03, mục 2.4) | `GET /v1/rubrics/current`, `POST /v1/assessments/preview`, `POST /v1/me/assessments` |
| **Hồ sơ thi đấu của tôi** | `/my-rating/profile` | Tên thi đấu, quyền riêng tư, chi nhánh thường chơi, lối chơi; thống kê, thành tích, đồng đội hay đánh, trận gần đây | `GET/PATCH /v1/me`, `GET …/stats`, `…/matches`, `…/partners` |
| **Bảng xếp hạng** | `/rankings` | Hai tab: *Trình độ* / *Thành tích*. Lọc theo hạng mục, chi nhánh, nhóm tuổi. Tự đánh dấu dòng của mình; chưa đủ điều kiện thì hiện "vị trí dự kiến" | `GET /v1/leaderboards/rating`, `…/points` |
| **Hồ sơ người khác** | `/players/:id` | Như hồ sơ của tôi, rút gọn theo quyền riêng tư; nút "Đối đầu với tôi" | `GET /v1/players/{id}/public`, `…/head-to-head/{other}` |
| **Giải của tôi** | `/my-tournaments` | Giải đang đánh / đã đánh; lịch trận của mình (lượt, sân); kết quả; bảng đấu | `GET /v1/me/tournaments` |

### 1.2 Nhân viên / quản lý (trong `SidebarLayout`, menu "Thi đấu")

| Màn hình | Đường dẫn | Nội dung | Vai trò |
|---|---|---|---|
| **Người chơi** | `/competition/players` | Danh sách: tên, điểm Đơn / Đôi, nhãn, độ tin cậy, cờ (chưa xác thực / cần xác nhận / chấm nhanh); lọc; mở hồ sơ | Nhân viên |
| **Hồ sơ người chơi (nhân viên)** | modal từ trang Khách hàng hoặc danh sách trên | Điểm, sổ điểm, các bài chấm; nút **Chấm trình** (cùng form, thêm ghi chú + "Chấm nhanh"), **Xác nhận trình**, **Chỉnh điểm** (quản lý, bắt buộc lý do) | Nhân viên / quản lý |
| **Hàng chờ duyệt** | `/competition/reviews` | Bài chấm có cờ "Cần BTC xác nhận", bài chấm AI `pending_review` | Quản lý |
| **Giải đấu — danh sách** | `/competition/tournaments` | Theo trạng thái; nút "Tạo giải" | Nhân viên xem, quản lý tạo |
| **Tạo / sửa giải** | `/competition/tournaments/new` | Wizard 4 bước (06, mục 2) có ước tính số trận / thời gian | Quản lý |
| **Chi tiết giải** | `/competition/tournaments/:id` | Tab: **Tổng quan** · **Đăng ký** · **Bốc thăm** · **Lịch & kết quả** · **Bảng đấu** · **Sơ đồ** · **Chốt giải** (mục 2) | Theo từng tab |
| **Nhập tỉ số nhanh** | `/competition/score/:matchId` (tối ưu điện thoại) | Hai cột A / B, ô số lớn, báo lỗi luật ngay khi gõ, nút W.O. / Bỏ cuộc | Nhân viên |
| **Buổi giao lưu** | `/competition/sessions/:id` | Điểm danh, "Xếp sân trống", sân đang đánh, người chờ, nhập tỉ số, đóng buổi | Nhân viên |
| **Màn hình lớn (TV)** | `/competition/sessions/:id/board`, `/competition/tournaments/:id/board` | Chỉ đọc, chữ lớn, tự cập nhật: sân – ai với ai; lượt tiếp theo; bảng đấu | Nhân viên mở trên TV |

## 2. Chi tiết giải — các tab

```
┌ Giải "Đôi nam nữ ghép cặp — trình ≤ 4.0"   [open]   25/10 · CN Quận 1 · 4 sân ───────────────────────┐
│ Tổng quan │ Đăng ký (25) │ Bốc thăm │ Lịch & kết quả │ Bảng đấu │ Sơ đồ │ Chốt giải                   │
├───────────┴──────────────┴──────────┴────────────────┴──────────┴───────┴─────────────────────────────┤
│ Bốc thăm                                                seed a91f03c2   [Bốc lại]  [Xác nhận bốc thăm]│
│ Độ lệch điểm các đội: 0.03   (bốc thuần tuý trung bình: 0.41)                                        │
│ Bảng A                    Bảng B                    Bảng C                                           │
│  3.45  Tuấn + Mai    ⇄     3.42  Hùng + Lan          3.44  Nam + Thảo                                │
│  3.41  Long + Hà     ⇄     3.40  Duy + Vy            3.39  Phúc + Trang                              │
│  …                                                                                                   │
│ Danh sách chờ: Khoa (đăng ký sau cùng, lệch nam–nữ)                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Tab | Có gì | Bấm được gì |
|---|---|---|
| Tổng quan | Thông tin, điều lệ, tiến độ (x / y trận), ước tính giờ xong | Mở đăng ký, huỷ giải |
| Đăng ký | Danh sách người / cặp, điểm, cờ, danh sách chờ | Thêm (tìm khách hàng), "Chấm trình ngay", rút |
| Bốc thăm | Xem trước đội + bảng + lịch, thống kê cân bằng | Bốc lại, kéo đổi người / đội, xác nhận, reopen |
| Lịch & kết quả | Trận theo lượt, sân, trạng thái | Gọi ra sân, nhập tỉ số, thêm trận tay |
| Bảng đấu | Bảng xếp hạng từng bảng (tự cập nhật) | — |
| Sơ đồ | Sơ đồ loại trực tiếp, người thắng tự đi tiếp | Xem trước / đổi ô / khoá sơ đồ |
| Chốt giải | Thứ hạng chung cuộc, **điểm trình trước → sau**, **điểm thành tích** từng người | Chốt, huỷ chốt |

## 3. Nguyên tắc chung

- **Điện thoại trước:**
  - nhập tỉ số, điểm danh, xếp sân được thiết kế cho điện thoại (nhân viên đứng ở sân);
  - form tự chấm: mỗi mô tả là một thẻ bấm lớn.
- **Dark mode mặc định** như app chính (class `dark` trên `<html>`), dùng lại component sẵn có.
- **Luôn giải thích con số:**
  - điểm bị trần thì nói lý do;
  - điểm đổi sau giải thì có "chi tiết từng trận" (E, K, kết quả);
  - bốc thăm thì hiện độ cân bằng so với bốc thuần tuý.
- **Bấm một lần:** mọi nút ghi dữ liệu khoá khi đang gửi và gửi kèm `Idempotency-Key` (bài học FE-01 / FE-02 của
  nhóm sửa 5).
- **Tự cập nhật:** lịch, bảng đấu, màn hình TV nghe sự kiện qua SSE sẵn có của app chính. App chính chuyển tiếp
  `competition.match.completed`. Chưa có thì poll 10 giây.
