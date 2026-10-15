# Phụ lục — danh sách test mới của đợt bảo mật

Sinh tự động từ báo cáo JSON của lần chạy ngày 2026-10-16 trên commit `3823ef8` (worktree sạch, `npm ci` đúng lockfile).
Chỉ liệt kê test **thêm mới** trong đợt này; các test có sẵn từ trước xem tổng ở `38-tong-hop-ket-qua-kiem-thu-bao-mat.md`.

## Backend — test đơn vị / tích hợp không cần DB (backend/tests)

### `bcryptCompat.test.js` — 5/5

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | bcrypt — tương thích với mật khẩu đã lưu hash do bản cũ sinh vẫn so khớp đúng mật khẩu |
| 2 | ✅ | bcrypt — tương thích với mật khẩu đã lưu sai mật khẩu, thiếu ký tự hoặc hoa/thường khác đều bị từ chối |
| 3 | ✅ | bcrypt — tương thích với mật khẩu đã lưu hash mới có đúng định dạng $2b$10$ (cost 10 như AuthService) và so khớp hai chiều |
| 4 | ✅ | bcrypt — tương thích với mật khẩu đã lưu cùng mật khẩu hai lần ra hai hash khác nhau (có salt) nhưng cùng so khớp |
| 5 | ✅ | bcrypt — tương thích với mật khẩu đã lưu không còn phụ thuộc chuỗi tar/node-pre-gyp (nguyên nhân R13) |

### `changePassword.test.js` — 5/5

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) ghi mật khẩu mới và refresh token mới (dạng sha256) trong MỘT lệnh update |
| 2 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) trả cặp token mới hợp lệ, mang đúng id và vai trò |
| 3 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) mật khẩu cũ sai → 400 và KHÔNG đụng tới refresh token hay mật khẩu |
| 4 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) tài khoản demo dùng chung → 403 và không update |
| 5 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) người dùng không tồn tại → 404 |

