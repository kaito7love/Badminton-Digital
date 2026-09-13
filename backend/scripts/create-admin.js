'use strict';

/**
 * Tạo tài khoản admin đầu tiên cho bản cài mới — thay cho việc seed dữ liệu demo
 * (mật khẩu công khai) lên production. Chạy sau `npm run migrate`:
 *
 *   ADMIN_EMAIL=chu.san@example.com ADMIN_PASSWORD='...' ADMIN_FULL_NAME='Nguyễn Văn A' npm run create-admin
 *
 * Tuỳ chọn: ADMIN_PHONE, ADMIN_BRANCH_CODE (mặc định là chi nhánh đang hoạt động
 * có id nhỏ nhất). Tạo User role admin kèm hồ sơ Employee ở chi nhánh đó — cùng
 * cấu trúc với admin trong seed, để branchContextMiddleware có chi nhánh mặc
 * định. Từ chối nếu đã có admin đang hoạt động. Không bao giờ in mật khẩu.
 */
const path = require('path');
const { Op } = require('sequelize');
const { normalizePhone, isValidPhone } = require('../src/utils/phone');

const MIN_PASSWORD_LENGTH = 12;
// Mật khẩu các tài khoản demo đã in trong repo, trang đăng nhập, Postman và k6.
const PUBLISHED_DEMO_PASSWORDS = ['admin@123', 'manager@123', 'employee@123', 'customer@123'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kiểm đầu vào trước khi chạm DB. Hàm thuần để test được. */
const validateAdminInput = (env) => {
  const input = {
    email: String(env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: String(env.ADMIN_PASSWORD || ''),
    fullName: String(env.ADMIN_FULL_NAME || '').trim(),
    phone: env.ADMIN_PHONE ? normalizePhone(env.ADMIN_PHONE) : null,
    branchCode: env.ADMIN_BRANCH_CODE ? String(env.ADMIN_BRANCH_CODE).trim() : null
  };

  const problems = [];
  if (!EMAIL_PATTERN.test(input.email)) problems.push('ADMIN_EMAIL bắt buộc và phải là email hợp lệ.');
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`ADMIN_PASSWORD phải có tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`);
  } else if (PUBLISHED_DEMO_PASSWORDS.includes(input.password.toLowerCase())) {
    problems.push('ADMIN_PASSWORD trùng mật khẩu tài khoản demo đã công khai trong repo — chọn mật khẩu khác.');
  }
  if (!input.fullName) problems.push('ADMIN_FULL_NAME bắt buộc.');
  if (env.ADMIN_PHONE && !isValidPhone(input.phone)) {
    problems.push('ADMIN_PHONE không phải số điện thoại Việt Nam hợp lệ.');
  }

  return { input, problems };
};

// Lỗi "từ chối có chủ đích" — in nguyên văn, khác với lỗi DB bất ngờ.
const refuse = (message) => Object.assign(new Error(message), { expected: true });

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

  const { input, problems } = validateAdminInput(process.env);
  if (problems.length) {
    console.error(`Không tạo admin:\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }

  // Nạp models sau khi đã có .env — config.js đọc DB_* lúc require.
  const bcrypt = require('bcrypt');
  const { sequelize, User, Role, Employee, Branch } = require('../src/models');

  try {
    const created = await sequelize.transaction(async (transaction) => {
      const adminRole = await Role.findOne({ where: { name: 'admin' }, transaction });
      if (!adminRole) throw refuse('Chưa có role admin — chạy `npm run migrate` trước.');

      const activeAdmin = await User.findOne({
        where: { roleId: adminRole.id, isActive: true },
        attributes: ['id'],
        transaction
      });
      if (activeAdmin) {
        throw refuse(`Đã có admin đang hoạt động (user #${activeAdmin.id}). Script này chỉ dùng để tạo admin đầu tiên.`);
      }

      const branch = await Branch.findOne({
        where: { isActive: true, ...(input.branchCode ? { code: input.branchCode } : {}) },
        order: [['id', 'ASC']],
        transaction
      });
      if (!branch) {
        throw refuse(input.branchCode
          ? `Không có chi nhánh đang hoạt động với mã "${input.branchCode}".`
          : 'Chưa có chi nhánh đang hoạt động nào — chạy `npm run migrate` trước.');
      }

      // paranoid: false — UNIQUE trong DB tính cả tài khoản đã xoá mềm.
      const taken = await User.findOne({
        where: { [Op.or]: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])] },
        attributes: ['id', 'deletedAt'],
        paranoid: false,
        transaction
      });
      if (taken) {
        throw refuse(`Email hoặc số điện thoại đã thuộc về tài khoản #${taken.id}${taken.deletedAt ? ' (đã xoá mềm)' : ''}.`);
      }

      const user = await User.create({
        roleId: adminRole.id,
        email: input.email,
        phone: input.phone,
        fullName: input.fullName,
        passwordHash: await bcrypt.hash(input.password, 10),
        isActive: true
      }, { transaction });

      await Employee.create({
        userId: user.id,
        branchId: branch.id,
        position: 'Quản trị hệ thống',
        shift: 'Toàn thời gian',
        hiredAt: new Date().toISOString().slice(0, 10)
      }, { transaction });

      return { userId: user.id, email: user.email, branch };
    });

    console.log(
      `Đã tạo admin #${created.userId} (${created.email}), chi nhánh mặc định ${created.branch.code} (#${created.branch.id}).`
    );
  } catch (err) {
    console.error(`Không tạo admin: ${err.expected ? err.message : `${err.name}: ${err.message}`}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateAdminInput, MIN_PASSWORD_LENGTH };
