const { Op } = require('sequelize');
const { ActivityLog, Employee, User, Branch } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');
const { startOfLocalDay, endOfLocalDay } = require('../utils/dateTime');

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

  /**
   * Nhật ký hoạt động theo chi nhánh, phân trang — khác với
   * EmployeeService.getActivityLogs (khoá cứng theo 1 employeeId), hàm này
   * phục vụ màn hình xem toàn bộ hoạt động của chi nhánh, không giới hạn
   * theo 1 nhân viên. Cùng quy ước "phải chọn chi nhánh" như
   * ReportService.requireBranch — không có khái niệm xem gộp toàn chuỗi.
   */
  static async list(query, branchId) {
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh');
      error.statusCode = 400;
      throw error;
    }
    const { page, limit, offset } = getPagination(query);
    const where = { branchId };
    if (query.action) where.action = query.action;
    if (query.targetType) where.targetType = query.targetType;
    if (query.from || query.to) {
      const branch = await Branch.findByPk(branchId, { attributes: ['timezone'] });
      where.createdAt = {};
      // Neo bằng 12:00Z rồi cắt theo giờ chi nhánh — cùng khuôn đã dùng ở
      // SessionService/ReportService/SalesOrderService/InventoryService.
      if (query.from) where.createdAt[Op.gte] = startOfLocalDay(new Date(`${query.from}T12:00:00Z`), branch?.timezone);
      if (query.to) where.createdAt[Op.lte] = endOfLocalDay(new Date(`${query.to}T12:00:00Z`), branch?.timezone);
    }

    const data = await ActivityLog.findAndCountAll({
      where,
      limit,
      offset,
      order: [['id', 'DESC']],
      include: [
        { model: Employee, as: 'employee', attributes: ['id', 'position'] },
        { model: User, as: 'user', attributes: ['id', 'fullName', 'email'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ]
    });
    return getPagingData(data, page, limit);
  }
}

module.exports = AuditService;