### `groupAValidation.test.js` — 49/49

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R5 + R6 — AuthService.login R5: không có tài khoản vẫn tốn đúng một lần bcrypt.compare (cùng chi phí với sai mật khẩu) |
| 2 | ✅ | R5 + R6 — AuthService.login sai mật khẩu cũng đúng một lần compare và cùng thông điệp với "không có tài khoản" |
| 3 | ✅ | R5 + R6 — AuthService.login R6: tài khoản bị khoá + mật khẩu SAI → 401, không lộ trạng thái khoá |
| 4 | ✅ | R5 + R6 — AuthService.login R6: tài khoản bị khoá + mật khẩu ĐÚNG → 403 "vô hiệu hóa" và không cấp token |
| 5 | ✅ | R5 + R6 — AuthService.login mật khẩu không phải chuỗi ({"x":1}) → 401, không 500 |
| 6 | ✅ | R5 + R6 — AuthService.login mật khẩu không phải chuỗi (["a"]) → 401, không 500 |
| 7 | ✅ | R5 + R6 — AuthService.login mật khẩu không phải chuỗi (123) → 401, không 500 |
| 8 | ✅ | R5 + R6 — AuthService.login mật khẩu không phải chuỗi (null) → 401, không 500 |
| 9 | ✅ | R11 — validator báo cáo hợp lệ: không tham số |
| 10 | ✅ | R11 — validator báo cáo hợp lệ: khoảng hợp lệ |
| 11 | ✅ | R11 — validator báo cáo hợp lệ: chỉ from |
| 12 | ✅ | R11 — validator báo cáo hợp lệ: from = to |
| 13 | ✅ | R11 — validator báo cáo 400: ngày không có thật |
| 14 | ✅ | R11 — validator báo cáo 400: chữ |
| 15 | ✅ | R11 — validator báo cáo 400: năm 5 chữ số |
| 16 | ✅ | R11 — validator báo cáo 400: 30/2 |
| 17 | ✅ | R11 — validator báo cáo 400: from sau to |
| 18 | ✅ | R11 — validator báo cáo 400: period lạ |
| 19 | ✅ | R11 — validator báo cáo 400: mảng |
| 20 | ✅ | R11 — validator báo cáo isRealDate bắt ngày không tồn tại |
| 21 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_LOCK_DEADLOCK → 409 thử lại |
| 22 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_LOCK_WAIT_TIMEOUT → 409 thử lại |
| 23 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_DATA_TOO_LONG → 400 |
| 24 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_WARN_DATA_OUT_OF_RANGE → 400 |
| 25 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_DATA_OUT_OF_RANGE → 400 |
| 26 | ✅ | R11 — errorHandler với mã lỗi MySQL lỗi DB khác vẫn là 500 và không lộ chi tiết ở production |
| 27 | ✅ | R11 — id số nguyên nằm trong miền INT ở mọi validator không còn `.isInt()` trần trên trường id |
| 28 | ✅ | R12 — validator cài đặt chấp nhận: giá hợp lệ |
| 29 | ✅ | R12 — validator cài đặt chấp nhận: chuỗi số từ ô nhập |
| 30 | ✅ | R12 — validator cài đặt chấp nhận: giờ cao điểm dạng số |
| 31 | ✅ | R12 — validator cài đặt chấp nhận: giờ dạng HH:mm |
| 32 | ✅ | R12 — validator cài đặt chấp nhận: dạng mảng cũ |
| 33 | ✅ | R12 — validator cài đặt chấp nhận: object rỗng |
| 34 | ✅ | R12 — validator cài đặt 400: giá là chữ |
| 35 | ✅ | R12 — validator cài đặt 400: giá âm |
| 36 | ✅ | R12 — validator cài đặt 400: giá quá lớn |
| 37 | ✅ | R12 — validator cài đặt 400: giờ sai định dạng |
| 38 | ✅ | R12 — validator cài đặt 400: giờ cao điểm ngoài 0–24 |
| 39 | ✅ | R12 — validator cài đặt 400: chuỗi quá dài |
| 40 | ✅ | R12 — validator cài đặt 400: quá nhiều khoá |
| 41 | ✅ | R12 — validator cài đặt 400: lồng quá sâu |
| 42 | ✅ | R12 — validator cài đặt 400: quá 4 KB |
| 43 | ✅ | R12 — validator cài đặt 400 (JSON thô): khoá __proto__ |
| 44 | ✅ | R12 — validator cài đặt 400 (JSON thô): khoá constructor lồng |
| 45 | ✅ | R12 — validator cài đặt 400 (JSON thô): chuỗi thay vì object |
| 46 | ✅ | R12 — validator cài đặt 400 (JSON thô): null |
| 47 | ✅ | R12 — validator cài đặt 400 (JSON thô): số |
| 48 | ✅ | R12 — validator cài đặt PUT /settings: khoá lạ bị từ chối, khoá đã biết nhận |
| 49 | ✅ | R12 — validator cài đặt validateSettingObject dùng được độc lập |

### `groupDRules.test.js` — 13/13

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R15 — BookingService.durationViolation giới hạn mặc định là 3 giờ, khớp MAX_BOOKING_HOURS của trang Đặt sân |
| 2 | ✅ | R15 — BookingService.durationViolation 08:00–09:00 hợp lệ |
| 3 | ✅ | R15 — BookingService.durationViolation 08:00–10:30 hợp lệ |
| 4 | ✅ | R15 — BookingService.durationViolation 17:00–20:00 hợp lệ |
| 5 | ✅ | R15 — BookingService.durationViolation 05:00–07:59 hợp lệ |
| 6 | ✅ | R15 — BookingService.durationViolation 08:00–11:01 vượt giới hạn |
| 7 | ✅ | R15 — BookingService.durationViolation 08:00–14:00 vượt giới hạn |
| 8 | ✅ | R15 — BookingService.durationViolation 05:00–23:00 vượt giới hạn |
| 9 | ✅ | R15 — BookingService.durationViolation maxHours truyền vào được tôn trọng |
| 10 | ✅ | R15 — BookingService.durationViolation chỉ vai customer bị áp: createBooking gọi kiểm tra trong nhánh customer |
| 11 | ✅ | R14a — GitHub Actions ghim theo commit SHA có file workflow để kiểm |
| 12 | ✅ | R14a — GitHub Actions ghim theo commit SHA ci.yml: mọi `uses:` ngoài repo đều trỏ tới SHA 40 ký tự |
| 13 | ✅ | R14a — GitHub Actions ghim theo commit SHA demo-reset.yml: mọi `uses:` ngoài repo đều trỏ tới SHA 40 ký tự |

