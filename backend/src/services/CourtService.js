const { Court, CourtSession, Customer, Booking, Employee, sequelize } = require('../models');
const { calculateCourtFee } = require('../utils/priceCalculator');
const AuditService = require('./AuditService');
const SettingService = require('./SettingService');
const CustomerService = require('./CustomerService');

const COURT_STATUSES = ['active', 'maintenance', 'inactive'];

class CourtService {
  /**
   * `state` là góc nhìn gộp dành cho giao diện: trộn vòng đời sân (status) với
   * việc sân có phiên chơi đang mở hay không. Chỉ tính toán lúc đọc, không lưu —
   * nhờ vậy không bao giờ có chuyện DB nói một đằng, phiên chơi nói một nẻo.
   */
  static formatCourt(court) {
    const plain = court.toJSON ? court.toJSON() : court;
    let state = 'AVAILABLE';
    if (plain.status === 'maintenance') {
      state = 'MAINTENANCE';
    } else if (plain.status === 'inactive') {
      state = 'INACTIVE';
    } else if (plain.sessions && plain.sessions.length > 0) {
      state = 'PLAYING';
    }
    return {
      ...plain,
      state,
    };
  }

  static unavailableReason(status) {
    if (status === 'maintenance') return 'Sân đang bảo trì';
    if (status === 'inactive') return 'Sân đã ngưng khai thác';
    return 'Sân không sẵn sàng';
  }

