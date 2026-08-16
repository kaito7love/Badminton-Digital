# docs/05-extra — Rà soát & kế hoạch sửa lỗi (ngoài luồng tài liệu thiết kế gốc)

Thư mục này tách biệt hoàn toàn khỏi tài liệu thiết kế gốc của dự án
(`docs/01-plans`, `docs/02-progress`, `docs/03-ai-workflow`, `docs/04-workflows`)
để không lẫn lộn hai việc khác nhau: "dự án được thiết kế ra sao" (4 thư mục
trên) và "rà soát + sửa lỗi phát sinh sau khi có code thật" (thư mục này).

## Cấu trúc

### `01-audit/` — Đợt rà soát ban đầu (2026-08-15)
Ảnh chụp hiện trạng tại một thời điểm: bảo mật, độ ổn định, các phần dở dang,
và 2 câu hỏi cụ thể (realtime đa thiết bị, logout ~15 phút). Đây là **hồ sơ
lịch sử** — phần lớn phát hiện 🔴/🟠 trong `SecurityAudit.md` và
`StabilityAudit.md` đã được sửa (xem `02-remediation/00-tien-do.md` để biết
chính xác cái nào), tài liệu gốc **không được sửa lại** để giữ nguyên bối
cảnh lúc phát hiện — muốn biết cái gì còn hiệu lực, đọc file tiến độ trước.

- `SecurityAudit.md` — lỗ hổng bảo mật, kèm file:line, kịch bản khai thác.
- `StabilityAudit.md` — race condition, thiếu transaction, cấu hình pool...
- `ProjectGapsAndDirection.md` — tính năng dở dang / chưa quyết (loyalty tier,
  vai trò branch_manager lúc đó, dữ liệu ghi nhưng không dùng...).
- `LoyaltyTier.md` — giải thích cơ chế hạng hội viên + đề xuất phát triển.
- `RealtimeCourtSync.md` — vì sao mở sân ở máy A không tự cập nhật máy B.
- `PlansVsCurrentReality.md` — đối chiếu tài liệu kế hoạch cũ với code thật.
- `SessionRefreshIssue.md` — vì sao thỉnh thoảng bị bắt đăng nhập lại ~15 phút.
- `SessionSummary.md` — tổng hợp toàn bộ phát hiện của đợt audit này, xếp
  theo mức độ khẩn cấp.

### `02-remediation/` — Kế hoạch sửa lỗi theo nhánh git + tiến độ
Bắt đầu từ các phát hiện ở `01-audit/`, chia việc sửa thành từng nhánh git
riêng (hạn chế code thẳng trên `main`). Đọc `00-tien-do.md` trước để biết
đã làm tới đâu.

- `00-tien-do.md` — **đọc file này trước** — đã làm được gì, còn gì chưa làm,
  bằng chứng test cho từng phần đã làm.
- `01-ke-hoach-dead-code-cleanup.md` — kế hoạch nhánh tiếp theo (chưa làm).
- `02-ke-hoach-branch-timezone.md` — kế hoạch (chưa làm).
- `03-ke-hoach-frontend-code-splitting.md` — kế hoạch (chưa làm).
- `04-ke-hoach-invoice-reporting.md` — kế hoạch báo cáo doanh thu/tồn kho
  dùng dữ liệu `invoice_lines` (phụ thuộc nhánh invoice line items đã xong).
- `05-backlog-nhom-b.md` — 4 việc cần chủ dự án quyết định chính sách kinh
  doanh trước khi viết plan chi tiết (chưa làm, chưa lên plan).
- `06-kiem-tra-lai-2026-08-16.md` — kiểm tra lại toàn bộ 5 việc đã "xong" ở
  trên bằng test thật (server thật, API thật, DB thật, riêng mục docker còn
  dựng cả cụm container thật) — xác nhận không có hồi quy, kèm 2 ghi chú phụ.
- `07-ke-hoach-ban-le-phu-kien.md` — plan module bán lẻ dụng cụ cầu lông
  (vợt/áo/quần/cầu) + kho hợp nhất, trụ cột 2+3 trong định hướng hệ thống
  (chưa làm, chờ duyệt). Đính chính lại phần trong `01-ke-hoach-dead-code-cleanup.md`
  từng đề xuất xoá nhầm 5 bảng catalog/sales-order coi là dead code.
