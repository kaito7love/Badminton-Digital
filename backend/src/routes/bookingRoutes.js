const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  createBookingRules,
  updateBookingRules,
  checkAvailabilityRules
} = require('../validations/bookingValidation');

router.use(authMiddleware, branchContextMiddleware);

router.get('/', bookingController.getBookings);
router.get('/availability', checkAvailabilityRules, bookingController.checkAvailability);
router.get('/:id', bookingController.getBookingById);

router.post('/', roleMiddleware(['admin', 'branch_manager', 'employee', 'customer']), createBookingRules, bookingController.createBooking);
// Khách không tự sửa lịch: muốn đổi thì huỷ rồi đặt lại, như trang "Lịch của tôi".
router.put('/:id', roleMiddleware(['admin', 'branch_manager', 'employee']), updateBookingRules, bookingController.updateBooking);
router.delete('/:id', roleMiddleware(['admin', 'branch_manager', 'employee', 'customer']), bookingController.cancelBooking);
router.put('/:id/confirm', roleMiddleware(['admin', 'branch_manager', 'employee']), bookingController.confirmBooking);

module.exports = router;
