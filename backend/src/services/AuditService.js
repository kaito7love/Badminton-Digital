const { ActivityLog } = require('../models');

class AuditService {
  static async record({ actor, branchId = null, action, targetType, targetId, oldValues = null, newValues = null, requestId = null, transaction }) {
    return ActivityLog.create({
      employeeId: actor?.employee?.id || null,
      userId: actor?.id || null,
      branchId,
      action,
      targetType,
      targetId,
      oldValues,
      newValues,
      requestId
    }, { transaction });
  }
}

module.exports = AuditService;