### `mailer.test.js` — 5/5

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP isMailConfigured chỉ true khi đủ HOST, USER, PASSWORD |
| 2 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP chưa cấu hình SMTP → lỗi 500 nói rõ biến cần khai báo |
| 3 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP gửi đúng người nhận, đăng nhập SMTP đúng, tiêu đề và link đặt lại có trong nội dung |
| 4 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP transporter được tái sử dụng: hai lần gửi liên tiếp đều tới nơi |
| 5 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP SMTP không kết nối được → lỗi ném ra cho nơi gọi (AuthService mới là nơi nuốt lỗi) |

### `passwordPolicy.test.js` — 59/59

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | checkPassword — độ dài hằng số đúng như đã duyệt: 8 đến 72 byte |
| 2 | ✅ | checkPassword — độ dài "" → length |
| 3 | ✅ | checkPassword — độ dài "abc" → length |
| 4 | ✅ | checkPassword — độ dài "1234567" → length |
| 5 | ✅ | checkPassword — độ dài "Xk9#mQ2" → length |
| 6 | ✅ | checkPassword — độ dài "Xk9#mQ2p" → ok |
| 7 | ✅ | checkPassword — độ dài 72 byte hợp lệ, 73 byte bị từ chối (bcrypt chỉ dùng 72 byte đầu) |
| 8 | ✅ | checkPassword — độ dài ký tự có dấu tính theo byte UTF-8, không theo số ký tự |
| 9 | ✅ | checkPassword — độ dài không phải chuỗi (null) → length |
| 10 | ✅ | checkPassword — độ dài không phải chuỗi (undefined) → length |
| 11 | ✅ | checkPassword — độ dài không phải chuỗi (12345678) → length |
| 12 | ✅ | checkPassword — độ dài không phải chuỗi ({}) → length |
| 13 | ✅ | checkPassword — độ dài không phải chuỗi (["abcdefgh"]) → length |
| 14 | ✅ | checkPassword — mật khẩu phổ biến 12345678 bị chặn |
| 15 | ✅ | checkPassword — mật khẩu phổ biến password bị chặn |
| 16 | ✅ | checkPassword — mật khẩu phổ biến Password bị chặn |
| 17 | ✅ | checkPassword — mật khẩu phổ biến PASSWORD123 bị chặn |
| 18 | ✅ | checkPassword — mật khẩu phổ biến qwertyuiop bị chặn |
| 19 | ✅ | checkPassword — mật khẩu phổ biến matkhau123 bị chặn |
| 20 | ✅ | checkPassword — mật khẩu phổ biến MatKhau2026! bị chặn |
| 21 | ✅ | checkPassword — mật khẩu phổ biến admin123 bị chặn |
| 22 | ✅ | checkPassword — mật khẩu phổ biến badminton bị chặn |
| 23 | ✅ | checkPassword — mật khẩu phổ biến Caulong123 bị chặn |
| 24 | ✅ | checkPassword — mật khẩu phổ biến iloveyou bị chặn |
| 25 | ✅ | checkPassword — mật khẩu phổ biến abc@123 bị chặn |
| 26 | ✅ | checkPassword — mật khẩu phổ biến Admin@123 bị chặn |
| 27 | ✅ | checkPassword — mật khẩu phổ biến Employee@123 bị chặn |
| 28 | ✅ | checkPassword — mật khẩu phổ biến Manager@123 bị chặn |
| 29 | ✅ | checkPassword — mật khẩu phổ biến Customer@123 bị chặn |
| 30 | ✅ | checkPassword — mật khẩu phổ biến 12345678 → common (đủ dài) |
| 31 | ✅ | checkPassword — mật khẩu phổ biến password → common (đủ dài) |
| 32 | ✅ | checkPassword — mật khẩu phổ biến qwertyuiop → common (đủ dài) |
| 33 | ✅ | checkPassword — mật khẩu phổ biến matkhau123 → common (đủ dài) |
| 34 | ✅ | checkPassword — mật khẩu phổ biến Admin@123 → common (đủ dài) |
| 35 | ✅ | checkPassword — mật khẩu phổ biến so không phân biệt hoa thường và bỏ đuôi số/ký hiệu |
| 36 | ✅ | checkPassword — mật khẩu phổ biến danh sách chặn đủ lớn và không chứa mật khẩu ngắn hơn quy định vô ích |
| 37 | ✅ | checkPassword — mật khẩu phổ biến Tr0ng-Ngay-M@i được chấp nhận |
| 38 | ✅ | checkPassword — mật khẩu phổ biến sau-cau-long-vui-ve được chấp nhận |
| 39 | ✅ | checkPassword — mật khẩu phổ biến Xk9#mQ2pLw được chấp nhận |
| 40 | ✅ | checkPassword — mật khẩu phổ biến Mat-khau-dai-va-khong-pho-bien-123 được chấp nhận |
| 41 | ✅ | checkPassword — mật khẩu phổ biến Sân cầu lông 2026! được chấp nhận |
| 42 | ✅ | checkPassword — đơn giản aaaaaaaa lặp một ký tự |
| 43 | ✅ | checkPassword — đơn giản zzzzzzzzzz lặp một ký tự |
| 44 | ✅ | checkPassword — đơn giản 11111111 lặp một ký tự |
| 45 | ✅ | checkPassword — đơn giản abcdefghij dãy liên tiếp |
| 46 | ✅ | checkPassword — đơn giản 87654321 dãy liên tiếp |
| 47 | ✅ | checkPassword — đơn giản mnopqrstu dãy liên tiếp |
| 48 | ✅ | checkPassword — đơn giản dãy ngắn xen ký tự khác không bị coi là đơn giản |
| 49 | ✅ | checkPassword — trùng thông tin cá nhân chứa số điện thoại (có hoặc không số 0 đầu, +84) |
| 50 | ✅ | checkPassword — trùng thông tin cá nhân chứa phần trước @ của email (≥ 4 ký tự), bỏ dấu chấm |
| 51 | ✅ | checkPassword — trùng thông tin cá nhân chứa họ tên không dấu, không khoảng trắng |
| 52 | ✅ | checkPassword — trùng thông tin cá nhân email/tên/phone ngắn hoặc không liên quan không gây báo nhầm |
| 53 | ✅ | checkPassword — trùng thông tin cá nhân assertPassword ném lỗi 400 với thông điệp tiếng Việt |
| 54 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu đăng ký: mật khẩu mạnh qua, yếu 400 kèm thông điệp cụ thể |
| 55 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu đổi mật khẩu: đúng chính sách qua; yếu 400; trùng email của chính mình 400 |
| 56 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu đổi sang CHÍNH mật khẩu hiện tại: chỉ kiểm độ dài (Postman idempotent), nhưng vẫn phải ≥ 8 |
| 57 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu đặt lại mật khẩu: kiểm độ dài + phổ biến (chưa biết user ở tầng này) |
| 58 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu tạo nhân viên: chặn mật khẩu yếu và trùng SĐT |
| 59 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu tạo tài khoản khách: mật khẩu tuỳ chọn, có thì phải đạt chính sách |

