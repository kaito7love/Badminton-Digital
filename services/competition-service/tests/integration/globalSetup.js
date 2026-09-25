// Dựng DB test sạch (competition_service_test) bằng chính migration của service:
// xoá hết bảng → migrate lại. Chạy một lần trước mọi file integration.
const { execFileSync } = require('child_process');
const path = require('path');
const mysql = require('mysql2/promise');

module.exports = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const dbName = process.env.TEST_DB_NAME || 'competition_service_test';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  execFileSync(process.execPath, [require.resolve('sequelize-cli/lib/sequelize'), 'db:migrate'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, DB_NAME: dbName, NODE_ENV: 'test' },
    stdio: 'pipe'
  });
};
