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
| **Bấm điểm trận của tôi** | `/my-matches/:matchId/score` (điện thoại, cầm dọc) | Như màn hình bấm điểm của nhân viên (mục 1.2), chỉ cho trận mình đang đánh. Trận tính điểm: nút xác nhận đổi thành "Chờ nhân viên xác nhận" | `GET /v1/matches/{id}`, `POST …/live/rallies`, `…/undo`, `…/confirm` (scope `match:score`) |

### 1.2 Nhân viên / quản lý (trong `SidebarLayout`, menu "Thi đấu")

| Màn hình | Đường dẫn | Nội dung | Vai trò |
|---|---|---|---|
| **Người chơi** | `/competition/players` | Danh sách: tên, điểm Đơn / Đôi, nhãn, độ tin cậy, cờ (chưa xác thực / cần xác nhận / chấm nhanh); lọc; mở hồ sơ | Nhân viên |
| **Hồ sơ người chơi (nhân viên)** | modal từ trang Khách hàng hoặc danh sách trên | Điểm, sổ điểm, các bài chấm; nút **Chấm trình** (cùng form, thêm ghi chú + "Chấm nhanh"), **Xác nhận trình**, **Chỉnh điểm** (quản lý, bắt buộc lý do) | Nhân viên / quản lý |
| **Hàng chờ duyệt** | `/competition/reviews` | Bài chấm có cờ "Cần BTC xác nhận", bài chấm AI `pending_review` | Quản lý |
| **Giải đấu — danh sách** | `/competition/tournaments` | Theo trạng thái; nút "Tạo giải" | Nhân viên xem, quản lý tạo |
| **Tạo / sửa giải** | `/competition/tournaments/new` | Wizard 4 bước (06, mục 2): (1) tên, ngày, **giờ bắt đầu**, chi nhánh, cấp giải, điều lệ, **chọn sân của giải**; (2) Đơn / Đôi, giới, cách ghép đôi (**mặc định "cặp đăng ký sẵn"** — 2 người đăng ký chung một đội; tuỳ chọn "bốc thăm ghép cặp cân bằng"), điều kiện trình, tối đa, **"Bốc thăm tại sân"**; (3) thể thức ("theo gợi ý" hoặc chọn), số bảng, đi tiếp, chia bảng, tranh hạng 3, luật điểm (phút / trận tự điền theo luật), tính điểm trình / BXH; (4) xem lại: số đội dự kiến → `POST /v1/tournaments/advice` → thể thức gợi ý, số trận, số lượt trên số sân đã chọn, phút, **giờ xong dự kiến**. Hai nút "Tạo (nháp)" / "Tạo và mở đăng ký" | Quản lý |
| **Chi tiết giải** | `/competition/tournaments/:id` | Đầu trang: **thanh tiến trình + "việc cần làm" + một nút chính**; tab **Sân** · **Đăng ký & điểm danh** · **Lịch & kết quả** · **Bảng đấu & sơ đồ** · **Kết quả chung cuộc**, tự mở đúng tab theo giai đoạn (mục 2) | Theo từng tab |
| **Nhập tỉ số nhanh** | `/competition/score/:matchId` (tối ưu điện thoại) | Hai cột A / B, ô số lớn, báo lỗi luật ngay khi gõ. Ô **Kết quả**: "Đánh hết trận" / "Bỏ cuộc giữa trận — không đánh tiếp được" (nhập các game đã xong + chọn đội thắng) / "W.O. — vắng" (chỉ chọn đội thắng) | Nhân viên |
| **Bấm điểm trực tiếp** | `/competition/live/:matchId` (điện thoại, cầm dọc) | Hai nửa màn hình Đội A / Đội B, chạm để +1 điểm; game đang đánh + các game đã xong; cầu ở đội đang giao + "ô phải / trái"; **Hoàn tác**; chọn đội giao trước (trước điểm đầu); đủ điểm thắng → "Xác nhận kết quả". Dòng trạng thái to "Trận 3 game × 21 · Game 2/3 · Ván 1–0" + các game đã xong; **hết một game** → khung vàng "Hết game 1: 21–18 — sang game 2, đổi sân, chưa nhả sân" (khoá hai nửa tới khi bấm "Tiếp tục"; hoàn tác thì tự tắt); game 3 của trận 3 game có đội chạm 11 → nhắc "Đổi sân" (trận 1 game không đổi sân); **hai nửa đi theo bên sân**: mỗi lần đổi sân (`live.endsSwapped` đổi) hai nửa tự đổi bên, màu đi theo đội, khung vàng báo "[đội] bên trái", chip game và "Ván" xếp theo trái – phải giống hai nửa; nút **"⇆ Đổi bên"** lật thêm trên riêng máy đang bấm (người bấm đứng phía kia sân, hai đội quên đổi…), máy nhớ theo trận (`localStorage`), không gọi API, không ảnh hưởng máy khác và TV; khi đang 1–0 / 1–1 có dòng "Trận chưa xong — chưa nhả sân". Nút **"Không đánh tiếp được…"** (chỉ nhân viên, plan 20): trận giải → chọn đội không đánh tiếp được → `POST …/live/retire` → đội đó thua (giữ game đã xong), màn hình báo "X thắng (đối thủ không đánh tiếp được)"; trận giao lưu → chọn "Xong (không tỉ số)" hoặc "Huỷ trận". Lưu xong (hoặc trận không còn đang đánh) → nút to **"← Về buổi giao lưu" / "← Về giải đấu"** đưa về màn hình buổi / giải của trận (mở từ nút "Bấm điểm" thì đóng tab bấm điểm, quay lại tab cũ — tab đó đã tự cập nhật qua luồng). Mỗi lần bấm gửi `revision` + `Idempotency-Key`; 409 `LIVE_CONFLICT` → tải lại tỉ số, báo "máy khác vừa bấm" (06, mục 1.5) | Nhân viên, người chơi trong trận |
| **Buổi giao lưu** | `/competition/sessions/:id` | Form tạo buổi có ô **"Luật điểm"** (1 game × 21 mặc định · 3 game × 21 · 3 game × 15 · 1 game × 31); nút **"Đổi luật điểm"** giữa buổi (áp cho trận xếp sau, nói rõ trận đang đánh giữ luật cũ); thẻ sân bo3 có nhãn "3 game"; điểm danh (chưa có điểm → chọn nhãn chấm nhanh ngay trong ô điểm danh; 409 `PRESENT_ELSEWHERE` → hỏi "Rời buổi kia rồi điểm danh?" rồi gọi rời buổi kia + điểm danh lại), "Xếp sân trống" (bản xem trước kéo-thả đổi người, cảnh báo cặp đồng đội đã chung đội), mỗi sân đang đánh có nút "Bấm điểm" / "Nhập tỉ số" / "Xong (không tỉ số)" / "Huỷ trận" và tỉ số đang bấm (nếu có), người chờ, "Rời buổi", đóng buổi (xem trước điểm trình trước / sau) | Nhân viên |
| **Màn hình lớn (TV)** | `/competition/sessions/:id/board`, `/competition/tournaments/:id/board` | Chỉ đọc, chữ lớn, tự cập nhật: sân – ai với ai – đã đánh bao lâu (tính theo `serverTime`); **bảng điểm** cho sân có người bấm điểm (mục 4); hàng chờ, tô sáng người ra sân lượt tới; kết quả gần nhất. **Giải** (plan 20): mọi sân của giải (đang đánh: trận nào — bảng / lượt / vòng, bảng điểm; trống: "chờ gọi trận kế tiếp"), **Sắp tới** (`next-matches`, kèm giờ dự kiến), bảng xếp hạng từng bảng, kết quả gần đây (W.O. / bỏ cuộc ghi rõ) | Nhân viên mở trên TV |