  static async getAllCourts(branchId = null) {
    const courts = await Court.findAll({
      where: branchId ? { branchId } : undefined,
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
    return courts.map(c => CourtService.formatCourt(c));
  }

  static async getCourtById(id, branchId = null) {
    const court = await Court.findOne({
      where: { id, ...(branchId ? { branchId } : {}) },
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
    return CourtService.formatCourt(court);
  }

  static async createCourt(data, context) {
    if (!context.branchId) {
      const error = new Error('Không xác định được chi nhánh cho sân mới');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.create({
        branchId: context.branchId,
        name: data.name,
        peakPricePerHour: data.peakPricePerHour,
        offpeakPricePerHour: data.offpeakPricePerHour,
        note: data.note || null,
        status: 'active'
      }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'court.created', targetType: 'court', targetId: court.id, newValues: court.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return CourtService.formatCourt(court);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async updateCourt(id, data, context) {
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      const oldValues = court.toJSON();
      const updated = await court.update(data, { transaction });
      await AuditService.record({ actor: context.actor, branchId: court.branchId, action: 'court.updated', targetType: 'court', targetId: court.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return CourtService.formatCourt(updated);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async deleteCourt(id, context) {
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      const activeSession = await CourtSession.findOne({ where: { courtId: id, status: 'playing' }, transaction, lock: transaction.LOCK.UPDATE });
      if (activeSession) {
        const error = new Error('Cannot delete court that is currently in use');
        error.statusCode = 400;
        throw error;
      }
      const oldValues = court.toJSON();
      await court.destroy({ transaction });
      await AuditService.record({ actor: context.actor, branchId: court.branchId, action: 'court.deleted', targetType: 'court', targetId: court.id, oldValues, requestId: context.requestId, transaction });
      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async openCourt(courtId, customerId = null, bookingId = null, guestName = null, context) {
    if (!context.branchId || !context.employeeId) {
      const error = new Error('Không xác định được nhân viên hoặc chi nhánh vận hành');
      error.statusCode = 403;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id: courtId, branchId: context.branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      if (court.status !== 'active') {
        const error = new Error(CourtService.unavailableReason(court.status));
        error.statusCode = 400;
        throw error;
      }
      const activeSession = await CourtSession.findOne({ where: { courtId, status: 'playing' }, transaction, lock: transaction.LOCK.UPDATE });
      if (activeSession) {
        const error = new Error('Court is already in use');
        error.statusCode = 400;
        throw error;
      }
      let booking = null;
      if (bookingId) {
        booking = await Booking.findOne({ where: { id: bookingId, courtId, branchId: context.branchId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!booking || !['pending', 'confirmed'].includes(booking.status)) {
          const error = new Error('Booking không hợp lệ để mở sân');
          error.statusCode = 400;
          throw error;
        }
      }
      let resolvedCustomerId = booking?.customerId || customerId || null;
      if (booking?.customerId && customerId && booking.customerId !== customerId) {
        const error = new Error('Khách hàng không khớp với booking');
        error.statusCode = 400;
        throw error;
      }
      if (resolvedCustomerId) {
        const customer = await Customer.findOne({ where: { id: resolvedCustomerId, branchId: context.branchId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!customer) {
          const error = new Error('Khách hàng không thuộc chi nhánh hiện tại');
          error.statusCode = 400;
          throw error;
        }
      } else {
        // Khách vãng lai: tạo hồ sơ khách hàng thay vì nhét tên vào bảng phiên chơi
        const walkIn = await CustomerService.resolveWalkIn({
          branchId: context.branchId,
          fullName: guestName,
          transaction
        });
        resolvedCustomerId = walkIn ? walkIn.id : null;
      }
      const session = await CourtSession.create({
        branchId: context.branchId,
        courtId,
        customerId: resolvedCustomerId,
        bookingId: booking?.id || null,
        employeeId: context.employeeId,
        startTime: new Date(),
        status: 'playing'
      }, { transaction });

      if (booking) await booking.update({ status: 'completed' }, { transaction });

      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'court.session_opened', targetType: 'court_session', targetId: session.id, newValues: session.toJSON(), requestId: context.requestId, transaction });

      await transaction.commit();
      return session;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async closeCourt(courtId, context) {
    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id: courtId, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      const activeSession = await CourtSession.findOne({ where: { courtId, branchId: court.branchId, status: 'playing' }, transaction, lock: transaction.LOCK.UPDATE });
      if (!activeSession) {
        const error = new Error('Court is not currently open/playing');
        error.statusCode = 400;
        throw error;
      }
      const oldValues = activeSession.toJSON();
      const endTime = new Date();
      const { peakStartHour, peakEndHour } = await SettingService.getPeakHours();
      const { durationSeconds, courtFee } = calculateCourtFee(
        activeSession.startTime,
        endTime,
        court.peakPricePerHour,
        court.offpeakPricePerHour,
        peakStartHour,
        peakEndHour
      );

      await activeSession.update({
        endTime,
        durationSeconds,
        courtFee,
        status: 'closed'
      }, { transaction });

      await AuditService.record({ actor: context.actor, branchId: court.branchId, action: 'court.session_closed', targetType: 'court_session', targetId: activeSession.id, oldValues, newValues: activeSession.toJSON(), requestId: context.requestId, transaction });

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

  static async transferCourt(sourceCourtId, targetCourtId, context) {
    if (Number(sourceCourtId) === Number(targetCourtId)) {
      const error = new Error('Source and target court cannot be the same');
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const courts = await Court.findAll({ where: { id: [sourceCourtId, targetCourtId], ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
      const sourceCourt = courts.find((court) => court.id === Number(sourceCourtId));
      const targetCourt = courts.find((court) => court.id === Number(targetCourtId));
      if (!sourceCourt || !targetCourt || sourceCourt.status !== 'active' || targetCourt.status !== 'active') {
        const error = new Error('Trạng thái hoặc chi nhánh sân không hợp lệ để chuyển sân');
        error.statusCode = 400;
        throw error;
      }
      const activeSession = await CourtSession.findOne({
        where: { courtId: sourceCourtId, branchId: sourceCourt.branchId, status: 'playing' },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!activeSession) {
        const error = new Error('Active session not found');
        error.statusCode = 404;
        throw error;
      }

      const targetActiveSession = await CourtSession.findOne({
        where: { courtId: targetCourtId, branchId: targetCourt.branchId, status: 'playing' },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (targetActiveSession) {
        const error = new Error('Target court is already in use');
        error.statusCode = 400;
        throw error;
      }

      const oldValues = activeSession.toJSON();
      await activeSession.update({ courtId: targetCourtId }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: sourceCourt.branchId, action: 'court.session_transferred', targetType: 'court_session', targetId: activeSession.id, oldValues, newValues: activeSession.toJSON(), requestId: context.requestId, transaction });

      await transaction.commit();
      return activeSession;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  /** Đổi vòng đời khai thác của sân: active | maintenance | inactive */
  static async updateCourtStatus(courtId, status, context) {
    if (!COURT_STATUSES.includes(status)) {
      const error = new Error(`Trạng thái sân không hợp lệ. Chỉ nhận: ${COURT_STATUSES.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const court = await Court.findOne({ where: { id: courtId, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!court) {
        const error = new Error('Court not found');
        error.statusCode = 404;
        throw error;
      }
      // Không cho ngưng khai thác sân đang có khách chơi dở
      if (status !== 'active') {
        const activeSession = await CourtSession.findOne({ where: { courtId, status: 'playing' }, transaction, lock: transaction.LOCK.UPDATE });
        if (activeSession) {
          const error = new Error('Không thể đổi trạng thái sân khi đang có phiên chơi');
          error.statusCode = 400;
          throw error;
        }
      }
      const oldValues = court.toJSON();
      const updated = await court.update({ status }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: court.branchId, action: 'court.status_changed', targetType: 'court', targetId: court.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return CourtService.formatCourt(updated);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = CourtService;
