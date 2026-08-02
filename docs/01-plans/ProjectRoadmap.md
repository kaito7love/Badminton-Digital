# 🗺️ Project Roadmap — Badminton Digital Management

**Dự án:** Badminton Digital Management  
**Cập nhật lần cuối:** 23/07/2026

---

## 📊 Bảng Theo Dõi Tiến Độ Tổng Quan

| Phase | Tên Giai Đoạn | Trạng Thái | Tài liệu kế hoạch |
|-------|--------------|-----------|-------------------|
| **Phase 1** | Requirements & Use Cases | **✅ COMPLETED** | [Phase1-RequirementsUseCases.md](Phase1-RequirementsUseCases.md) |
| **Phase 2** | Architecture & Database Design | **✅ COMPLETED** | [Phase2-ArchitectureDatabaseDesign.md](Phase2-ArchitectureDatabaseDesign.md) |
| **Phase 3** | Backend Core & Auth Module | **✅ COMPLETED** | [Phase3-BackendCoreAuth.md](Phase3-BackendCoreAuth.md) |
| **Phase 4** | Backend Business APIs | **✅ COMPLETED** | [Phase4-BackendBusinessAPIs.md](Phase4-BackendBusinessAPIs.md) |
| **Phase 5** | Frontend Web Application | **⏳ PLANNED** | [Phase5-FrontendWebApp.md](Phase5-FrontendWebApp.md) |
| **Phase 6** | Testing, DevOps & Deployment | **⏳ PLANNED** | [Phase6-TestingDevOpsDeployment.md](Phase6-TestingDevOpsDeployment.md) |

---

## 📁 Cấu Trúc Thư Mục `docs/` Hiện Tại

```
docs/
│
├── 01-plans/                                  ← Kế hoạch & lộ trình dự án
│   ├── ProjectRoadmap.md                      ← File này
│   ├── Phase1-RequirementsUseCases.md
│   ├── Phase2-ArchitectureDatabaseDesign.md
│   ├── Phase3-BackendCoreAuth.md
│   ├── Phase4-BackendBusinessAPIs.md
│   ├── Phase5-FrontendWebApp.md
│   └── Phase6-TestingDevOpsDeployment.md
│
├── 02-progress/                               ← Theo dõi tiến độ thực tế
│   └── ProjectProgress.md
│
├── 03-ai-workflow/                            ← Lưu lại quá trình làm việc với AI
│   ├── implementation-plans/
│   │   ├── Phase1-ImplementationPlan.md
│   │   ├── Phase2-ImplementationPlan.md
│   │   ├── Phase3-ImplementationPlan.md
│   │   └── Phase4-ImplementationPlan-Final.md
│   │
│   ├── walkthrough-results/
│   │   ├── Phase1-Tasks-Walkthrough.md
│   │   ├── Phase2-Tasks-Walkthrough.md
│   │   ├── Phase3-Tasks-Walkthrough.md
│   │   └── Phase4-Walkthrough-2026-07-23.md
│   │
│   └── ai-progress-log/
│       ├── AI-Task-Log.md
│       ├── Phase1-Notes.md
│       ├── Phase2-Notes.md
│       ├── Phase3-Notes.md
│       └── Phase4-Notes.md
│
├── 04-workflows/                              ← User Workflows theo từng Actor
│   ├── README.md
│   ├── WF-Admin.md
│   ├── WF-Employee.md
│   ├── WF-Customer.md
│   └── flows/
│       ├── WF-01-Login.md
│       ├── WF-02-CourtOperations.md
│       ├── WF-03-BookingManagement.md
│       ├── WF-04-Payment.md
│       ├── WF-05-CustomerManagement.md
│       ├── WF-06-EmployeeManagement.md
│       ├── WF-07-Accessories.md
│       └── WF-08-ReportsSettings.md
│
├── APIDesign.md                               ← Đặc tả REST API toàn bộ hệ thống
├── Architecture.md                            ← Sơ đồ kiến trúc hệ thống
├── DatabaseDesign.md                          ← Thiết kế cơ sở dữ liệu (ERD + Schema)
├── DeploymentGuide.md                         ← Hướng dẫn triển khai (Docker, CI/CD)
├── SRS.md                                     ← Software Requirements Specification
├── TestPlan.md                                ← Kế hoạch kiểm thử
└── UseCase.md                                 ← Đặc tả Use Case (UC-01 → UC-21)
```

---

## 🔖 Quy Ước Trạng Thái

| Ký Hiệu | Ý Nghĩa |
|---------|---------|
| `✅ COMPLETED` | Phase đã hoàn thành & được nghiệm thu |
| `🚧 IN PROGRESS` | Phase đang được triển khai |
| `⏳ PLANNED` | Phase đã lên kế hoạch, chưa bắt đầu |
| `❌ BLOCKED` | Phase bị chặn do phụ thuộc chưa giải quyết |

---

## 🔗 Tài liệu gốc tham chiếu

| Tài liệu | Mô tả |
|----------|-------|
| [SRS.md](../SRS.md) | Yêu cầu phần mềm đầy đủ |
| [UseCase.md](../UseCase.md) | 21 Use Case của hệ thống |
| [APIDesign.md](../APIDesign.md) | Thiết kế REST API chuẩn |
| [DatabaseDesign.md](../DatabaseDesign.md) | ERD & Schema MySQL |
| [Architecture.md](../Architecture.md) | Kiến trúc hệ thống backend/frontend |
| [DeploymentGuide.md](../DeploymentGuide.md) | Hướng dẫn deploy Docker |
| [TestPlan.md](../TestPlan.md) | Kế hoạch kiểm thử toàn diện |
