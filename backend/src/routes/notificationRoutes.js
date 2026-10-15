const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const NotificationService = require('../services/NotificationService');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { listNotificationRules, notificationIdRules } = require('../validations/notificationValidation');

// Thông báo trong ứng dụng của KHÁCH (kế hoạch 43). Chỉ vai `customer` và chỉ của chính mình — nhân viên có
// kênh riêng (SSE booking:changed). Không cần ngữ cảnh chi nhánh: thông báo gắn với khách, dùng chung toàn chuỗi.
router.use(authMiddleware, roleMiddleware(['customer']));

const customerIdOf = (req) => req.user?.customer?.id || null;

const noProfile = (res) => errorResponse(res, 'Tài khoản khách hàng chưa có hồ sơ khách hàng', null, 403);

router.get('/', listNotificationRules, async (req, res, next) => {
  try {
    const customerId = customerIdOf(req);
    if (!customerId) return noProfile(res);
    const result = await NotificationService.list(customerId, {
      limit: Number(req.query.limit) || 20,
      unreadOnly: req.query.unread === 'true'
    });
    return successResponse(res, result, 'Notifications retrieved successfully');
  } catch (err) {
    next(err);
  }
});

// `read-all` khai báo TRƯỚC `/:id/read` để không bị bắt nhầm làm id.
router.put('/read-all', async (req, res, next) => {
  try {
    const customerId = customerIdOf(req);
    if (!customerId) return noProfile(res);
    const updated = await NotificationService.markAllRead(customerId);
    return successResponse(res, { updated }, 'Notifications marked as read');
  } catch (err) {
    next(err);
  }
});

router.put('/:id/read', notificationIdRules, async (req, res, next) => {
  try {
    const customerId = customerIdOf(req);
    if (!customerId) return noProfile(res);
    const row = await NotificationService.markRead(Number(req.params.id), customerId);
    if (!row) return errorResponse(res, 'Notification not found', null, 404);
    return successResponse(res, row, 'Notification marked as read');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
