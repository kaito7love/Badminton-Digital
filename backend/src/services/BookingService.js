const { Booking, Court, Customer, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const { getPagination, getPagingData } = require('../utils/pagination');
const AuditService = require('./AuditService');

class BookingService {
  static async checkAvailability({ courtId, bookingDate, startTime, endTime, excludeBookingId = null, branchId = null, transaction = null }) {
    const whereCondition = {
      courtId,
      ...(branchId ? { branchId } : {}),
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

    const conflictBooking = await Booking.findOne({ where: whereCondition, transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });

    return {
      available: !conflictBooking,
      conflictBookingId: conflictBooking ? conflictBooking.id : null
    };
  }

  static async getAllBookings(query, context = {}) {
    const { page, limit, offset } = getPagination(query);
    const { date, courtId, status } = query;

    const where = {};
    if (date) where.bookingDate = date;
    if (courtId) where.courtId = courtId;
    if (status) where.status = status;
    if (context.branchId) where.branchId = context.branchId;
    if (context.actor?.role?.name === 'customer') where.customerId = context.actor.customer?.id || -1;

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

  static async getBookingById(id, context = {}) {
    const booking = await Booking.findByPk(id, {
      include: [
        { model: Court, as: 'court' },
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'email', 'fullName'] }
      ]
    });
    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }
    BookingService.assertOwnership(booking, context.actor, context.branchId);
    return booking;
  }

  static async createBooking(data, context) {
    if (data.startTime >= data.endTime) {
      const error = new Error('Giờ kết thúc phải sau giờ bắt đầu');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction({ isolationLevel: 'SERIALIZABLE' });
    try {
      const court = await Court.findByPk(data.courtId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!court || (context.branchId && court.branchId !== context.branchId)) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      const customerId = context.actor?.role?.name === 'customer' ? context.actor.customer?.id : (data.customerId || null);
      if (context.actor?.role?.name === 'customer' && !customerId) {
        const error = new Error('Tài khoản khách hàng chưa có hồ sơ khách hàng');
        error.statusCode = 403;
        throw error;
      }
      const { available, conflictBookingId } = await BookingService.checkAvailability({ courtId: data.courtId, bookingDate: data.bookingDate, startTime: data.startTime, endTime: data.endTime, branchId: court.branchId, transaction });
      if (!available) {
        const error = new Error('Selected court and time slot is already booked');
        error.statusCode = 409;
        error.conflictBookingId = conflictBookingId;
        throw error;
      }
      const booking = await Booking.create({ courtId: data.courtId, branchId: court.branchId, customerId, bookingDate: data.bookingDate, startTime: data.startTime, endTime: data.endTime, status: 'pending', createdBy: context.actor.id }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: court.branchId, action: 'booking.created', targetType: 'booking', targetId: booking.id, newValues: booking.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return booking;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async updateBooking(id, data, context) {
    const transaction = await sequelize.transaction({ isolationLevel: 'SERIALIZABLE' });
    try {
      const booking = await Booking.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!booking) {
        const error = new Error('Booking not found');
        error.statusCode = 404;
        throw error;
      }
      BookingService.assertOwnership(booking, context.actor, context.branchId);
      if (context.actor?.role?.name === 'customer' && data.customerId !== undefined && data.customerId !== booking.customerId) {
        const error = new Error('Khách hàng không thể chuyển booking sang hồ sơ khác');
        error.statusCode = 403;
        throw error;
      }
      if (!['pending', 'confirmed'].includes(booking.status)) {
        const error = new Error('Booking ở trạng thái hiện tại không thể chỉnh sửa');
        error.statusCode = 400;
        throw error;
      }
      const courtId = data.courtId || booking.courtId;
      const bookingDate = data.bookingDate || booking.bookingDate;
      const startTime = data.startTime || booking.startTime;
      const endTime = data.endTime || booking.endTime;
      if (startTime >= endTime) {
        const error = new Error('Giờ kết thúc phải sau giờ bắt đầu');
        error.statusCode = 400;
        throw error;
      }
      const court = await Court.findOne({ where: { id: courtId, branchId: booking.branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      const { available } = await BookingService.checkAvailability({ courtId, bookingDate, startTime, endTime, excludeBookingId: id, branchId: booking.branchId, transaction });
      if (!available) {
        const error = new Error('Updated time slot conflicts with an existing booking');
        error.statusCode = 409;
        throw error;
      }
      const oldValues = booking.toJSON();
      const updated = await booking.update(data, { transaction });
      await AuditService.record({ actor: context.actor, branchId: booking.branchId, action: 'booking.updated', targetType: 'booking', targetId: booking.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async cancelBooking(id, context) {
    const booking = await Booking.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) } });
    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }
    BookingService.assertOwnership(booking, context.actor, context.branchId);
    if (!['pending', 'confirmed'].includes(booking.status)) {
      const error = new Error('Booking ở trạng thái hiện tại không thể hủy');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const oldValues = booking.toJSON();
      const updated = await booking.update({ status: 'cancelled' }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: booking.branchId, action: 'booking.cancelled', targetType: 'booking', targetId: booking.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async confirmBooking(id, context) {
    const booking = await Booking.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) } });
    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }
    if (booking.status !== 'pending') {
      const error = new Error('Chỉ có thể xác nhận booking đang chờ');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const oldValues = booking.toJSON();
      const updated = await booking.update({ status: 'confirmed' }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: booking.branchId, action: 'booking.confirmed', targetType: 'booking', targetId: booking.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static assertOwnership(booking, actor, branchId) {
    if (branchId && booking.branchId !== branchId) {
      const error = new Error('Booking không thuộc chi nhánh hiện tại');
      error.statusCode = 403;
      throw error;
    }
    if (actor?.role?.name === 'customer' && booking.customerId !== actor.customer?.id) {
      const error = new Error('Bạn không có quyền truy cập booking này');
      error.statusCode = 403;
      throw error;
    }
  }
}

module.exports = BookingService;
