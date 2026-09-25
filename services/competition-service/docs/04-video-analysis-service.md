# video-analysis-service — thiết kế định hướng (giai đoạn sau, KHÔNG làm trong nhánh này)

> Mục đích của tài liệu: chốt **ranh giới và hợp đồng** từ bây giờ, để competition-service không phải sửa khi
> service này ra đời. Chi tiết mô hình AI sẽ có plan riêng.

## 1. Vai trò

Service độc lập thứ hai, viết bằng Python, nhận video trận đấu, theo dõi từng người chơi và đưa ra:

1. **Chỉ số khách quan** cho người chơi xem: quãng đường chạy, tốc độ, bản đồ nhiệt vị trí, số pha cầu, độ dài
   pha cầu, tỉ lệ các loại cú đánh.
2. **Một bài chấm theo đúng `rubric v1`**: 12 mã tiêu chí, mỗi tiêu chí một mức 1–5 kèm độ tin cậy. Bài chấm được
   gửi sang competition-service qua `POST /v1/players/{id}/assessments/ai`, luôn ở trạng thái `pending_review`.
3. (sau nữa) **Tỉ số tự động** của trận, gửi làm bản nháp cho nhân viên xác nhận.

**AI không bao giờ trực tiếp đổi điểm.** Điểm vẫn do kết quả thi đấu quyết định (03, mục 2.3). Bài chấm AI dùng
để:

- làm điểm khởi đầu cho người mới, thay cho tự chấm;
- gợi ý quản lý chỉnh điểm;
- cho người chơi xem mình mạnh / yếu ở đâu.

## 2. Ranh giới

```
Nhân viên (UI app chính) ──▶ Gateway app chính ──▶ video-analysis-service
                                                     │  1. cấp presigned URL tải lên
Trình duyệt ──── tải video thẳng lên ─────────────▶ Object storage (Cloudflare R2 / S3)
                                                     │  2. job vào hàng đợi (DB của service, sau này Redis)
                                            Worker GPU (Python)
                                                     │  3. pipeline (mục 3)
                                                     │  4. nhân viên gán track ↔ người chơi, duyệt
                                                     ▼
                              competition-service  POST /v1/players/{id}/assessments/ai
                              (token riêng, scope assessment:submit-ai + rating:read)
                                                     │
                              phát competition.assessment.submitted ─▶ app chính nhắc nhân viên duyệt
```

- DB riêng: `video_jobs`, `video_tracks`, `track_player_links`, `player_metrics`.
- Video gốc **không** qua backend Node. Trình duyệt tải thẳng lên object storage bằng URL ký sẵn, vì Render free
  chỉ có 512 MB RAM.
- Tham chiếu sang competition-service bằng `matchId` / `playerId` của service đó (chuỗi mờ). Không đọc DB của
  nhau.
- Trường `evidence_ref` trong bài chấm = id job video, để truy ngược bằng chứng.

## 3. Pipeline (dự kiến)

| Bước | Việc | Công nghệ tham khảo |
|---|---|---|
| 1 | Nhận diện 4 góc + vạch sân → ma trận chiếu từ pixel sang mét (sân 13.4 × 6.1 m) | Phát hiện đường thẳng + homography (OpenCV), hoặc model keypoint sân |
| 2 | Phát hiện và theo dõi người, chỉ giữ 2 / 4 người trong sân, giữ ID qua cả trận | YOLO + ByteTrack / BoT-SORT; re-ID khi hai bên **đổi sân sau mỗi game** |
| 3 | Theo dõi quả cầu → tách từng pha cầu, điểm rơi, trong / ngoài | TrackNet (v2/v3): model chuyên cho cầu lông / tennis |
| 4 | Khung xương từng người → phân loại cú đánh (giao, phông, đập, chặt, bỏ nhỏ, lưới, lift, drive) | Pose (YOLO-pose / RTMPose) + model chuỗi thời gian; dữ liệu mở kiểu ShuttleSet |
| 5 | Tổng hợp chỉ số từng người → quy đổi ra 12 mã tiêu chí + độ tin cậy | Luật + mô hình hiệu chỉnh bằng các trận đã có điểm thật |

**Làm theo độ khó tăng dần:**

1. Di chuyển / thể lực (`footwork`, `stamina`): đo trực tiếp từ track, tin được.
2. Đếm và phân loại cú đánh (`smash`, `net`, `drop`, `clear`).
3. Tỉ số tự động.
4. Chất lượng kỹ thuật (`backhand`, `defense`, `tactics`): khó nhất, cần nhiều dữ liệu gán nhãn.

Tiêu chí nào AI chưa đủ tin cậy thì bỏ trống (`confidence` thấp / null). Khi duyệt, nhân viên điền nốt bằng tay.

## 4. Hợp đồng gửi sang competition-service

```json
POST /v1/players/{playerId}/assessments/ai
{ "rubricVersion": "v1", "evidenceRef": "vjob_01927f…", "matchId": "…",
  "answers":    { "footwork": 4, "stamina": 3, "smash": 3, "net": null, "…": null },
  "confidence": { "footwork": 0.86, "stamina": 0.74, "smash": 0.55 },
  "metrics":    { "distanceMeters": 1843, "avgSpeedMps": 2.1, "rallies": 61, "shotMix": { "smash": 14, "clear": 22 } },
  "modelVersion": "va-0.3.1" }
```

`answers` cho phép `null` ở tiêu chí chưa chấm được. Bài chấm AI chỉ được **áp** khi nhân viên duyệt và điền đủ
12 tiêu chí.

## 5. Hạ tầng, chi phí, pháp lý

- **Hạ tầng:**
  - Không chạy được trên Render free (không GPU, 512 MB RAM).
  - Worker chạy ở máy riêng có GPU, hoặc dịch vụ GPU trả theo lượt; hàng đợi đơn giản trong DB, sau này Redis.
  - Lưu trữ: Cloudflare R2 (có gói miễn phí dung lượng nhỏ, không tính phí băng thông tải ra).
- **Quay phim:** camera cố định sau đường biên cuối, cao 3–5 m, 1080p 50–60 fps. Tốt hơn nhiều so với quay tay
  bằng điện thoại. Nên có hướng dẫn quay kèm trong app.
- **Dữ liệu cá nhân:**
  - Hình ảnh người chơi là dữ liệu cá nhân (Luật Bảo vệ dữ liệu cá nhân 2025).
  - Phải có **sự đồng ý của mọi người trong video** trước khi phân tích.
  - Video gốc tự xoá sau N ngày; chỉ giữ chỉ số.
  - Người chơi xem được và yêu cầu xoá được dữ liệu của mình.
