# Kế hoạch: job "Demo reset" mất ~19 phút — đo nguyên nhân, nới giới hạn thời gian, sửa tài liệu

- **Ngày:** 06/10/2026.
- **Trạng thái:** chủ dự án duyệt phương án **A** ("code đi, làm phương án A", 06/10/2026) → **đã làm xong, kết quả ở mục 7; đã merge vào `main` 06/10/2026** (fast-forward `4c36f19` → `81c0c34`, chưa push).
- **Nhánh:** `fix/demo-reset-slow-and-timeout`, tách từ `main` @ `4c36f19`.
- **Phạm vi (phương án A, đề xuất):** `.github/workflows/demo-reset.yml` (một dòng), tài liệu. Không đổi code ứng dụng,
  không migration, không đổi API.

## 0. Bối cảnh

Lần đầu bật thi đấu trên bản demo thật (06/10/2026), **Demo reset #14** (đã có secret `COMPETITION_DB_NAME`) chạy
**18 phút 39 giây**: bước "Xoá bảng → migrate → seed" của DB chính ~3 phút (như #10, #11), bước "Thi đấu — xoá bảng →
migrate → seed" ~15,5 phút. Tài liệu (`DeploymentGuide.md` mục 4.2) ghi "thêm ~30 giây". Trong lúc bước thi đấu chạy, API thi
đấu của bản demo trả 503 (schema đang bị xoá rồi dựng lại).

Lúc đầu nghi **khoá metadata của MySQL** (service thi đấu đang sống giữ khoá, `DROP TABLE` phải chờ). Giả thuyết đó **sai**
— xem số đo.

## 1. Số đo (máy dev, MySQL 9.5 cục bộ, DB tạm `cs_reset_probe`, đã xoá sau khi đo)

`node scripts/demo-reset.js` của competition-service, đo số câu lệnh server nhận (`SHOW GLOBAL STATUS LIKE 'Questions'`
trước/sau):

| Pha | Thời gian (không có độ trễ mạng) |
|---|---|
| Xoá bảng | 2,0 s |
| Migrate (10 migration) | 40,1 s |
| Seed (39 người chơi, 3 giải, 2 buổi giao lưu, trận, sổ điểm…) | 85,2 s |
| **Tổng** | **127,3 s, ≈ 5.408 câu lệnh MySQL nối tiếp nhau** |

Trên GitHub Actions, runner nối tới Aiven (Singapore) qua Internet: bước thi đấu ~930 s. (930 − ~100 s xử lý) ÷ 5.408 ≈
**0,15 s mỗi câu lệnh** — đúng cỡ độ trễ một vòng đi–về từ runner (Mỹ/Âu) tới Singapore. Vậy thời gian là **độ trễ mạng
nhân với số câu lệnh**, không phải khoá treo. DB chính tương tự (42 migration + 7 seeder → ~3 phút).

## 2. Đính chính + rủi ro thật

- Mình (Claude) từng nói job "không đặt giới hạn thời gian, mặc định 6 giờ": **sai**. `demo-reset.yml` đã có
  `timeout-minutes: 30`.
- Rủi ro thật là **biên độ hẹp**: 18 m 39 s trên 30 phút. Độ trễ mạng tăng ~50 % (≈ 0,22 s/câu) thì tổng ≈ 28–30 phút và
  job bị GitHub **huỷ giữa chừng** — DB thi đấu nằm nửa vời (thiếu bảng hoặc chưa seed) tới đêm sau, API thi đấu của demo lỗi.
- Phụ: mỗi lần chạy tay (như hôm nay) mất ~19 phút và API thi đấu lỗi gần 15 phút trong đó. Với job 03:00 sáng thì không ai
  thấy.

## 3. Phương án

| | Làm gì | Hiệu quả | Giá |
|---|---|---|---|
| **A (đề xuất)** | `timeout-minutes: 30` → `60`; sửa tài liệu ("~30 giây" → số đo thật + lý do); ghi vào tài liệu độ dài dự kiến | Hết nguy cơ bị huỷ giữa chừng (biên 41 phút). Vẫn ~19 phút mỗi lần | 1 dòng + tài liệu, rủi ro gần 0 |
| B | A + chạy hai bước reset song song (seed thi đấu không đọc DB chính, chỉ dùng số `bd:customer:<id>` cố định) | ~19 → ~16 phút | Phải kiểm kỹ seed không đọc DB chính; lợi ít |
| C | A + dựng DB thi đấu **trong runner** (service container `mysql:8.4`, như job CI), seed ở đó (~1 phút, không có độ trễ), rồi `mysqldump` → nạp vào Aiven (vài trăm câu lệnh thay vì 5.400) | ~19 → ~5 phút; cửa sổ API thi đấu lỗi ~15 phút → ~1 phút; độ dài không còn phụ thuộc mạng | Sửa lớn hơn: thêm bước cài/chạy `mysqldump`, TLS tới Aiven, tương thích collation/phiên bản; không thử được với Aiven thật (không có mật khẩu), chỉ thử cục bộ |

**Đề xuất: A.** Việc chạy ~19 phút lúc 03:00 sáng không ảnh hưởng ai, còn rủi ro hủy giữa chừng được A xử lý bằng một dòng.
C chỉ đáng làm nếu chủ dự án hay chạy tay giữa ngày và muốn nhanh; làm riêng một plan sau.

## 4. Thay đổi (phương án A)

- `.github/workflows/demo-reset.yml`: `timeout-minutes: 30` → `60`; comment ghi độ dài đã đo (DB chính ~3 phút + thi đấu
  ~15 phút) và lý do (độ trễ runner ↔ Aiven × ~5.400 câu lệnh).
- `docs/DeploymentGuide.md` 4.2: sửa "thêm ~30 giây" → "thêm ~15 phút trên Aiven thật (≈ 5.400 câu lệnh, mỗi câu ~0,15 s
  độ trễ; ~2 phút trên máy cục bộ); trong thời gian đó API thi đấu của demo trả 503".
