const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  listBookingsRules,
  createBookingRules,
  updateBookingRules,
  checkAvailabilityRules
} = require('../validations/bookingValidation');

// Chặn vòng lặp giữ chỗ hàng loạt của một tài khoản khách (báo cáo 40, F3c): 20 lượt / 10 phút, khoá theo USER —
// không theo IP vì cả sân dùng chung Wi-Fi. Nhân viên (đặt hộ liên tục ở quầy) không bị giới hạn.
const customerBookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.id}`,
  skip: (req) => req.user?.role?.name !== 'customer',
  handler: (req, res) => res.status(429).json({
    success: false,
    data: null,
    message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
    errors: null
  })
});

router.use(authMiddleware, branchContextMiddleware);

router.get('/', listBookingsRules, bookingController.getBookings);
router.get('/availability', checkAvailabilityRules, bookingController.checkAvailability);
router.get('/:id', bookingController.getBookingById);

router.post('/', roleMiddleware(['admin', 'branch_manager', 'employee', 'customer']), customerBookingLimiter, createBookingRules, bookingController.createBooking);
// Khách không tự sửa lịch: muốn đổi thì huỷ rồi đặt lại, như trang "Lịch của tôi".
router.put('/:id', roleMiddleware(['admin', 'branch_manager', 'employee']), updateBookingRules, bookingController.updateBooking);
router.delete('/:id', roleMiddleware(['admin', 'branch_manager', 'employee', 'customer']), bookingController.cancelBooking);
router.put('/:id/confirm', roleMiddleware(['admin', 'branch_manager', 'employee']), bookingController.confirmBooking);

module.exports = router;
