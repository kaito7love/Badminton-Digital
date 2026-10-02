# competition-service — Dịch vụ Thi đấu

Service độc lập của Badminton Digital:
- chấm trình (form 12 tiêu chí);
- điểm trình Đơn / Đôi 1.0–7.0, thay đổi theo kết quả thi đấu;
- bảng xếp hạng;
- thuật toán xếp cặp / chia bảng / sơ đồ / xếp sân giao lưu;
- giải đấu (3 thể thức, chốt giải, BXH thành tích) và buổi giao lưu (điểm danh, xếp sân trống, màn hình lớn);
- bấm điểm trực tiếp từng pha cầu, tỉ số đẩy lên màn hình TV ngay qua luồng SSE (plan 19).

Có thể chạy và test **một mình**, không cần app chính. Kết nối với app chính qua hợp đồng API
(`openapi/`) và sự kiện (`contracts/events/`), không chung code hay DB.

- Thiết kế: [`docs/`](docs/)
  - [01 kiến trúc](docs/01-kien-truc.md)
  - [02 hợp đồng](docs/02-hop-dong-api-va-su-kien.md)
  - [03 form + điểm trình](docs/03-nghiep-vu-va-thuat-toan.md)
  - [05 hồ sơ + BXH](docs/05-ho-so-nguoi-choi-va-bang-xep-hang.md)
  - [06 trận / giải / giao lưu](docs/06-tran-dau-giai-dau-giao-luu.md)
  - [07 giao diện](docs/07-giao-dien.md)
  - [04 AI video](docs/04-video-analysis-service.md)
- Kế hoạch và tiến độ: `docs/05-extra/02-remediation/18-ke-hoach-cham-trinh-xep-cap.md` (ở gốc repo)

## Trạng thái

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Khung service, `player`, `rating`, `matchmaking`, BXH trình độ | Xong trên nhánh `feat/competition-service` |
| 2 | `match`, `tournament`, BXH thành tích, thống kê, dữ liệu demo | Xong trên nhánh `feat/competition-service` |
| 3 | `session` (buổi giao lưu), sửa thuật toán xếp sân, gộp hồ sơ đủ các module | Xong, đã merge |
| Plan 19 | Bấm điểm trực tiếp + luồng SSE cho màn hình TV | Xong trên nhánh `feat/competition-live-score` |
| 4 | Tích hợp app chính + giao diện (nhánh riêng) | Chưa làm |

## Chạy một mình (dev)

Cần Node ≥ 22, MySQL ≥ 8.

```bash
cp .env.example .env
npm install
npm run keys:generate
npm run migrate
npm run dev
```

- Bước `cp` xong thì điền `DB_*` trong `.env`, và tạo DB rỗng `competition_service` trước khi migrate.
- `keys:generate` tạo cặp khoá ES256 dev trong `.keys/`.
- `migrate` tạo 20 bảng trong DB riêng.
- `npm run seed:demo` (tuỳ chọn) tạo dữ liệu demo bằng chính các service: 39 người chơi, 2 giải đã chốt, 1 giải đang mở để thử bốc thăm, 3 giải hôm nay để thử vận hành (đơn nữ vòng tròn đang đánh, đôi cặp đăng ký sẵn vòng bảng + loại trực tiếp — thử "Gọi trận kế tiếp", đơn nam bốc thăm tại sân — thử điểm danh rồi bốc thăm), 1 buổi giao lưu đã đóng và 1 buổi đang diễn ra có sẵn tỉ số dở ở các sân (xem màn hình lớn ở `/v1/sessions/{id}/board`, luồng TV ở `…/stream`). Buổi giao lưu chạy theo đồng hồ giả lập nên seed lần nào cũng ra cùng dữ liệu. Chỉ chạy trên DB trống; production cần `ALLOW_DEMO_SEED=true`.
- `dev` chạy ở http://127.0.0.1:5100; Swagger UI ở `/docs`.

Gọi API bằng token dev (không cần app chính):

```bash
TOKEN=$(npm run -s token:dev -- --scope "rating:self ranking:read" --player bd:customer:1 --name "Nguyễn Văn An" --sub bd:user:1)
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:5100/v1/me
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:5100/v1/rubrics/current
```

Scope có sẵn:
- `rating:self`, `rating:read`, `rating:assess`, `rating:assess:any`, `rating:adjust`;
- `player:write`, `ranking:read`, `matchmaking:compute`;
- `match:score` (người chơi bấm điểm trận mình đang đánh — cần thêm `--player`);
- `tournament:read`, `tournament:operate`, `tournament:manage`;
- `session:read`, `session:operate`;
- `assessment:submit-ai`, `ops:admin`.

Ý nghĩa từng scope và bảng vai trò → scope: xem `docs/02` mục 5.

## Test

```bash
npm run check-boundaries
npm run test:unit
npm run test:integration
npm test
```

- `check-boundaries`: luật ranh giới B1 / B7 (không require chéo service; module chỉ gọi nhau qua `index.js`).
- `test:unit`: hàm thuần, không cần DB.
- `test:integration`: Express + MySQL thật trên DB `competition_service_test` (tự drop / migrate lại); response
  được kiểm theo OpenAPI, sự kiện theo JSON Schema.
- `npm test`: chạy cả hai.
- `npm run sim:session`: đo thuật toán xếp sân giao lưu (200 lần chạy × 7 kịch bản) — số liệu ở docs/06 mục 8.3.

## Docker

```bash
docker build -t competition-service .
docker run --rm -p 5100:5100 -e DB_HOST=... -e DB_NAME=competition_service -e DB_USER=... -e DB_PASSWORD=... \
  -e TRUSTED_ISSUERS='[{"issuer":"...","jwks":{"keys":[...]}}]' competition-service
```

Entrypoint: chờ DB → migrate → chạy. Health check: `GET /health/ready`.

## Cấu trúc

```
openapi/                 hợp đồng REST (nguồn sự thật)
contracts/events/        JSON Schema sự kiện phát ra / nhận vào
src/platform/            kỹ thuật dùng chung (config, auth, idempotency, outbox/inbox, health, jobs)
src/modules/<m>/         domain/ (hàm thuần) · application/ · infrastructure/ · index.js
src/shared/              kiểu lỗi nghiệp vụ, hàm số học
src/{db,app,main}.js     composition root — nơi duy nhất biết mọi module
scripts/                 keys-generate, token-dev, check-boundaries, snapshot, wait-for-db, bench-pairing
```