### `reportExporterFormula.test.js` — 8/8

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | buildExcel — chống formula injection (C4) payload #0 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 2 | ✅ | buildExcel — chống formula injection (C4) payload #1 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 3 | ✅ | buildExcel — chống formula injection (C4) payload #2 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 4 | ✅ | buildExcel — chống formula injection (C4) payload #3 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 5 | ✅ | buildExcel — chống formula injection (C4) payload #4 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 6 | ✅ | buildExcel — chống formula injection (C4) payload #5 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 7 | ✅ | buildExcel — chống formula injection (C4) nội dung gốc vẫn còn đọc được (chỉ thêm dấu nháy đơn phía trước) |
| 8 | ✅ | buildExcel — chống formula injection (C4) dữ liệu bình thường không bị đổi |

### `securityHeaders.test.js` — 18/18

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | CSP (R9) chuỗi CSP dựng đúng từ khai báo |
| 2 | ✅ | CSP (R9) script-src chỉ cho cùng origin: không unsafe-inline, không unsafe-eval, không domain ngoài |
| 3 | ✅ | CSP (R9) chống clickjacking, plugin và đổi base/form |
| 4 | ✅ | CSP (R9) chỉ mở đúng các nguồn ngoài mà frontend dùng: Google Fonts và mã QR VietQR |
| 5 | ✅ | Header bảo mật trên mọi loại response JSON API |
| 6 | ✅ | Header bảo mật trên mọi loại response danh mục công khai |
| 7 | ✅ | Header bảo mật trên mọi loại response trang tĩnh |
| 8 | ✅ | Header bảo mật trên mọi loại response 404 |
| 9 | ✅ | Header bảo mật trên mọi loại response lỗi 500 |
| 10 | ✅ | Header bảo mật trên mọi loại response Swagger UI (/api-docs) không bị CSP của ứng dụng chặn nhưng vẫn có các header còn lại |
| 11 | ✅ | HSTS chỉ khi thật sự là HTTPS HTTP thường: không có HSTS |
| 12 | ✅ | HSTS chỉ khi thật sự là HTTPS qua proxy tin cậy báo https: có HSTS 180 ngày, không includeSubDomains/preload |
| 13 | ✅ | HSTS chỉ khi thật sự là HTTPS chưa bật trust proxy: client tự gửi X-Forwarded-Proto: https KHÔNG kích hoạt HSTS |
| 14 | ✅ | Cache-Control cho API (R10) response API cá nhân là no-store |
| 15 | ✅ | Cache-Control cho API (R10) lỗi 401/500 của API cũng no-store |
| 16 | ✅ | Cache-Control cho API (R10) /api/v1/public/* không bị ép no-store |
| 17 | ✅ | Cache-Control cho API (R10) handler tự đặt Cache-Control (SSE) ghi đè được |
| 18 | ✅ | Cache-Control cho API (R10) ngoài /api/v1 (trang tĩnh) không bị đụng |

### `securityRouteMatrix.test.js` — 22/22

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) đọc được toàn bộ route (bắt buộc để các test dưới có nghĩa) |
| 2 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) chỉ đúng danh sách route công khai là không cần đăng nhập |
| 3 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) route chỉ cần đăng nhập (không khoá vai trò) đúng bằng danh sách đã biết |
| 4 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) webhook thanh toán đi qua paymentWebhookAuth, không qua JWT |
| 5 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /invoices/:id/void chỉ cho ["admin","branch_manager"] |
| 6 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) GET /invoices/:id/export-pdf chỉ cho ["admin","branch_manager","employee"] |
| 7 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /employees chỉ cho ["admin","branch_manager"] |
| 8 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) DELETE /employees/:id chỉ cho ["admin","branch_manager"] |
| 9 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) PUT /settings/pricing chỉ cho ["admin"] |
| 10 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) PUT /settings chỉ cho ["admin"] |
| 11 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) PUT /settings/branding chỉ cho ["admin"] |
| 12 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) DELETE /customers/:id chỉ cho ["admin"] |
| 13 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) GET /reports/export-excel chỉ cho ["admin","branch_manager"] |
| 14 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) GET /activity-logs chỉ cho ["admin","branch_manager"] |
| 15 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) GET /branches chỉ cho ["admin"] |
| 16 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) PUT /bookings/:id chỉ cho ["admin","branch_manager","employee"] |
| 17 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /payments/checkout chỉ cho ["admin","branch_manager","employee"] |
| 18 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /vouchers chỉ cho ["admin","branch_manager"] |
| 19 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /goods-receipts chỉ cho ["admin","branch_manager","employee"] |
| 20 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /inventory/adjustments chỉ cho ["admin","branch_manager","employee"] |
| 21 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) mọi route /my-orders chỉ dành cho khách |
| 22 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) không route nào cho khách (customer) ghi vào dữ liệu vận hành ngoài đặt/huỷ sân và đơn của mình |

### `securityTokensAndSecrets.test.js` — 11/11

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | Token (A4) access token hợp lệ được nhận |
| 2 | ✅ | Token (A4) refresh token không dùng làm access token được, và ngược lại |
| 3 | ✅ | Token (A4) token đặt lại mật khẩu không dùng làm access token được |
| 4 | ✅ | Token (A4) alg "none" bị từ chối |
| 5 | ✅ | Token (A4) đổi chữ ký hoặc ký bằng secret khác bị từ chối |
| 6 | ✅ | Token (A4) token hết hạn bị từ chối |
| 7 | ✅ | Token (A4) access token do server phát có hạn dùng (không vô thời hạn) |
| 8 | ✅ | Refresh token lưu dạng hash (A5b) hash sha256 hex 64 ký tự, khác token gốc, so khớp đúng |
| 9 | ✅ | Bí mật không rời khỏi hệ thống (E1, E2) model User mặc định không nạp passwordHash / refreshToken |
| 10 | ✅ | Bí mật không rời khỏi hệ thống (E1, E2) lỗi validation của Sequelize chỉ trả [{ field, message }], không có instance |
| 11 | ✅ | Bí mật không rời khỏi hệ thống (E1, E2) lỗi không rõ ở production chỉ trả thông điệp chung, không stack hay SQL |

### `sessionRotation.test.js` — 15/15

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | jwt — claim mới refresh token có jti: hai token ký trong CÙNG giây khác nhau |
| 2 | ✅ | jwt — claim mới access token mang tv = tokenVersion của user (mặc định 0) |
| 3 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn token hiện tại → cấp cặp MỚI, ghi hash mới + chuyển hash cũ sang previous với hạn ~30 giây (so-và-đổi) |
| 4 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn token cũ trong ân hạn → CHỈ access token, không xoay, không trả refresh token |
| 5 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn token cũ QUÁ ân hạn → 401 |
| 6 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn token lạ (không phải hiện tại cũng không phải previous) → 401 |
| 7 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn thua cuộc đua so-và-đổi (update ảnh hưởng 0 dòng) → rơi về ân hạn thay vì 500/401 |
| 8 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn tài khoản bị khoá → 401 ngay cả khi token đúng |
| 9 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn access token cấp ra mang tokenVersion hiện tại của user |
| 10 | ✅ | logout / đổi mật khẩu tăng token_version và xoá ân hạn logout: refreshToken, previous_* về null và token_version tăng 1 |
| 11 | ✅ | logout / đổi mật khẩu tăng token_version và xoá ân hạn đổi mật khẩu: token_version + 1, previous_* xoá, access token trả về mang version MỚI |
| 12 | ✅ | authMiddleware — so tv với token_version tv khớp → qua |
| 13 | ✅ | authMiddleware — so tv với token_version tv lệch (đã logout/đổi mật khẩu) → 401 |
| 14 | ✅ | authMiddleware — so tv với token_version token phát TRƯỚC khi có cột (không có tv) vẫn dùng được khi version = 0 |
| 15 | ✅ | authMiddleware — so tv với token_version token cũ không có tv bị thu hồi sau lần tăng version đầu tiên |

**Cộng Backend — test đơn vị / tích hợp không cần DB (backend/tests): 210/210**

## Backend — test bảo mật cần DB (backend/tests-security, chạy bằng `npm run test:security`)

### `auth-session.security.test.js` — 24/24

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | Phiên đăng nhập (A5, A6) A5c: sau logout, refresh token cũ bị từ chối |
| 2 | ✅ | Phiên đăng nhập (A5, A6) A1: sai mật khẩu và sai tài khoản cho cùng mã + thông điệp |
| 3 | ✅ | Phiên đăng nhập (A5, A6) A9b: đăng ký kèm role/roleId vẫn là customer |
| 4 | ✅ | Phiên đăng nhập (A5, A6) token tạo sẵn dùng được (đối chứng cho helpers) |
| 5 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên mật khẩu cũ sai (400) không làm refresh token đang dùng mất hiệu lực |
| 6 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên đổi mật khẩu thành công trả cặp token mới |
| 7 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên thiết bị khác: refresh token cũ bị từ chối |
| 8 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên thiết bị đang đổi: refresh token mới đổi được access token |
| 9 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên thiết bị đang đổi: refresh token trước khi đổi cũng bị từ chối |
| 10 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên access token mới gọi được /auth/me |
| 11 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên đăng nhập bằng mật khẩu cũ bị từ chối sau khi đổi |
| 12 | ✅ | Phiên đăng nhập (A5, A6) R3/A5a: refresh token xoay vòng — cấp refresh token MỚI, token mới dùng được |
| 13 | ✅ | Phiên đăng nhập (A5, A6) R4/A6a: access token hết hiệu lực ngay sau logout |
| 14 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đăng ký với "123456" bị từ chối, kèm thông điệp cụ thể |
| 15 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đăng ký với mật khẩu mạnh được nhận |
| 16 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu quá ngắn → 400 |
| 17 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu phổ biến → 400 |
| 18 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu phổ biến + đuôi số/ký hiệu → 400 |
| 19 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu dãy bàn phím → 400 |
| 20 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu mật khẩu demo công khai → 400 |
| 21 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu lặp một ký tự → 400 |
| 22 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu dài hơn 72 byte → 400 |
| 23 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu chứa SĐT của chính mình → 400 |
| 24 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu bị từ chối thì phiên hiện có không bị thu hồi |

### `authz.security.test.js` — 25/25

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/employees → 403 |
| 2 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/customers → 403 |
| 3 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/reports/dashboard → 403 |
| 4 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/activity-logs → 403 |
| 5 | ✅ | B1: khách không vào được khu nhân viên put /api/v1/settings → 403 |
| 6 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/branches → 403 |
| 7 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/courts → 403 |
| 8 | ✅ | B1: khách không vào được khu nhân viên không token → 401 ở route cần đăng nhập |
| 9 | ✅ | B2: khách không đụng được dữ liệu của khách khác xem booking của người khác → bị chặn |
| 10 | ✅ | B2: khách không đụng được dữ liệu của khách khác huỷ booking của người khác → bị chặn và booking còn nguyên |
| 11 | ✅ | B2: khách không đụng được dữ liệu của khách khác danh sách booking của người lạ không chứa booking này |
| 12 | ✅ | B2: khách không đụng được dữ liệu của khách khác xem hồ sơ và lịch sử của khách khác → bị chặn |
| 13 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác nhân viên CN2 GET /api/v1/courts/8 (dữ liệu CN3) → bị chặn |
| 14 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác nhân viên CN2 GET /api/v1/invoices/12 (dữ liệu CN3) → bị chặn |
| 15 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác nhân viên CN2 GET /api/v1/sales-orders/12 (dữ liệu CN3) → bị chặn |
| 16 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác nhân viên CN2 GET /api/v1/goods-receipts/6 (dữ liệu CN3) → bị chặn |
| 17 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác X-Branch-Id khác chi nhánh của mình → 403 |
| 18 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác khách gửi X-Branch-Id → 403 |
| 19 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác R8: GET /sessions/:id/extras của phiên chi nhánh khác bị chặn |
| 20 | ✅ | E1: không rò trường bí mật admin GET /api/v1/auth/me |
| 21 | ✅ | E1: không rò trường bí mật admin GET /api/v1/employees |
| 22 | ✅ | E1: không rò trường bí mật admin GET /api/v1/customers |
| 23 | ✅ | E1: không rò trường bí mật managerCn2 GET /api/v1/employees |
| 24 | ✅ | E1: không rò trường bí mật customer GET /api/v1/auth/me |
| 25 | ✅ | E1: không rò trường bí mật employeeCn2 GET /api/v1/customers |

### `group-a.security.test.js` — 13/13

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R6: không lộ trạng thái khoá khi chưa biết mật khẩu mật khẩu sai → 401 (giống tài khoản không tồn tại) |
| 2 | ✅ | R6: không lộ trạng thái khoá khi chưa biết mật khẩu mật khẩu đúng → 403 vô hiệu hóa |
| 3 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo: from không có thật → 400 |
| 4 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo: from là chữ → 400 |
| 5 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo: năm 5 chữ số → 400 |
| 6 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo: period lạ → 400 |
| 7 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo hợp lệ vẫn 200 |
| 8 | ✅ | R11: đầu vào sai trả 400, không 500 tạo khách với họ tên 300 ký tự → 400 |
| 9 | ✅ | R11: đầu vào sai trả 400, không 500 id ngoài miền INT → 400 |
| 10 | ✅ | R12: cài đặt được kiểm kiểu PUT /settings/pricing giá là chữ → 400 |
| 11 | ✅ | R12: cài đặt được kiểm kiểu PUT /settings/operating-hours giờ sai → 400 |
| 12 | ✅ | R12: cài đặt được kiểm kiểu PUT /settings khoá lạ → 400 |
| 13 | ✅ | R12: cài đặt được kiểm kiểu ghi lại đúng giờ mở cửa hiện có vẫn 200 (không làm hỏng nút Lưu) |

### `group-d.security.test.js` — 3/3

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R15: độ dài một lượt đặt khách đặt 6 giờ liền bị 400 với thông điệp rõ |
| 2 | ✅ | R15: độ dài một lượt đặt khách đặt đúng 3 giờ được nhận (dò khung trống) |
| 3 | ✅ | R15: độ dài một lượt đặt nhân viên đặt 6 giờ cho khách quầy vẫn được (dò ngày/khung còn trống) |

### `security-headers.security.test.js` — 9/9

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | F1: header bảo mật trên app thật danh mục công khai có đủ header |
| 2 | ✅ | F1: header bảo mật trên app thật lỗi 401 có đủ header |
| 3 | ✅ | F1: header bảo mật trên app thật route không tồn tại có đủ header |
| 4 | ✅ | F1: header bảo mật trên app thật HTTP thường không nhận HSTS; qua proxy báo https thì app (chưa bật trust proxy) cũng không tin client |
| 5 | ✅ | F5: response cá nhân là no-store khách GET customer |
| 6 | ✅ | F5: response cá nhân là no-store khách GET customer |
| 7 | ✅ | F5: response cá nhân là no-store nhân viên GET employeeCn2 |
| 8 | ✅ | F5: response cá nhân là no-store admin GET admin |
| 9 | ✅ | F5: response cá nhân là no-store lỗi 401 của API cũng no-store |

### `session-rotation.security.test.js` — 12/12

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R3: xoay vòng refresh token và ân hạn hai request refresh CÙNG token đồng thời: cả hai 200, đúng một bên được refresh token mới |
| 2 | ✅ | R3: xoay vòng refresh token và ân hạn token mới (bên thắng cuộc) dùng được và xoay tiếp |
| 3 | ✅ | R3: xoay vòng refresh token và ân hạn token cũ vẫn trong ân hạn → access token (không có refresh token mới) |
| 4 | ✅ | R3: xoay vòng refresh token và ân hạn token cũ QUÁ ân hạn → 401 |
| 5 | ✅ | R3: xoay vòng refresh token và ân hạn token hiện tại vẫn còn hiệu lực sau khi ân hạn của token cũ đã hết |
| 6 | ✅ | R3: xoay vòng refresh token và ân hạn /auth/me không lộ trường mới (token_version, previous_*) |
| 7 | ✅ | R4: access token bị thu hồi ngay token phát trước khi có cột (không có tv) vẫn dùng được ở version 0 |
| 8 | ✅ | R4: access token bị thu hồi ngay cả hai thiết bị đang dùng được trước khi đổi mật khẩu |
| 9 | ✅ | R4: access token bị thu hồi ngay B đổi mật khẩu: access token của A bị 401 NGAY, access token mới của B dùng được |
| 10 | ✅ | R4: access token bị thu hồi ngay luồng SSE (?token=) cũng từ chối access token đã bị thu hồi |
| 11 | ✅ | R4: access token bị thu hồi ngay refresh token mới của B cấp được access token hợp lệ (mang version mới) |
| 12 | ✅ | R4: access token bị thu hồi ngay logout: access token và refresh token đều hết hiệu lực ngay |

**Cộng Backend — test bảo mật cần DB (backend/tests-security, chạy bằng `npm run test:security`): 86/86**

## Frontend — Vitest

### `passwordRules.test.js` — 11/11

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | passwordRules — khớp chính sách backend hằng số đúng như đã duyệt |
| 2 | ✅ | passwordRules — khớp chính sách backend "" → lỗi=true |
| 3 | ✅ | passwordRules — khớp chính sách backend "1234567" → lỗi=true |
| 4 | ✅ | passwordRules — khớp chính sách backend "12345678" → lỗi=false |
| 5 | ✅ | passwordRules — khớp chính sách backend "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" → lỗi=false |
| 6 | ✅ | passwordRules — khớp chính sách backend "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" → lỗi=true |
| 7 | ✅ | passwordRules — khớp chính sách backend tính theo byte UTF-8: 25 chữ "ệ" (75 byte) quá dài |
| 8 | ✅ | passwordRules — khớp chính sách backend không phải chuỗi → lỗi |
| 9 | ✅ | serverMessage ưu tiên lỗi từng trường (msg của express-validator) |
| 10 | ✅ | serverMessage dùng errors[0].message nếu không có msg |
| 11 | ✅ | serverMessage rơi về message chung rồi fallback |

### `sessionTokens.test.js` — 9/9

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu ghi cả hai khi server trả đủ |
| 2 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là null |
| 3 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là undefined |
| 4 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là object rỗng |
| 5 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là thiếu refresh |
| 6 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là thiếu access |
| 7 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là chuỗi rỗng |
| 8 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là không phải chuỗi |
| 9 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu không có storage thì không ném lỗi |

**Cộng Frontend — Vitest: 20/20**

**TỔNG test mới: 316/316**