## 2. Chi tiết giải — tiến trình, việc cần làm, các tab

Thiết kế theo lần bấm thử như người dùng thật (plan 20 mục 7): bản đầu để mọi thứ trên một trang dài (9 nút ngang hàng,
nhập tỉ số phải cuộn 1 100–1 600 px) và người dùng không biết bước tiếp theo.

```
┌ Giải đôi CLB tối thứ Bảy  [Đã bốc thăm]                                                              ┐
│ Đôi tự do · vòng bảng + loại trực tiếp · cặp đăng ký sẵn · Sân 7, Sân 8 · 18:00 · bốc thăm tại sân   │
│ (✓ Đăng ký)(✓ Điểm danh)(✓ Bốc thăm)[4. Vòng bảng](5. Loại trực tiếp)(6. Chốt)                       │
│ ┌ Vòng bảng: còn 9 trận (2 đang đánh). Gọi trận ra sân ở tab Sân …            [nút chính đúng bước] ┐│
│ [Màn hình TV ↗] [Thêm ▾] [Tải lại]                                                                   │
├ Sân (2/2) │ Đăng ký & điểm danh (14) │ Lịch & kết quả (0/9) │ Bảng đấu & sơ đồ ─────────────────────┤
│ Sân 7 Đang đánh 00:01 · Bảng 1 · lượt 1 …  [Bấm điểm][Nhập tỉ số]                                     │
│ Sân 8 Trống · Gợi ý: Bảng 2 · lượt 2 · 18:15 …  [Gọi trận này ra Sân 8][Chọn trận khác…]              │
│ Kế tiếp: … · Bảng 2 · lượt 1  Hồ Tấn Duy + Tạ Kim Anh vs …  [chờ: Tạ Kim Anh đang ở Sân 4]            │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Đầu trang:**
- **Thanh tiến trình:** Đăng ký → Điểm danh → Bốc thăm → Vòng bảng (hoặc "Thi đấu") → Loại trực tiếp (chỉ thể thức vòng
  bảng + loại trực tiếp) → Chốt. Bước đã qua có ✓, bước hiện tại tô màu.
- **"Việc cần làm"** — một câu + **một nút chính** đúng giai đoạn:

  | Giai đoạn | Câu | Nút chính |
  |---|---|---|
  | Nháp | Mở đăng ký để nhận đăng ký | Mở đăng ký |
  | Mở, chưa đủ người | Đăng ký các cặp — đang có n cặp | (mở tab Đăng ký) |
  | Mở, bốc thăm tại sân | Điểm danh khi mọi người đến (k / n), rồi bốc thăm — ai chưa đến sang danh sách chờ | Bốc thăm… |
  | Mở, bốc thăm trước | Đủ người thì bốc thăm | Bốc thăm… |
  | Đang đánh | Còn x trận (y đang đánh). Gọi trận ra sân ở tab Sân | (mở tab Sân) |
  | Vòng bảng xong | Xem và khoá sơ đồ loại trực tiếp | Sơ đồ loại trực tiếp… |
  | Mọi trận xong | Xem trước rồi chốt giải | Chốt giải… |
  | Đã chốt | Thứ hạng, điểm trình, BXH đã cập nhật | Xem kết quả |

- Nút ít dùng gom vào **"Thêm ▾"**: bốc thăm lại / mở lại đăng ký (khi chưa có kết quả), xử W.O. đội vắng, thêm trận
  tay, xem trước khi chốt, sân của giải, huỷ chốt, huỷ giải. Ngoài ra chỉ còn "Màn hình TV" và "Tải lại".
- Tự mở đúng tab: đang nhận đăng ký → **Đăng ký**; ngày thi đấu → **Sân**; đã chốt → **Kết quả chung cuộc**. Tab đang
  mở được giữ khi trang tự cập nhật.

| Tab | Có gì | Bấm được gì |
|---|---|---|
| **Sân** | Mỗi sân của giải: **đang đánh** → trận nào + bảng điểm (đổi theo luồng SSE); **trống** → trận gợi ý (`next-matches`, không trùng người giữa các sân; "vừa đánh x phút trước" nếu chưa nghỉ đủ); **bận việc khác** (buổi / giải khác đang dùng) → không nhận gợi ý. Không có trận gọi được → nói rõ "X đang ở Sân Y". Khối **Kế tiếp**: các trận tiếp theo + trận đang chờ người | **"Gọi trận này ra Sân n"** — gọi **đúng trận đang hiện** (`POST /v1/matches/{id}/call`, không dùng `call-next` vì có thể ra trận khác với trận người dùng thấy), "Chọn trận khác…" (danh sách lấy mới lúc mở), Bấm điểm, Nhập tỉ số |
| **Đăng ký & điểm danh** | Mở đăng ký: ô **gõ tìm tên** (không cần dấu: gõ "nguyen" ra "Nguyễn"; Enter chọn dòng đầu) cho người + đồng đội; người đang ở buổi giao lưu / đang đánh giải khác ghi **"⚠ đang đánh Sân 3 (giao lưu)"** và xếp cuối. Danh sách theo cặp, trình, danh sách chờ (hết chỗ / lẻ người / vắng lúc bốc). **Điểm danh = ô tích ☐ / ☑ trên tên từng người**, đếm "đã đến k / n", lọc "chỉ hiện cặp chưa đến đủ" | Đăng ký (xong thì con trỏ về ô tìm để gõ cặp sau), chưa có điểm → chọn nhãn chấm nhanh rồi đăng ký, **"☑ cả cặp"** (một chạm cho hai người), đổi đồng đội (trước bốc thăm), rút |
| **Lịch & kết quả** | Lọc **Sắp tới / Đang đánh / Đã xong / Tất cả** (kèm số trận). Mỗi trận một hàng: lượt + giờ dự kiến + bảng / vòng · hai đội · trạng thái rõ nghĩa ("chưa đánh", "chờ đội thắng trận trước", "chờ: X đang ở Sân 3", "đang đánh · Sân 5" + tỉ số đang bấm, "21–13", "W.O.", "bỏ cuộc") | Gọi ra sân… (chọn sân trống của giải; trận đang bị chặn thì báo lý do), Bấm điểm, Nhập tỉ số / Sửa (ô nhập mở ngay dưới hàng, kể cả W.O., bỏ cuộc giữa trận) |
| **Bảng đấu & sơ đồ** | Bảng xếp hạng từng bảng; sơ đồ loại trực tiếp (người thắng tự đi tiếp). Khoá sơ đồ từ "việc cần làm": xem trước (nhất / nhì bảng mấy), bấm hai ô để đổi (cảnh báo **"cùng bảng"**) | — |
| **Kết quả chung cuộc** | Thứ hạng chung cuộc (sau khi chốt). Bản xem trước khi chốt: thứ hạng, **điểm trình trước → sau**, **điểm thành tích** | Chốt (từ "việc cần làm"), huỷ chốt ("Thêm ▾") |

**Bốc thăm** là hộp xem trước mở từ nút chính (không phải tab): đội + bảng (hoặc sơ đồ vòng 1, ô miễn đấu) + lịch theo
lượt kèm giờ + thống kê cân bằng + người vắng (bốc thăm tại sân); giải đơn / đôi cặp sẵn bấm hai **đội** để đổi chỗ (không
tách cặp), bốc thăm ghép cặp đổi người / ⇄ đổi cả đội; "Bốc lại", "Xác nhận bốc thăm" → mở tab Sân.

**Tạo giải:** ô chọn sân ghi sân nào đang được buổi giao lưu / giải đang đánh dùng ("đang dùng"), sân giải chưa bốc thăm
cũng chọn ("giải khác cũng chọn"); chỉ chọn sẵn sân không đang dùng; chọn sân đang dùng thì phần "Xem lại" cảnh báo.

**Điện thoại** (390 px): thanh trên không dính, ẩn dòng scope / nút phụ; chọn giải bằng **ô chọn** thay cột trái; thông tin
giải rút gọn; mỗi trận trong lịch xếp dọc; không tràn ngang. Nút "Gọi trận này" ở ngay màn hình đầu.

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
- **Không làm mất thao tác dở** (plan 20 mục 7): đang gõ / chọn trong một form, đang mở ô nhập tỉ số hoặc hộp thoại mà
  máy khác cập nhật (`board`) → **không tự tải lại** (bản đầu tải lại ngay → ô điểm danh giao lưu mất người đang chọn).
  Hiện dải **"Có cập nhật mới — Tải lại"**, thao tác xong (gửi form / đóng hộp) thì tự tải.
- **Lỗi nói bằng câu dễ hiểu**, mã lỗi để nhỏ phía sau; lỗi do máy khác vừa đổi thì nói rõ và tải lại, vd "Trận này vừa
  được gọi hoặc vừa có kết quả ở máy khác" thay cho "409 INVALID_STATE".
- **Mã sân → tên sân** (`bd:court:5` → "Sân 5") ở mọi thông báo của service (service chỉ biết mã).
- **Tự cập nhật** (plan 19):
  - màn hình TV, lịch, bảng đấu, màn hình bấm điểm mở luồng SSE của service qua gateway (`…/sessions/{id}/stream`,
    `…/tournaments/{id}/stream`, 02 mục 2.9);
  - `score` → đổi số của sân đó ngay; `board` → tải lại dữ liệu; luồng đóng khi token hết hạn → EventSource tự nối
    lại;
  - **gặp lỗi HTTP (502 / 503 lúc service khởi động lại, deploy) thì EventSource bỏ hẳn, không tự nối lại** → client
    phải tự tạo lại, lùi dần 2 → 30 giây (như `realtimeClient` của app chính). Mỗi lần nối lại thì tải lại màn hình,
    vì trong lúc mất kết nối có thể đã lỡ `board` (bàn thử bắt được lỗi này khi service khởi động lại);
  - mất luồng thì poll 10 giây.
  - Tỉ số từng điểm **không** đi qua outbox / SSE của app chính (outbox gửi 5 giây một lần). App chính vẫn nhận
    `competition.match.completed` để ghi nhật ký.

## 4. Bảng điểm trên màn hình TV (plan 19)

Chủ dự án chọn bố cục này sau khi bấm thử (02/10/2026). Bản đầu đặt "7–0" to ở giữa hai tên đội, khó theo dõi, nhất là
khi đánh 3 game.

```
 Sân 1                                  02:34
                          Game 1  Game 2  ┌Game 3┐
 Đặng Văn Hùng              21      9     │  12  │
 Hoàng Thảo Vy                            └──────┘
 Đỗ Minh Thư                18     21   🏸┌──────┐
 Châu Mỹ Linh                             │  11  │
                                          └──────┘
                        Ván 1–1 · Game 3/3 · giao ô trái
