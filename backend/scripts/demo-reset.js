'use strict';

/**
 * Đưa DB của bản demo công khai về đúng trạng thái một bản cài mới:
 * XOÁ MỌI BẢNG → `db:migrate` → `db:seed:all`.
 *
 * Chạy hằng đêm bằng .github/workflows/demo-reset.yml (runner GitHub nối thẳng
 * vào DB, app không có endpoint reset nào), hoặc bằng tay khi cần:
 *
 *   NODE_ENV=production ALLOW_DEMO_SEED=true DEMO_RESET_CONFIRM=<tên DB> \
 *     DEMO_ADMIN_PASSWORD='...' DB_HOST=... DB_SSL=true DB_SSL_CA=... node scripts/demo-reset.js
 *
 * Không dùng `db:migrate:undo:all`: nhiều `down()` không đảo được và chuỗi undo
 * dừng giữa chừng ở 20260814100004 (DATA-02) — xoá bảng rồi migrate lại mới
 * chắc chắn ra đúng schema hiện tại.
 *
 * Chặn chạy nhầm vào DB thật: bắt buộc ALLOW_DEMO_SEED=true VÀ DEMO_RESET_CONFIRM
 * bằng đúng tên DB sắp bị xoá. Mật khẩu admin được kiểm TRƯỚC khi xoá, để không
 * có chuyện xoá xong mới phát hiện seeder từ chối chạy.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND_DIR = path.join(__dirname, '..');

/** Lỗi cấu hình, rỗng là chạy được. Hàm thuần để test. */
const findResetProblems = (env, databaseName) => {
  const problems = [];
  if (env.ALLOW_DEMO_SEED !== 'true') {
    problems.push('ALLOW_DEMO_SEED phải là true — script này seed lại dữ liệu demo.');
  }
  if (!databaseName) {
    problems.push('Chưa cấu hình tên DB (DB_NAME).');
  } else if (env.DEMO_RESET_CONFIRM !== databaseName) {
    problems.push(`DEMO_RESET_CONFIRM phải bằng đúng tên DB sẽ bị xoá sạch ("${databaseName}").`);
  }
  try {
    const { resolveDemoAdminPassword } = require('../src/utils/demoSeedGuard');
    resolveDemoAdminPassword(env);
  } catch (err) {
    problems.push(err.message);
  }
  return problems;
};

const runCli = (args, env) => {
  const cli = require.resolve('sequelize-cli/lib/sequelize');
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: BACKEND_DIR, env, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`sequelize-cli ${args.join(' ')} thất bại (mã thoát ${result.status}).`);
  }
};

async function dropAllTables(config) {
  const { Sequelize } = require('sequelize');
  // Một kết nối duy nhất: FOREIGN_KEY_CHECKS là biến theo phiên, pool nhiều kết
  // nối thì lệnh DROP có thể chạy trên kết nối chưa tắt kiểm tra khoá ngoại.
  const sequelize = new Sequelize(config.database, config.username, config.password, {
    ...config,
    logging: false,
    pool: { max: 1, min: 0, acquire: 60000, idle: 10000 }
  });
  try {
    const [rows] = await sequelize.query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
    );
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of rows) {
      await sequelize.query(`DROP TABLE IF EXISTS \`${String(name).replace(/`/g, '``')}\``);
    }
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    return rows.length;
  } finally {
    await sequelize.close();
  }
}

async function main() {
  require('dotenv').config({ path: path.join(BACKEND_DIR, '.env') });
  const envName = process.env.NODE_ENV || 'development';
  const config = require('../src/config/config.js')[envName];

  const problems = findResetProblems(process.env, config && config.database);
  if (problems.length) {
    console.error(`Không reset dữ liệu demo:\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  const seconds = () => ((Date.now() - startedAt) / 1000).toFixed(1);
  try {
    const dropped = await dropAllTables(config);
    console.log(`[demo-reset] Đã xoá ${dropped} bảng của "${config.database}" (${seconds()} s).`);
    runCli(['db:migrate'], process.env);
    console.log(`[demo-reset] Migrate xong (${seconds()} s).`);
    runCli(['db:seed:all'], process.env);
    console.log(`[demo-reset] Seed xong — tổng ${seconds()} s.`);
  } catch (err) {
    console.error(`[demo-reset] Lỗi: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { findResetProblems };