- `docs/05-extra/02-remediation/24-ke-hoach-ha-tang-competition.md`: ghi chú số đo (chỉ ghi chú, không đổi kết luận cũ vì đo
  trên MySQL cục bộ).
- `docs/05-extra/02-remediation/00-tien-do.md`: thêm mục này.

## 5. Cách kiểm

- Parse YAML của workflow (`js-yaml`), kiểm `timeout-minutes` = 60 và các bước/`if` không đổi.
- Đọc lại tài liệu sửa; không có test ứng dụng nào đụng tới (Jest backend 503 và Vitest 238 chạy lại để chắc).
- Chạy thật: Demo reset trên GitHub sau khi merge và push — kỳ vọng ~19 phút, xanh, BXH vẫn có dữ liệu.

## 6. Quyết định của chủ dự án

Chọn **A** (06/10/2026). B và C không làm; C vẫn là hướng nếu sau này cần reset nhanh (plan riêng).

## 7. Kết quả

| Kiểm | Kết quả |
|---|---|
| Parse `demo-reset.yml` (js-yaml) so với bản trên `main` | chỉ khác `timeout-minutes` 30 → 60; `on`, `concurrency`, `permissions`, 7 bước và mọi `if` giữ nguyên |
| Jest backend | 503/503 |
| Vitest frontend | 238/238 |
| Tài liệu | `DeploymentGuide.md` 4.2 ("~30 giây" → ~15 phút trên Aiven thật, cả job ~19 phút, giới hạn 60 phút, API thi đấu 503 trong lúc chạy); plan 24 §9.1 có ghi chú số đo mới |
| Chạy thật trên GitHub | **Chưa** — workflow chạy từ `main`, nên chạy sau khi merge + push: kỳ vọng ~19 phút, xanh, BXH vẫn có dữ liệu |

Lưu ý khi chạy tay giữa ngày: trong ~15 phút API thi đấu của demo trả 503.
