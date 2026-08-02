const { Employee, User, Role, ActivityLog, sequelize } = require('../models');
const bcrypt = require('bcrypt');
const { getPagination, getPagingData } = require('../utils/pagination');

class EmployeeService {
  static async getAllEmployees(query) {
    const { page, limit, offset } = getPagination(query);

    const data = await Employee.findAndCountAll({
      limit,
      offset,
      order: [['id', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email'],
          include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }]
        }
      ]
    });

    return getPagingData(data, page, limit);
  }

  static async getEmployeeById(id) {
    const employee = await Employee.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email'],
          include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }]
        }
      ]
    });

    if (!employee) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      throw error;
    }

    return employee;
  }

  static async createEmployee(data) {
    const transaction = await sequelize.transaction();
    try {
      const existingUser = await User.findOne({
        where: { username: data.username },
        transaction
      });
      if (existingUser) {
        const error = new Error('Username already exists');
        error.statusCode = 400;
        throw error;
      }

      const role = await Role.findOne({ where: { name: 'employee' }, transaction });
      const roleId = role ? role.id : 2;

      const passwordHash = await bcrypt.hash(data.password, 10);
      const user = await User.create({
        username: data.username,
        email: data.email,
        passwordHash,
        roleId
      }, { transaction });

      const employee = await Employee.create({
        userId: user.id,
        position: data.position || 'Staff',
        shift: data.shift || 'Full-time',
        hiredAt: data.hiredAt || new Date().toISOString().slice(0, 10)
      }, { transaction });

      await transaction.commit();

      return await EmployeeService.getEmployeeById(employee.id);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async updateEmployee(id, data) {
    const employee = await Employee.findByPk(id, { include: [{ model: User, as: 'user' }] });
    if (!employee) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      throw error;
    }

    await employee.update({
      position: data.position !== undefined ? data.position : employee.position,
      shift: data.shift !== undefined ? data.shift : employee.shift
    });

    if (data.email && employee.user) {
      await employee.user.update({ email: data.email });
    }

    return await EmployeeService.getEmployeeById(id);
  }

  static async deleteEmployee(id) {
    const employee = await Employee.findByPk(id);
    if (!employee) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const userId = employee.userId;
      await employee.destroy({ transaction });
      if (userId) {
        await User.destroy({ where: { id: userId }, transaction });
      }
      await transaction.commit();
      return true;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async getActivityLogs(employeeId) {
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      throw error;
    }

    return await ActivityLog.findAll({
      where: { employeeId },
      order: [['createdAt', 'DESC']],
      limit: 100
    });
  }
}

module.exports = EmployeeService;
