<div align="center">

# 🏸 Badminton Digital Management

**Hệ thống quản lý chuỗi sân cầu lông: đặt sân, vận hành, bán lẻ, báo cáo và thi đấu.**

[![CI](https://github.com/kaito7love/Badminton-Digital/actions/workflows/ci.yml/badge.svg)](https://github.com/kaito7love/Badminton-Digital/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)

[**Bản demo trực tuyến**](https://badminton-digital-demo.onrender.com) ·
[Bắt đầu nhanh](#bắt-đầu-nhanh) ·
[Kiến trúc](#kiến-trúc) ·
[Cấu trúc dự án](#cấu-trúc-dự-án) ·
[Tài liệu API](#tài-liệu-api) ·
[Kiểm thử](#kiểm-thử) ·
[Triển khai](#triển-khai)

</div>

## Mục lục

1. [Giới thiệu](#giới-thiệu)
2. [Tính năng](#tính-năng)
3. [Kiến trúc](#kiến-trúc)
4. [Công nghệ sử dụng](#công-nghệ-sử-dụng)
5. [Bắt đầu nhanh](#bắt-đầu-nhanh)
6. [Cấu trúc dự án](#cấu-trúc-dự-án)
7. [Tài liệu API](#tài-liệu-api)
8. [Kiểm thử](#kiểm-thử)
9. [Triển khai](#triển-khai)
10. [Tài liệu dự án](#tài-liệu-dự-án)

## Giới thiệu

Dự án phục vụ một chuỗi sân cầu lông nhiều chi nhánh. Khách đặt sân và mua đồ trên web; nhân viên mở sân, tính tiền, bán lẻ và quản lý kho tại quầy; quản lý xem báo cáo. Phần **thi đấu** (giải đấu, buổi giao lưu, chấm điểm trực tiếp, xếp hạng) là một dịch vụ độc lập có cơ sở dữ liệu riêng.

> **Dùng thử ngay:** <https://badminton-digital-demo.onrender.com>
> Demo chạy trên gói miễn phí của Render nên **lần mở đầu tiên có thể mất 30–60 giây** để máy chủ thức dậy.
> Tài khoản dùng thử được in sẵn trên trang đăng nhập. Dữ liệu tự về trạng thái ban đầu lúc 03:00 mỗi đêm.

## Tính năng

| Đối tượng | Làm được gì |
|---|---|
| **Khách hàng** | Xem lịch trống và đặt sân theo giờ (`/dat-san`, có sơ đồ mặt bằng) · mua phụ kiện theo chi nhánh · giỏ hàng, đơn hàng · nhận thông báo về lịch đặt · xem trình độ của mình |
| **Khách vãng lai** | Xem giải đang mở, buổi giao lưu, bảng đấu, tỉ số trực tiếp và bảng xếp hạng tại `/thi-dau`, **không cần đăng nhập** |
| **Nhân viên** | Mở và đóng sân theo thời gian thực · thuê thêm phụ kiện giữa trận · chốt hoá đơn và thanh toán · bán lẻ tại quầy (POS) · nhập hàng, tồn kho · mã giảm giá · khách hàng |
| **Quản lý chi nhánh** | Như nhân viên, thêm quản lý nhân viên, báo cáo doanh thu xuất Excel/PDF; chỉ thấy chi nhánh của mình |
| **Quản trị** | Toàn bộ chi nhánh, chuyển chi nhánh đang xem, cài đặt hệ thống, nhật ký hoạt động |
| **Thi đấu** | Chấm trình và điểm trình đơn/đôi · giải đấu 3 thể thức · buổi giao lưu tự xếp sân · bấm điểm trực tiếp, màn hình TV cập nhật qua SSE |

Bốn vai trò trong hệ thống: `admin`, `branch_manager`, `employee`, `customer`.

## Kiến trúc

### Tổng quan

```text
  Người dùng  (khách · nhân viên · quản lý)
     │  trình duyệt
     ▼
  ┌────────────────────────────────────────┐
  │ Frontend  (React SPA)                  │
  │ giao diện khách, nhân viên, quản trị   │
  └────────────────────────────────────────┘
                      │  HTTP  /api/v1
                      ▼
  ┌────────────────────────────────────────┐
  │ Backend API  (Node.js + Express)       │        ┌────────────────────────────────┐
  │ đặt sân · thanh toán · kho · báo cáo   │  ───▶  │ MySQL                          │
  │ cổng nối sang dịch vụ thi đấu          │        │ badminton_digital_management   │
  └────────────────────────────────────────┘        └────────────────────────────────┘
                      │  cổng nội bộ: token dịch vụ ES256 sống 60 giây
                      ▼
  ┌────────────────────────────────────────┐
  │ competition-service                    │        ┌────────────────────────────────┐
  │ giải đấu · giao lưu · xếp hạng         │  ───▶  │ MySQL                          │
  │ chấm điểm trực tiếp                    │        │ competition_service            │
  └────────────────────────────────────────┘        └────────────────────────────────┘
```

Đọc từ trên xuống: người dùng chỉ làm việc với **Frontend**. Frontend chỉ gọi **Backend**. Backend giữ toàn bộ nghiệp vụ vận hành quán và là **cửa duy nhất** dẫn tới dịch vụ thi đấu. Mỗi dịch vụ có database MySQL riêng.

### Các thành phần

| Thành phần | Vai trò | Cổng khi chạy tay | Xem thêm |
|---|---|---|---|
| [`frontend/`](frontend/) | Giao diện cho khách, nhân viên và quản trị. Không chứa nghiệp vụ, chỉ gọi API | 5173 | [README](frontend/README.md) |
| [`backend/`](backend/) | API chính: đăng nhập và phân quyền, đặt sân, thanh toán, kho, báo cáo, cổng nối sang thi đấu | 5000 | [README](backend/README.md) |
| [`services/competition-service/`](services/competition-service/) | Giải đấu, buổi giao lưu, điểm trình, xếp hạng, chấm điểm trực tiếp. Chạy được một mình, không cần backend | 5100 | [README](services/competition-service/README.md) |
| MySQL | Hai database tách biệt, mỗi dịch vụ một database | 3306 | [Thiết kế CSDL](docs/DatabaseDesign.md) |

### Một yêu cầu đi qua hệ thống thế nào

**Yêu cầu thường** (ví dụ đặt sân): trình duyệt gọi `/api/v1/bookings` kèm JWT → backend kiểm JWT và vai trò, xác định chi nhánh đang thao tác → tầng nghiệp vụ xử lý → ghi vào MySQL → trả JSON `{ success, data, message, errors }`.

**Yêu cầu thi đấu** (ví dụ xem bảng xếp hạng), đi qua cổng nội bộ của backend:

1. Trình duyệt gọi `GET /api/v1/competition/...` kèm JWT của người dùng.
2. Backend kiểm JWT, xác định chi nhánh và giới hạn quyền theo vai trò.
3. Backend chuyển yêu cầu sang dịch vụ thi đấu kèm một **token dịch vụ ES256** ký riêng cho yêu cầu này (sống 60 giây).
4. Dịch vụ thi đấu kiểm chữ ký và quyền của từng route, rồi trả dữ liệu.
5. Backend trả dữ liệu về cho trình duyệt.

### Những quyết định thiết kế đáng biết

| Quyết định | Lý do |
|---|---|
| **Dịch vụ thi đấu có CSDL riêng** | Tách hẳn khỏi nghiệp vụ quán, chạy và kiểm thử được một mình. Hai bên chỉ biết nhau qua hợp đồng API (`openapi/`) và sự kiện (`contracts/events/`) |
| **Cổng ký lại token cho từng yêu cầu** | Dịch vụ thi đấu không bao giờ nhận JWT của người dùng. Quyền trong token bị cắt theo vai trò và không bao giờ có quyền quản trị của dịch vụ |
| **Tắt được hoàn toàn** | Thiếu cấu hình thì `/api/v1/competition` trả 503 và menu "Thi đấu" tự ẩn; cấu hình nửa vời thì máy chủ từ chối khởi động |
| **Đồng bộ dữ liệu khách hàng qua hộp thư sự kiện** | Thay đổi khách hàng được ghi vào bảng `integration_outbox` trong cùng giao dịch, rồi gửi sang dịch vụ thi đấu có ký HMAC; không mất sự kiện khi dịch vụ kia đang tắt |
| **Nhiều chi nhánh, khách hàng dùng chung toàn chuỗi** | Mỗi chi nhánh có sân, nhân viên, kho riêng; một khách (nhận diện theo số điện thoại) dùng được ở mọi chi nhánh |
| **Chặn mặc định** | Chuyển khoản tắt nếu chưa cấu hình ngân hàng và khoá webhook; trang tài liệu API tắt ở production; chính sách mật khẩu và phiên đăng nhập xoay vòng token |

Chi tiết kỹ thuật đầy đủ: [`CLAUDE.md`](CLAUDE.md) (quy ước và các lưu ý khi sửa code), [`docs/Architecture.md`](docs/Architecture.md).

## Công nghệ sử dụng

| Lớp | Công nghệ |
|---|---|
| Frontend | React 18, Vite 5, TailwindCSS 3, React Router 6, Axios, Recharts |
| Backend | Node.js 22, Express 4, Sequelize 6, MySQL 8, JWT, bcrypt, ExcelJS, PDFKit |
| Dịch vụ thi đấu | Node.js 22, Express, Sequelize, JWT ES256 (`jose`), kiểm tra hợp đồng OpenAPI, SSE |
| Kiểm thử | Jest, Supertest, Vitest, Postman/Newman, k6 |
| Triển khai | Docker, Docker Compose, nginx, GitHub Actions, Render, Aiven MySQL |

## Bắt đầu nhanh

Cần **Node.js 22** và **MySQL 8.0 trở lên** (hoặc Docker).

### Cách A: Docker Compose

```bash
cp backend/.env.example backend/.env   # sinh 2 JWT secret khác nhau, mỗi cái từ 32 ký tự (xem comment trong file)
cp docker/.env.example docker/.env     # điền DB_PASSWORD, DB_ROOT_PASSWORD
cd docker
docker compose up -d --build
```

Mở <http://127.0.0.1:8080>. Lần đầu backend chạy đủ migration trước khi nhận request nên mất vài phút. Dịch vụ thi đấu nằm sau profile `competition` và mặc định không chạy; cách bật ở [`docs/DeploymentGuide.md`](docs/DeploymentGuide.md) mục 5.

### Cách B: Chạy từng phần trên máy

```bash
# 1. Backend  →  http://localhost:5000
cd backend
cp .env.example .env      # điền DB_* và hai JWT secret
npm install
npm run migrate           # tạo bảng và các vai trò
npm run seed              # dữ liệu demo (mật khẩu công khai, không dùng cho môi trường thật)
npm run dev

# 2. Frontend  →  http://localhost:5173   (mở terminal khác)
cd frontend
npm install
npm run dev
```

- Frontend không bắt buộc có `.env`: không đặt `VITE_API_BASE_URL` thì nó gọi `/api/v1` qua proxy của Vite.
- Tài khoản seed dùng cho phát triển nằm trong `postman/badminton_local.postman_environment.json`.
- **Vận hành thật thì không seed.** Tạo admin đầu tiên bằng `npm run create-admin` (đọc `ADMIN_EMAIL`, `ADMIN_PASSWORD` từ 12 ký tự và `ADMIN_FULL_NAME` từ biến môi trường).

### Bật phần thi đấu (tuỳ chọn)

```bash
cd backend && npm run competition:keys    # sinh cặp khoá và các secret cho cả hai dịch vụ
```

Chép các khối biến sinh ra vào `backend/.env` và `services/competition-service/.env`, rồi chạy dịch vụ thi đấu theo mục "Chạy một mình (dev)" của [`services/competition-service/README.md`](services/competition-service/README.md).

## Cấu trúc dự án

Bấm vào tên thư mục để mở thư mục, hoặc cột bên phải để đọc tài liệu chi tiết.

| Thư mục | Nội dung | Tài liệu chi tiết |
|---|---|---|
| [`frontend/`](frontend/) | React SPA: giao diện quản trị, nhân viên, khách hàng và khu thi đấu | [`frontend/README.md`](frontend/README.md) |
| [`backend/`](backend/) | Node.js/Express REST API: đa chi nhánh, kho hàng, đặt sân, thanh toán, báo cáo, cổng nối thi đấu | [`backend/README.md`](backend/README.md) |
| ↳ [`backend/src/migrations/`](backend/src/migrations/) và [`backend/src/seeders/`](backend/src/seeders/) | Migration và dữ liệu seed của CSDL chính | [`docs/DatabaseDesign.md`](docs/DatabaseDesign.md) |
| ↳ [`backend/src/integrations/competition/`](backend/src/integrations/competition/) | Cổng nối app chính với dịch vụ thi đấu | [`CLAUDE.md`](CLAUDE.md) |
| [`services/competition-service/`](services/competition-service/) | Dịch vụ thi đấu độc lập: CSDL, test và OpenAPI riêng | [`README`](services/competition-service/README.md) · [`docs/`](services/competition-service/docs/) |
| [`docs/`](docs/) | SRS, Use Case, Database Design, API Design, Architecture, Test Plan, Deployment Guide; `docs/05-extra/` là hồ sơ rà soát và các kế hoạch sửa lỗi đánh số | [Bảng tài liệu](#tài-liệu-dự-án) |
| [`postman/`](postman/) | Postman collection kiểm thử API (131 request, 25 nhóm) | [`postman/README.md`](postman/README.md) |
| [`k6/`](k6/) | Kịch bản load testing (smoke / load / spike) | [`k6/README.md`](k6/README.md) |
| [`docker/`](docker/) | Docker Compose, Dockerfile, cấu hình nginx | [`docs/DeploymentGuide.md`](docs/DeploymentGuide.md) |
| [`.github/workflows/`](.github/workflows/) | CI/CD: [`ci.yml`](.github/workflows/ci.yml) (test và build mỗi lần push/PR), [`demo-reset.yml`](.github/workflows/demo-reset.yml) (đưa DB bản demo về trạng thái ban đầu mỗi đêm) | [Kiểm thử](#kiểm-thử) |
| [`render.yaml`](render.yaml) | Blueprint triển khai bản demo trên Render | [`docs/DeploymentGuide.md`](docs/DeploymentGuide.md) |
| [`WebUI/`](WebUI/), [`assets/`](assets/), [`DataBase/`](DataBase/) | Bản mẫu giao diện tĩnh ban đầu, ảnh gốc, và thư mục giữ chỗ (migration thật nằm ở `backend/src/migrations/`) | |

## Tài liệu API

Chạy backend rồi mở **<http://localhost:5000/api-docs>**: Swagger UI cho **118 operation** của app chính. Bấm **Authorize**, dán token là thử được ngay. Spec thô ở `/api-docs.json`.

- Spec được **sinh từ Postman collection** bằng `npm --prefix backend run docs:build` (không sửa tay) và lệnh này báo lỗi nếu collection lệch với `backend/src/routes/`.
- Trang tài liệu **tắt mặc định ở production**; bật bằng `ENABLE_API_DOCS=true`.
- Dịch vụ thi đấu có spec riêng (**121 operation**) ở `services/competition-service/openapi/`.

## Kiểm thử

| Bộ test | Lệnh | Ghi chú |
|---|---|---|
| Backend (Jest) | `npm --prefix backend test` | Không cần DB |
| Backend, tầng bảo mật | `npm --prefix backend run test:security` | Cần DB đã migrate và seed (đặt `DB_NAME_TEST`, tên có chữ `test`); không nằm trong `npm test` |
| Frontend (Vitest) | `npm --prefix frontend test -- --run` | |
| Dịch vụ thi đấu (Jest) | `npm --prefix services/competition-service test` | Chạy trên MySQL thật, xem lưu ý bên dưới |
| API (Newman) | `npx newman run postman/badminton_api_collection.json -e postman/badminton_local.postman_environment.json` | Cần backend chạy ở `localhost:5000`; mặc định chỉ chạy request đọc |
| Chịu tải (k6) | `k6 run k6/smoke.js` · `load_test.js` · `spike_test.js` | Cần [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/); smoke ~2 giây, load ~5 phút (100 VU), spike ~2 phút (200 VU) |

**Lưu ý với bộ test dịch vụ thi đấu:** bộ integration tự dựng rồi xoá database `competition_service_test` và dùng chung nó, nên phải chạy bằng `npm test` (tuần tự, `--runInBand`), không gọi `npx jest` song song. Bộ này ghi rất nhiều vào MySQL nên mất từ vài phút đến khoảng 20 phút tuỳ tốc độ ổ đĩa.

Newman và `k6/load_test.js` mặc định **chỉ đọc**. Xem README của từng thư mục để bật nhóm ghi và các cảnh báo khi đo (rate limit đăng nhập, cache CSDL lạnh).

**CI** (`.github/workflows/ci.yml`, chạy mỗi lần push và PR) gồm bốn job: test backend, test dịch vụ thi đấu (kèm `check-boundaries`, trên MySQL), build các image Docker, test và build frontend.

## Triển khai

| Đường | Dùng khi | Cách làm |
|---|---|---|
| **Render + Aiven** | Bản demo công khai | Một web service dựng từ `docker/app.Dockerfile` (backend phục vụ luôn bản build frontend, cùng một origin); dịch vụ thi đấu chạy trong cùng container; MySQL của Aiven qua TLS. Blueprint ở `render.yaml` |
| **Docker Compose** | Tự host trên máy hoặc VPS | Xem [Bắt đầu nhanh](#cách-a-docker-compose) và mục 5 của hướng dẫn triển khai |

`demo-reset.yml` chạy lúc 03:00 giờ Việt Nam mỗi đêm để xoá và seed lại dữ liệu bản demo. Hướng dẫn từng bước, biến môi trường, sao lưu và rollback: [`docs/DeploymentGuide.md`](docs/DeploymentGuide.md).

## Tài liệu dự án

| Tài liệu | Đường dẫn |
|---|---|
| Đặc tả yêu cầu (SRS) | [`docs/SRS.md`](docs/SRS.md) |
| Đặc tả Use Case | [`docs/UseCase.md`](docs/UseCase.md) |
| Thiết kế CSDL và ERD | [`docs/DatabaseDesign.md`](docs/DatabaseDesign.md) |
| Thiết kế API | [`docs/APIDesign.md`](docs/APIDesign.md) |
| Kiến trúc hệ thống | [`docs/Architecture.md`](docs/Architecture.md) |
| Kế hoạch kiểm thử | [`docs/TestPlan.md`](docs/TestPlan.md) |
| Hướng dẫn triển khai | [`docs/DeploymentGuide.md`](docs/DeploymentGuide.md) |
| Rà soát và các kế hoạch sửa lỗi đánh số | [`docs/05-extra/`](docs/05-extra/README.md) |
| Thiết kế dịch vụ thi đấu | [`services/competition-service/docs/`](services/competition-service/docs) |
| Quy ước kiến trúc cho người đóng góp | [`CLAUDE.md`](CLAUDE.md) |
