# Loyalty Tier (Hạng hội viên) — Hiện trạng & Đề xuất phát triển

**Mục đích tài liệu:** giải thích cơ chế "hạng hội viên" (`loyaltyTier`) đang
hoạt động thế nào trong code hiện tại, làm rõ nó **chưa** làm được gì, và
liệt kê các hướng có thể phát triển tiếp để bạn quyết định hướng nào đáng
làm trước. Đây là tài liệu đề xuất — chưa có mục nào ở phần "Đề xuất" được
lập trình, chỉ liệt kê để cân nhắc.

---

## 1. Loyalty tier là gì

Là 1 nhãn phân hạng khách hàng (`normal` / `gold` / `vip`), tính tự động dựa
trên **tổng số tiền khách đã chi tiêu** (`totalSpent`) — không phải khách tự
đăng ký, không phải nhân viên gán tay. Mục đích ban đầu (theo tên gọi) là để
phân biệt khách "thân thiết" — nhưng như mục 3 dưới đây sẽ nói rõ, hiện tại
việc phân hạng này **không kèm theo bất kỳ quyền lợi hay hành vi khác biệt
nào** trong hệ thống, nó gần như một con số thống kê được "gắn nhãn" đẹp hơn
là một chương trình khách hàng thân thiết thực sự.

## 2. Cơ chế đang chạy trong code

**Ngưỡng phân hạng** (tính trên `totalSpent`, gộp **toàn chuỗi** — từ khi
`Customer` bỏ `branch_id`, 1 khách chi tiêu ở cả 3 chi nhánh vẫn cộng dồn về
1 hồ sơ duy nhất):

| Hạng | Điều kiện |
|---|---|
| `normal` | Mặc định, tổng chi tiêu &lt; 5.000.000đ |
| `gold` | Tổng chi tiêu ≥ 5.000.000đ |
| `vip` | Tổng chi tiêu ≥ 15.000.000đ |

**`totalSpent`/`loyaltyTier` được cập nhật ở đúng 2 chỗ, cả hai đều nằm
trong `backend/src/services/PaymentService.js`, và chỉ khi thanh toán thực
sự hoàn tất (không phải lúc bấm "Thanh toán"):**

- **Tiền mặt** (`checkout()`, dòng ~127-143): cộng dồn + tính lại hạng ngay
  trong transaction tạo hóa đơn, vì tiền mặt được coi là xác nhận ngay.
- **Chuyển khoản** (`processWebhook()`, dòng ~234-281): lúc `checkout()`
  chạy, hóa đơn/thanh toán vẫn ở trạng thái `pending` — `totalSpent` **chưa
  đổi**. Chỉ khi `POST /api/v1/payments/webhook` (do đơn vị thanh toán gọi
  về) xác nhận `paid`, hệ thống mới cộng dồn và tính lại hạng.

**Vấn đề kỹ thuật đáng chú ý:** công thức `>= 15000000 ? 'vip' : >= 5000000
? 'gold' : 'normal'` bị **viết lặp lại độc lập ở 3 nơi** — 2 chỗ trong
`PaymentService.js` nêu trên, và 1 lần nữa trong migration
`20260815300001-unify-customers-chain-wide.js` (dùng khi gộp lại `totalSpent`
của các hồ sơ khách trùng SĐT). Không có 1 hằng số/hàm dùng chung nào — nếu
sau này đổi ngưỡng (ví dụ hạ mốc VIP xuống 10 triệu), phải sửa đúng cả 3
chỗ, dễ sót. **Nên dọn việc này trước khi xây thêm bất kỳ tính năng nào dựa
trên hạng**, để tránh 3 nơi tính ra 3 kết quả khác nhau.

## 3. Tác dụng thực tế hiện tại — gần như bằng không

Đã rà soát toàn bộ backend (services, controllers, routes) và frontend
(mọi trang có khả năng liên quan: Customers, Bookings, Dashboard, Reports,
History). Kết quả:

- **Không có giảm giá theo hạng.** Hệ thống có 1 trường giảm giá
  (`Invoice.discountAmount`, nhập tay lúc checkout bởi nhân viên) nhưng nó
  **hoàn toàn độc lập** với `loyaltyTier` — bất kỳ khách nào cũng có thể
  được giảm giá tùy ý nhân viên nhập, không liên quan hạng gì.
- **Không có ưu tiên đặt sân.** `BookingService.js` không hề tham chiếu tới
  `loyalty` — hạng VIP không giúp giữ chỗ tốt hơn khách thường.
- **Không lọc/tìm kiếm được theo hạng.** API `GET /customers` chỉ hỗ trợ tìm
  theo tên/SĐT/email, không có tham số lọc theo `loyaltyTier`.
