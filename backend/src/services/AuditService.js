const { ActivityLog } = require('../models');

const SENSITIVE_KEYS = new Set(['passwordHash', 'password', 'refreshToken']);

const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        SENSITIVE_KEYS.has(key) ? undefined : redact(val)
      ]).filter(([, val]) => val !== undefined)
    );
  }
  return value;
};

class AuditService {
  static async record({ actor, branchId = null, action, targetType, targetId, oldValues = null, newValues = null, requestId = null, transaction }) {
    return ActivityLog.create({
      employeeId: actor?.employee?.id || null,
      userId: actor?.id || null,
      branchId,
      action,
      targetType,
      targetId,
      oldValues: redact(oldValues),
      newValues: redact(newValues),
      requestId
    }, { transaction });
  }
}

module.exports = AuditService;
