const { isWebhookConfigured, webhookSecretMatches } = require('../utils/paymentConfig');

/**
 * Chốt chặn của `POST /payments/webhook` — route công khai duy nhất đổi được
 * trạng thái tiền. Chạy TRƯỚC validation, để request không có secret không đọc
 * được hợp đồng body qua các thông báo lỗi 400.
 *
 * - Chưa cấu hình `PAYMENT_WEBHOOK_SECRET` (hoặc ngắn hơn 32 ký tự): 503 ở mọi
 *   môi trường. Trước đây thiếu secret nghĩa là cho qua hết — ai gửi
 *   `{ "status": "paid", "invoiceNo": "BD-1-…" }` cũng biến đơn chuyển khoản
 *   thành đã trả.
 * - Thiếu hoặc sai header `X-Webhook-Secret`: 401.
 */
const paymentWebhookAuth = (req, res, next) => {
  if (!isWebhookConfigured()) {
    return res.status(503).json({
      success: false,
      data: null,
      message: 'Webhook thanh toán chưa được cấu hình',
      errors: null
    });
  }
  if (!webhookSecretMatches(req.get('X-Webhook-Secret'))) {
    return res.status(401).json({
      success: false,
      data: null,
      message: 'Webhook không hợp lệ',
      errors: null
    });
  }
  next();
};

module.exports = paymentWebhookAuth;
