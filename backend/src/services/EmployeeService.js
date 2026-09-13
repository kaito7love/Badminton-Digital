const { Op } = require("sequelize");
const { Employee, User, Role, ActivityLog, sequelize } = require("../models");
const bcrypt = require("bcrypt");
const { getPagination, getPagingData } = require("../utils/pagination");
const { normalizePhone, isValidPhone } = require("../utils/phone");
const AuditService = require('./AuditService');

class EmployeeService {
  /**
   * Ai được sửa (`update`) hay xoá (`delete`) tài khoản nhân viên nào. Lọc theo
   * chi nhánh thôi là chưa đủ: quản lý chi nhánh chính từng sửa được cả tài
   * khoản admin (đổi email sang hộp thư của mình rồi "quên mật khẩu") và xoá
   * được chủ sân khỏi hệ thống.
   *
   * | Người thao tác | Sửa SĐT/vị trí/ca          | Xoá                                      |
   * |----------------|----------------------------|------------------------------------------|
   * | admin          | mọi người                  | employee, branch_manager — trừ chính mình |
   * | branch_manager | employee cùng chi nhánh    | employee cùng chi nhánh                   |
   *
   * Hàm thuần: nhận `actor`/`targetUser` đã nạp sẵn `role.name`, không chạm DB.
   * Frontend có bản sao cùng bảng ở `utils/roles.js#canManageStaff`.
   */
  static assertCanManage({ actor, targetUser, action }) {
    if (action !== "update" && action !== "delete") {
      throw new Error(`assertCanManage: action không hợp lệ "${action}"`);
    }
    const deny = (message) => {
      const error = new Error(message);
      error.statusCode = 403;
      throw error;
    };

    const actorRole = actor?.role?.name;
    const targetRole = targetUser?.role?.name;
    const isSelf = Boolean(actor?.id) && actor.id === targetUser?.id;

    if (actorRole === "admin") {
      if (action === "update") return;
      if (isSelf) deny("Không thể tự xoá tài khoản của chính mình.");
      if (targetRole === "admin") deny("Không thể xoá tài khoản admin.");
      if (!["employee", "branch_manager"].includes(targetRole)) {
        deny("Không xác định được vai trò của tài khoản này nên không xoá.");
      }
      return;
    }

    if (actorRole === "branch_manager") {
      if (isSelf) deny("Không thể tự sửa hoặc xoá tài khoản của chính mình — nhờ admin thực hiện.");
      if (targetRole !== "employee") {
        deny("Quản lý chi nhánh chỉ được sửa hoặc xoá tài khoản nhân viên, không đụng tới admin hay quản lý khác.");
      }
      return;
    }

    deny("Bạn không có quyền quản lý tài khoản nhân viên.");
  }

  /**
   * Tài khoản gắn với hồ sơ nhân viên, kèm vai trò — đọc riêng, không join vào
   * câu SELECT ... FOR UPDATE: join bảng roles vào đó là khoá luôn dòng role
   * dùng chung, mọi lượt sửa nhân viên khác phải xếp hàng chờ.
   */
  static async findAccountWithRole(userId, transaction) {
    if (!userId) return null;
    return User.findByPk(userId, {
      attributes: ["id"],
      include: [{ model: Role, as: "role", attributes: ["id", "name"] }],
      transaction,
    });
  }

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
        // `version` phải có: User bật optimistic locking, thiếu cột này thì lệnh
        // cập nhật SĐT bên dưới luôn ném OptimisticLockError.
        include: [{ model: User, as: "user", attributes: ["id", "fullName", "email", "phone", "version"] }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!employee) {
        const error = new Error("Employee not found");
        error.statusCode = 404;
        throw error;
      }
      EmployeeService.assertCanManage({
        actor: context.actor,
        targetUser: await EmployeeService.findAccountWithRole(employee.userId, transaction),
        action: "update",
      });
      const oldValues = employee.toJSON();
      await employee.update({
        position: data.position !== undefined ? data.position : employee.position,
        shift: data.shift !== undefined ? data.shift : employee.shift,
      }, { transaction });
      // Không nhận `email` nữa (validation trả 400): email là danh tính đăng nhập
      // và là nơi nhận link đặt lại mật khẩu — đổi được qua đây là chiếm được
      // tài khoản.
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
      EmployeeService.assertCanManage({
        actor: context.actor,
        targetUser: await EmployeeService.findAccountWithRole(employee.userId, transaction),
        action: "delete",
      });
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
