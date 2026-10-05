'use strict';

/**
 * Đưa DB của competition-service trong bản demo công khai về đúng trạng thái một bản cài mới + dữ liệu demo:
 * XOÁ MỌI BẢNG → `db:migrate` → `seed:demo` (plan 24). Chạy sau `backend/scripts/demo-reset.js` bằng
 * .github/workflows/demo-reset.yml, vì hồ sơ thi đấu trỏ `bd:customer:<id>` của DB chính.
 *
 *   ALLOW_DEMO_SEED=true DEMO_RESET_CONFIRM=<tên DB> DB_HOST=... DB_NAME=... DB_SSL=true DB_SSL_CA=... \
 *     node scripts/demo-reset.js
 *
 * Chặn chạy nhầm vào DB thật: bắt buộc ALLOW_DEMO_SEED=true VÀ DEMO_RESET_CONFIRM bằng đúng tên DB sắp bị xoá
 * (cùng rào chắn như backend/scripts/demo-reset.js). Chạy với NODE_ENV khác production: ở production `loadConfig`
 * đòi TRUSTED_ISSUERS (để chạy service), còn việc reset chỉ cần nối DB.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const SERVICE_DIR = path.join(__dirname, '..');

/** Lỗi cấu hình, rỗng là chạy được. Hàm thuần để test. */
const findResetProblems = (env, databaseName) => {
  const problems = [];
  if (env.ALLOW_DEMO_SEED !== 'true') problems.push('ALLOW_DEMO_SEED phải là true — script này seed lại dữ liệu demo.');
  if (!databaseName) problems.push('Chưa cấu hình tên DB (DB_NAME).');
  else if (env.DEMO_RESET_CONFIRM !== databaseName) problems.push(`DEMO_RESET_CONFIRM phải bằng đúng tên DB sẽ bị xoá sạch ("${databaseName}").`);
  if (env.NODE_ENV === 'production') problems.push('Chạy script này với NODE_ENV khác production (production đòi TRUSTED_ISSUERS để chạy service).');
  return problems;
};

const run = (script, args, env) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: SERVICE_DIR, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${path.basename(script)} ${args.join(' ')} thất bại (mã thoát ${result.status}).`);
};

async function dropAllTables(db) {
  const { Sequelize } = require('sequelize');
  const { buildSequelizeOptions } = require('../src/platform/db/sequelize');
  // Một kết nối duy nhất: FOREIGN_KEY_CHECKS là biến theo phiên.
  const sequelize = new Sequelize(db.name, db.user, db.password, { ...buildSequelizeOptions(db), pool: { max: 1, min: 0, acquire: 60000, idle: 10000 } });
  try {
    const [rows] = await sequelize.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'");
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of rows) await sequelize.query(`DROP TABLE IF EXISTS \`${String(name).replace(/`/g, '``')}\``);
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    return rows.length;
  } finally {
    await sequelize.close();
  }
}

async function main() {
  require('dotenv').config({ path: path.join(SERVICE_DIR, '.env') });
  const { loadConfig } = require('../src/platform/config');
  const { db } = loadConfig();
  const problems = findResetProblems(process.env, db.name);
  if (problems.length) {
    console.error(`Không reset dữ liệu demo của competition-service:\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }
  const startedAt = Date.now();
  const seconds = () => ((Date.now() - startedAt) / 1000).toFixed(1);
  try {
    const dropped = await dropAllTables(db);
    console.log(`[cs-demo-reset] Đã xoá ${dropped} bảng của "${db.name}" (${seconds()} s).`);
    run(require.resolve('sequelize-cli/lib/sequelize'), ['db:migrate'], process.env);
    console.log(`[cs-demo-reset] Migrate xong (${seconds()} s).`);
    run(path.join(__dirname, 'seed-demo.js'), [], process.env);
    console.log(`[cs-demo-reset] Seed xong — tổng ${seconds()} s.`);
  } catch (err) {
    console.error(`[cs-demo-reset] Lỗi: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { findResetProblems };
