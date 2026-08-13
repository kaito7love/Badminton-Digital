const BookingService = require('../services/BookingService');
const { successResponse } = require('../utils/responseHandler');

const getBookings = async (req, res, next) => {
  try {
    const result = await BookingService.getAllBookings(req.query, { actor: req.user, branchId: req.branchId });
    return successResponse(res, result.rows, 'Bookings retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getBookingById = async (req, res, next) => {
  try {
    const booking = await BookingService.getBookingById(req.params.id, { actor: req.user, branchId: req.branchId });
    return successResponse(res, booking, 'Booking details retrieved');
  } catch (err) {
    next(err);
  }
};

const checkAvailability = async (req, res, next) => {
  try {
    const result = await BookingService.checkAvailability({
      courtId: req.query.courtId,
      bookingDate: req.query.bookingDate,
      startTime: req.query.startTime,
      endTime: req.query.endTime,
      branchId: req.branchId
    });
    return successResponse(res, result, 'Availability status checked');
  } catch (err) {
    next(err);
  }
};

const createBooking = async (req, res, next) => {
  try {
    const booking = await BookingService.createBooking(req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, booking, 'Booking created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const updateBooking = async (req, res, next) => {
  try {
    const updated = await BookingService.updateBooking(req.params.id, req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, updated, 'Booking updated successfully');
  } catch (err) {
    next(err);
  }
};

const cancelBooking = async (req, res, next) => {
  try {
    const cancelled = await BookingService.cancelBooking(req.params.id, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, cancelled, 'Booking cancelled successfully');
  } catch (err) {
    next(err);
  }
};

const confirmBooking = async (req, res, next) => {
  try {
    const confirmed = await BookingService.confirmBooking(req.params.id, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, confirmed, 'Booking confirmed successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBookings,
  getBookingById,
  checkAvailability,
  createBooking,
  updateBooking,
  cancelBooking,
  confirmBooking
};
