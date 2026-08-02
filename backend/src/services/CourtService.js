const { Court, CourtSession, Customer, Booking, Employee, sequelize } = require('../models');
const { calculateCourtFee } = require('../utils/priceCalculator');

class CourtService {
  static async getAllCourts() {
    return await Court.findAll({
      order: [['id', 'ASC']],
      include: [
        {
          model: CourtSession,
          as: 'sessions',
          where: { status: 'playing' },
          required: false,
          include: [
            { model: Customer, as: 'customer', attributes: ['id', 'fullName', 'phone'] }
          ]
        }
      ]
    });
  }

  static async getCourtById(id) {
    const court = await Court.findByPk(id, {
      include: [
        {
          model: CourtSession,
          as: 'sessions',
          where: { status: 'playing' },
          required: false,
          include: [
            { model: Customer, as: 'customer', attributes: ['id', 'fullName', 'phone'] }
          ]
        }
      ]
    });
    if (!court) {
      const error = new Error('Court not found');
      error.statusCode = 404;
      throw error;
    }
    return court;
  }

  static async createCourt(data) {
    return await Court.create({
      name: data.name,
      peakPricePerHour: data.peakPricePerHour,
      offpeakPricePerHour: data.offpeakPricePerHour,
      note: data.note || null,
      status: 'empty'
    });
  }

  static async updateCourt(id, data) {
    const court = await Court.findByPk(id);
    if (!court) {
      const error = new Error('Court not found');
      error.statusCode = 404;
      throw error;
    }
    return await court.update(data);
  }

  static async deleteCourt(id) {
    const court = await Court.findByPk(id);
    if (!court) {
      const error = new Error('Court not found');
      error.statusCode = 404;
      throw error;
    }
    if (court.status === 'playing') {
      const error = new Error('Cannot delete court that is currently in use');
      error.statusCode = 400;
      throw error;
    }
    await court.destroy();
    return true;
  }

  static async openCourt(courtId, customerId = null, bookingId = null, employeeId = 1) {
    const court = await Court.findByPk(courtId);
    if (!court) {
      const error = new Error('Court not found');
      error.statusCode = 404;
      throw error;
    }
    if (court.status === 'maintenance') {
      const error = new Error('Court is currently under maintenance');
      error.statusCode = 400;
      throw error;
    }
    if (court.status === 'playing') {
      const error = new Error('Court is already in use');
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      // Create session
      const session = await CourtSession.create({
        courtId,
        customerId: customerId || null,
        bookingId: bookingId || null,
        employeeId,
        startTime: new Date(),
        status: 'playing'
      }, { transaction });

      // Update court status
      await court.update({ status: 'playing' }, { transaction });

      if (bookingId) {
        await Booking.update({ status: 'completed' }, { where: { id: bookingId }, transaction });
      }

      await transaction.commit();
      return session;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async closeCourt(courtId) {
    const court = await Court.findByPk(courtId);
    if (!court) {
      const error = new Error('Court not found');
      error.statusCode = 404;
      throw error;
    }
    if (court.status !== 'playing') {
      const error = new Error('Court is not currently open/playing');
      error.statusCode = 400;
      throw error;
    }

    const activeSession = await CourtSession.findOne({
      where: { courtId, status: 'playing' }
    });

    if (!activeSession) {
      const error = new Error('Active session not found for this court');
      error.statusCode = 404;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const endTime = new Date();
      const { durationSeconds, courtFee } = calculateCourtFee(
        activeSession.startTime,
        endTime,
        court.peakPricePerHour,
        court.offpeakPricePerHour
      );

      await activeSession.update({
        endTime,
        durationSeconds,
        courtFee,
        status: 'closed'
      }, { transaction });

      await court.update({ status: 'empty' }, { transaction });

      await transaction.commit();

      return {
        sessionId: activeSession.id,
        courtId: court.id,
        startTime: activeSession.startTime,
        endTime,
        durationSeconds,
        courtFee
      };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async transferCourt(sourceCourtId, targetCourtId) {
    if (sourceCourtId === targetCourtId) {
      const error = new Error('Source and target court cannot be the same');
      error.statusCode = 400;
      throw error;
    }

    const sourceCourt = await Court.findByPk(sourceCourtId);
    const targetCourt = await Court.findByPk(targetCourtId);

    if (!sourceCourt || !targetCourt) {
      const error = new Error('Source or target court not found');
      error.statusCode = 404;
      throw error;
    }

    if (sourceCourt.status !== 'playing') {
      const error = new Error('Source court is not currently in use');
      error.statusCode = 400;
      throw error;
    }

    if (targetCourt.status !== 'empty') {
      const error = new Error('Target court is not empty');
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const activeSession = await CourtSession.findOne({
        where: { courtId: sourceCourtId, status: 'playing' },
        transaction
      });

      if (!activeSession) {
        const error = new Error('Active session not found');
        error.statusCode = 404;
        throw error;
      }

      await activeSession.update({ courtId: targetCourtId }, { transaction });
      await sourceCourt.update({ status: 'empty' }, { transaction });
      await targetCourt.update({ status: 'playing' }, { transaction });

      await transaction.commit();
      return activeSession;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async toggleMaintenance(courtId, isMaintenance) {
    const court = await Court.findByPk(courtId);
    if (!court) {
      const error = new Error('Court not found');
      error.statusCode = 404;
      throw error;
    }
    if (court.status === 'playing') {
      const error = new Error('Cannot put a playing court into maintenance');
      error.statusCode = 400;
      throw error;
    }

    const newStatus = isMaintenance ? 'maintenance' : 'empty';
    return await court.update({ status: newStatus });
  }
}

module.exports = CourtService;
