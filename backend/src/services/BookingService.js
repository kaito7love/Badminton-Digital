const { Booking, Court, Customer, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const { getPagination, getPagingData } = require('../utils/pagination');

class BookingService {
  static async checkAvailability({ courtId, bookingDate, startTime, endTime, excludeBookingId = null }) {
    const whereCondition = {
      courtId,
      bookingDate,
      status: { [Op.in]: ['pending', 'confirmed'] },
      [Op.and]: [
        { startTime: { [Op.lt]: endTime } },
        { endTime: { [Op.gt]: startTime } }
      ]
    };

    if (excludeBookingId) {
      whereCondition.id = { [Op.ne]: excludeBookingId };
    }

    const conflictBooking = await Booking.findOne({ where: whereCondition });

    return {
      available: !conflictBooking,
      conflictBookingId: conflictBooking ? conflictBooking.id : null
    };
  }

  static async getAllBookings(query) {
    const { page, limit, offset } = getPagination(query);
    const { date, courtId, status } = query;

    const where = {};
    if (date) where.bookingDate = date;
    if (courtId) where.courtId = courtId;
    if (status) where.status = status;

    const data = await Booking.findAndCountAll({
      where,
      limit,
      offset,
      order: [['bookingDate', 'ASC'], ['startTime', 'ASC']],
      include: [
        { model: Court, as: 'court', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'fullName', 'phone'] }
      ]
    });

    return getPagingData(data, page, limit);
  }

  static async getBookingById(id) {
    const booking = await Booking.findByPk(id, {
      include: [
        { model: Court, as: 'court' },
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'username', 'email'] }
      ]
    });
    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }
    return booking;
  }

  static async createBooking(data, createdBy) {
    const { available, conflictBookingId } = await BookingService.checkAvailability({
      courtId: data.courtId,
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: data.endTime
    });

    if (!available) {
      const error = new Error('Selected court and time slot is already booked');
      error.statusCode = 409; // Conflict
      error.conflictBookingId = conflictBookingId;
      throw error;
    }

    return await Booking.create({
      courtId: data.courtId,
      customerId: data.customerId || null,
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: data.endTime,
      status: 'pending',
      createdBy
    });
  }

  static async updateBooking(id, data) {
    const booking = await Booking.findByPk(id);
    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }

    const courtId = data.courtId || booking.courtId;
    const bookingDate = data.bookingDate || booking.bookingDate;
    const startTime = data.startTime || booking.startTime;
    const endTime = data.endTime || booking.endTime;

    const { available } = await BookingService.checkAvailability({
      courtId,
      bookingDate,
      startTime,
      endTime,
      excludeBookingId: id
    });

    if (!available) {
      const error = new Error('Updated time slot conflicts with an existing booking');
      error.statusCode = 409;
      throw error;
    }

    return await booking.update(data);
  }

  static async cancelBooking(id) {
    const booking = await Booking.findByPk(id);
    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }
    return await booking.update({ status: 'cancelled' });
  }

  static async confirmBooking(id) {
    const booking = await Booking.findByPk(id);
    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }
    return await booking.update({ status: 'confirmed' });
  }
}

module.exports = BookingService;
