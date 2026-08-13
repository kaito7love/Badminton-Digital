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

router.post('/', roleMiddleware(['admin', 'employee', 'customer']), createBookingRules, bookingController.createBooking);
router.put('/:id', roleMiddleware(['admin', 'employee', 'customer']), updateBookingRules, bookingController.updateBooking);
router.delete('/:id', roleMiddleware(['admin', 'employee', 'customer']), bookingController.cancelBooking);
router.put('/:id/confirm', roleMiddleware(['admin', 'employee']), bookingController.confirmBooking);

module.exports = router;