- **Không xuất hiện ở Dashboard/Báo cáo.** Không có số liệu "bao nhiêu khách
  mỗi hạng", "doanh thu theo hạng" ở đâu cả.
- **Chỉ 1 nơi thực sự hiển thị nó:** bảng khách hàng ở `CustomersPage.jsx`
  — 1 badge màu (vàng/hổ phách/xám) cạnh tên khách. Vậy thôi.
- Tài liệu cũ `docs/04-workflows/WF-Customer.md` từng ghi hạng Gold có "ưu
  đãi đặc biệt", VIP có "ưu tiên đặt sân, giảm giá" — **những điều này chưa
  từng được lập trình**, đã sửa lại tài liệu đó cho khớp thực tế.

## 4. Vì sao điều này đáng để bạn biết

Nếu bạn (hoặc khách hàng cuối) đang mong đợi "khách VIP thì được giảm giá /
ưu tiên" như một tính năng đã có — thì **chưa có**. Hệ thống mới dừng ở bước
*đo lường* (biết khách nào chi tiêu nhiều), chưa có bước *tưởng thưởng*
(dùng thông tin đó để làm gì). Đây là lý do bạn thấy "chưa hiểu cần phát
triển gì" — vì về mặt chức năng, phần này hiện tại là một cột dữ liệu đẹp mà
chưa nối vào nghiệp vụ nào cả.

## 5. Các hướng có thể phát triển (đề xuất — chưa code, để bạn chọn)

Xếp theo độ phức tạp tăng dần, không phải thứ tự ưu tiên bắt buộc:

1. **Dọn nợ kỹ thuật trước tiên** — rút ngưỡng `5000000`/`15000000` và công
   thức phân hạng ra 1 hàm dùng chung (ví dụ
   `backend/src/utils/loyaltyTier.js`), thay 3 chỗ hardcode hiện tại. Không
   đổi hành vi, chỉ dọn để phát triển tiếp an toàn hơn.
2. **Lọc/hiển thị theo hạng** — thêm tham số `?loyaltyTier=` cho
   `GET /customers`, thêm bộ lọc trên `CustomersPage.jsx`, thêm số liệu
   "khách theo hạng" vào Dashboard/Reports. Việc này chỉ là hiển thị dữ
   liệu đã có, không đổi nghiệp vụ, rủi ro thấp nhất.
3. **Giảm giá tự động theo hạng** — ví dụ Gold giảm 5%, VIP giảm 10%, áp
   dụng tự động vào `calculateInvoiceTotals()` (`priceCalculator.js`) khi
   checkout, thay vì chỉ dựa vào giảm giá tay của nhân viên. Cần quyết
   định: giảm có cộng dồn với giảm giá tay nhân viên nhập không, hay hạng
   chỉ là 1 loại giảm giá khác áp cùng cơ chế `discountAmount`.
4. **Ngưỡng cấu hình được** — thay vì hardcode 5tr/15tr trong code, đưa vào
   bảng `settings` (đã có sẵn cơ chế Settings cho giờ mở cửa/giá sân) để
   admin tự chỉnh ngưỡng mà không cần deploy lại.
5. **Ưu tiên đặt sân cho VIP** — phức tạp nhất, đụng vào logic tranh chấp
   slot trong `BookingService.js` (giữ chỗ trước 1 khoảng thời gian, hoặc
   ưu tiên khi có 2 yêu cầu trùng giờ) — cần thiết kế nghiệp vụ kỹ trước khi
   đụng vào code đặt sân đang chạy ổn định.
6. **Marketing/thông báo theo hạng** — email/SMS ưu đãi riêng cho từng
   hạng. Hệ thống hiện đã có SMTP (Nodemailer, dùng cho quên mật khẩu) nên
   hạ tầng gửi mail đã có sẵn, nhưng chưa có cơ chế campaign/thông báo hàng
   loạt nào.

## 6. Gợi ý bước tiếp theo

Bản thân việc "có hạng nhưng chưa có quyền lợi" không phải lỗi — có thể bạn
chỉ mới làm xong bước đo lường và chưa tới bước quyết định thưởng gì. Nếu
muốn phát triển tiếp, việc rẻ nhất và an toàn nhất để bắt đầu là mục 1
(dọn ngưỡng thành 1 nơi) + mục 2 (hiển thị/lọc theo hạng) — 2 việc này gần
như không rủi ro và tạo nền để làm mục 3 (giảm giá tự động) sau, vốn là thứ
gần với kỳ vọng "khách VIP được lợi gì đó" nhất.