```

- **Mỗi đội một hàng, điểm nằm bên phải tên đội.** Mỗi người một dòng; tên dài thì xuống dòng theo từ, không cắt tên.
- **Mỗi game một cột.** Đánh nhiều game (bo3, bo5) thì có hàng tiêu đề "Game 1 · Game 2 · Game 3".
- **Game đang đánh** là ô to có khung.
- **Game đã xong:** số của đội thắng game đó sáng và đậm, đội thua mờ — nhìn là biết ai thắng game nào.
- 🏸 cạnh điểm của đội đang giao.
- **Dòng dưới:**
  - tỉ số ván (`Ván 1–1`, chỉ khi đánh nhiều game);
  - game đang đánh / tổng số game;
  - ô giao (phải / trái).
- **Đủ điểm thắng trận:** đội thắng tô xanh, dòng dưới ghi "Xong trận — chờ xác nhận".
- **Đánh 1 game:** không có hàng tiêu đề, chỉ còn ô điểm bên phải mỗi đội.
- **Trận nhiều game:** nhãn "3 game" cạnh tên sân (cả khi chưa ai bấm điểm).
- **Thẻ sân ở màn hình nhân viên:** dùng cùng bố cục, chữ nhỏ hơn, nhãn cột viết tắt "G1 · G2 · G3".
