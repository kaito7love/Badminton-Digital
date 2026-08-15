const { Op } = require("sequelize");
const { Employee, User, Role, ActivityLog, sequelize } = require("../models");
const bcrypt = require("bcrypt");
const { getPagination, getPagingData } = require("../utils/pagination");
const { normalizePhone, isValidPhone } = require("../utils/phone");
const AuditService = require('./AuditService');

class EmployeeService {
  static async getAllEmployees(query, branchId = null) {
    const { page, limit, offset } = getPagination(query);

    const data = await Employee.findAndCountAll({
      where: branchId ? { branchId } : undefined,
      limit,
      offset,
      order: [["id", "DESC"]],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "phone"],
          include: [{ model: Role, as: "role", attributes: ["id", "name"] }],
        },
      ],
    });

    return getPagingData(data, page, limit);
  }

  static async getEmployeeById(id, branchId = null) {
    const employee = await Employee.findOne({
      where: { id, ...(branchId ? { branchId } : {}) },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "phone"],
          include: [{ model: Role, as: "role", attributes: ["id", "name"] }],
        },
      ],
    });

    if (!employee) {
      const error = new Error("Employee not found");
      error.statusCode = 404;
      throw error;
    }

    return employee;
  }

  static async createEmployee(data, context) {
    if (!context.branchId) {
      const error = new Error('Không xác định được chi nhánh nhân viên');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const existingUser = await User.findOne({
        where: { email: data.email },
        transaction,
      });
      if (existingUser) {
        const error = new Error("Email already exists");
        error.statusCode = 400;
        throw error;
      }

      const phone = normalizePhone(data.phone);
      if (!isValidPhone(phone)) {
        const error = new Error("Số điện thoại nhân viên không hợp lệ");
        error.statusCode = 400;
        throw error;
      }
      const existingPhone = await User.findOne({ where: { phone }, transaction });
      if (existingPhone) {
        const error = new Error("Số điện thoại này đã có tài khoản khác");
        error.statusCode = 409;
        throw error;
      }

      const role = await Role.findOne({
        where: { name: "employee" },
        transaction,
      });
      if (!role) {
        const error = new Error('Không tìm thấy role employee');
        error.statusCode = 500;
        throw error;
      }
      const roleId = role.id;

      const passwordHash = await bcrypt.hash(data.password, 10);
      const user = await User.create(
        {
          fullName: data.fullName || data.name || "Nhân viên mới",
          email: data.email,
          phone,
          passwordHash,
          roleId,
        },
        { transaction },
      );

      const employee = await Employee.create(
        {
          userId: user.id,
          branchId: context.branchId,
          position: data.position || "Staff",
          shift: data.shift || "Full-time",
          hiredAt: data.hiredAt || new Date().toISOString().slice(0, 10),
        },
        { transaction },
      );

      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'employee.created', targetType: 'employee', targetId: employee.id, newValues: employee.toJSON(), requestId: context.requestId, transaction });

      await transaction.commit();

      return await EmployeeService.getEmployeeById(employee.id, context.branchId);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async updateEmployee(id, data, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const employee = await Employee.findOne({
        where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) },
        include: [{ model: User, as: "user" }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!employee) {
        const error = new Error("Employee not found");
        error.statusCode = 404;
        throw error;
      }
      const oldValues = employee.toJSON();
      await employee.update({
        position: data.position !== undefined ? data.position : employee.position,
        shift: data.shift !== undefined ? data.shift : employee.shift,
      }, { transaction });
      if (data.email && employee.user) await employee.user.update({ email: data.email }, { transaction });
      if (data.phone !== undefined && employee.user) {
        const phone = normalizePhone(data.phone);
        if (!isValidPhone(phone)) {
          const error = new Error("Số điện thoại nhân viên không hợp lệ");
          error.statusCode = 400;
          throw error;
        }
        const existingPhone = await User.findOne({
          where: { phone, id: { [Op.ne]: employee.user.id } },
          transaction,
        });
        if (existingPhone) {
          const error = new Error("Số điện thoại này đã có tài khoản khác");
          error.statusCode = 409;
          throw error;
        }
        await employee.user.update({ phone }, { transaction });
      }
      await AuditService.record({ actor: context.actor, branchId: employee.branchId, action: 'employee.updated', targetType: 'employee', targetId: employee.id, oldValues, newValues: employee.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return await EmployeeService.getEmployeeById(id, context.branchId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async deleteEmployee(id, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const employee = await Employee.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!employee) {
        const error = new Error("Employee not found");
        error.statusCode = 404;
        throw error;
      }
      const userId = employee.userId;
      const oldValues = employee.toJSON();
      await employee.destroy({ transaction });
      if (userId) {
        await User.destroy({ where: { id: userId }, transaction });
      }
      await AuditService.record({ actor: context.actor, branchId: employee.branchId, action: 'employee.deleted', targetType: 'employee', targetId: employee.id, oldValues, requestId: context.requestId, transaction });
      await transaction.commit();
      return true;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async getActivityLogs(employeeId, branchId = null) {
    const employee = await Employee.findOne({ where: { id: employeeId, ...(branchId ? { branchId } : {}) } });
    if (!employee) {
      const error = new Error("Employee not found");
      error.statusCode = 404;
      throw error;
    }

    return await ActivityLog.findAll({
      where: { employeeId, ...(branchId ? { branchId } : {}) },
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
  }
}

module.exports = EmployeeService;
