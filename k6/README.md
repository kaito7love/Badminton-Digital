# k6 — Load testing

Kịch bản kiểm thử chịu tải cho Badminton Digital Management API.

Cài k6: <https://grafana.com/docs/k6/latest/set-up/install-k6/> (Windows: `winget install k6`).

## Chạy

Backend phải đang chạy trước (`npm --prefix backend run dev`, hoặc `cd docker && docker compose up`).

```bash
k6 run k6/smoke.js        # ~2 giây  — kiểm tra môi trường, quét mọi nhóm endpoint đọc
k6 run k6/load_test.js    # ~5 phút  — 100 VU, tải trộn theo hành vi thật
k6 run k6/spike_test.js   # ~2 phút  — 200 VU dội đột ngột vào nhóm /public
```

Đổi mục tiêu / mức tải mà không sửa file:

```bash
k6 run --env BASE_URL=https://staging.example.com/api/v1 k6/load_test.js
k6 run --env VUS=50 k6/load_test.js          # hạ mức tải đỉnh (mặc định 100)
k6 run --env BRANCH_ID=2 k6/load_test.js     # đo trên chi nhánh khác
k6 run --env WRITE=1 k6/load_test.js         # bật thêm luồng GHI (xem bên dưới)
```

| Biến `--env` | Mặc định | Ý nghĩa |
|---|---|---|
| `BASE_URL` | `http://localhost:5000/api/v1` | Gốc API |
| `BRANCH_ID` | `1` | Giá trị header `X-Branch-Id` |
| `IDENTIFIER` / `PASSWORD` | `0901111111` / `Admin@123` | Tài khoản đăng nhập (theo seeder) |
| `COURT_IDS` | `1,2,3,4` | Danh sách sân dùng để random hoá request |
| `VUS` | `100` | Mức tải đỉnh của `load_test.js`, chia 40/30/20/10 cho 4 luồng |
| `WRITE` | *(tắt)* | `1` = bật luồng đặt sân + huỷ trong `load_test.js` |

## Ba kịch bản

### `smoke.js`
1 VU, 1 vòng, gọi qua **31 endpoint đọc** thuộc mọi nhóm route. Không đo hiệu năng — chỉ xác minh
môi trường còn sống và mọi nhóm còn trả đúng envelope `{success, data, message, errors}` trước khi
chạy load thật. Ngưỡng: `checks == 100%`, `http_req_failed == 0`. Đủ nhẹ để cắm vào CI.

### `load_test.js`
100 VU trong ~5 phút, chia thành 4 scenario riêng để đọc được p95 của **từng luồng** thay vì một
con số trung bình vô nghĩa:

| Scenario | VU | Mô phỏng |
|---|---|---|
| `public_browse` | 40 | Khách vãng lai duyệt catalog + dò khung giờ trống (không đăng nhập) |
| `staff_courts` | 30 | Nhân viên mở màn hình sơ đồ sân, poll trạng thái |
| `booking_ops` | 20 | Nhân viên tra cứu lịch đặt + kiểm tra khung giờ |
| `reports` | 10 | Quản lý xem dashboard và báo cáo |

Hình dạng tải: lên nửa tải 1 phút → lên đủ tải 1 phút → giữ 2 phút → hạ 1 phút.

**Mặc định chỉ ĐỌC.** Bắn 100 VU vào `POST /bookings` sẽ đẻ rác vào CSDL và làm lệch số liệu báo
cáo. Luồng ghi bật riêng bằng `--env WRITE=1`: 5 VU đặt sân ở ngày cách hiện tại 200+ ngày rồi
**huỷ ngay trong cùng vòng lặp**, và cố tình không gửi `customerName`/`customerPhone` vì gửi vào là
service tự tạo thêm bản ghi `Customer`. Hai counter `bookings_created` / `bookings_cleaned_up`
trong bảng kết quả phải bằng nhau — lệch nghĩa là có booking chưa được dọn.

> Lưu ý: "dọn" ở đây là **huỷ** (`status = cancelled`), đúng ngữ nghĩa của API. Dòng vẫn nằm trong
> bảng `bookings`. Muốn xoá hẳn thì phải xoá tay bằng SQL.

### `spike_test.js`
0 → 200 VU trong 30 giây, giữ 1 phút, rồi rút về 0. Mô phỏng đúng tình huống dồn tải có thật: mở
bán khung giờ đẹp cuối tuần hoặc tung mã giảm giá, hàng trăm người cùng mở trang đặt sân trong vài
chục giây. Chỉ nhắm nhóm `/public` vì đó là mặt tiền hứng đợt dồn đó. Mục tiêu không phải "vẫn
nhanh" mà là **không sập, không đổ lỗi hàng loạt**, nên ngưỡng nới hơn `load_test.js`.

## Hai cái bẫy đã xử lý sẵn

**1. Rate limit ở `/auth/login` — 10 request / 15 phút / IP.**
Nếu để mỗi VU tự đăng nhập thì từ VU thứ 11 trở đi sẽ ăn 429 và toàn bộ số liệu thành rác. Vì vậy
token được lấy **một lần duy nhất** trong `setup()` rồi chia sẻ cho mọi VU. Hệ quả: access token
sống 15 phút nên mọi kịch bản giữ dưới ~10 phút, không cần xử lý refresh giữa chừng.
Nếu vẫn gặp 429 (do chạy lại nhiều lần liên tiếp): khởi động lại backend — limiter lưu trong RAM.

**2. Buffer pool của MySQL còn lạnh làm số đo sai gấp mấy lần.**
Lần chạy đầu sau khi khởi động CSDL, mọi truy vấn phải đọc từ đĩa. Đo được p95 **1.14s** ở lần
chạy thứ hai và **164ms** ở lần thứ năm với **cùng 100 VU**. Luôn chạy một lượt bỏ đi để làm ấm
CSDL rồi mới lấy số, nếu không sẽ kết luận sai là "API chậm".

## Kết quả đo thật — 05/09/2026

Backend (`NODE_ENV=production`, pool 20) + MySQL 8 cùng chạy trên một máy Windows 11.

| Lần | Kịch bản | Tải | p95 | Thông lượng | Lỗi |
|---|---|---|---|---|---|
| #1 | `load_test` | 100 VU, DB vừa khởi động | 677 ms | 115 req/s | 0 |
| #2 | `load_test` | 100 VU | 1.14 s | 95 req/s | 0 |
| #3 | `load_test` | 50 VU | **31 ms** | — | 0 |
| #4 | `spike_test` | 200 VU (chỉ `/public`) | 731 ms | 276 req/s | 0 |
| #5 | `load_test` | 100 VU, DB đã ấm | **164 ms** | 147 req/s | 0 |

**Đọc kết quả:** qua 5 lần chạy với tổng hơn 180.000 request, `http_req_failed` luôn bằng **0** và
tỉ lệ check đúng luôn **100%** — kể cả ở 200 VU. Độ trễ dao động mạnh giữa các lần chạy là do cache
CSDL, không phải do bão hoà. Ngưỡng trong `load_test.js` đặt quanh mức đo ấm (#5) nhân khoảng 5 lần
biên: đủ chặt để bắt hồi quy thật, đủ rộng để không đỏ vì nhiễu máy.
