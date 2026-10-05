// Chờ MySQL nhận kết nối (tối đa ~60 giây) — dùng trong docker-entrypoint.sh trước
// khi migrate, như backend/scripts/wait-for-db.js của app chính.
require('dotenv').config();
const mysql = require('mysql2/promise');
const { loadConfig } = require('../src/platform/config');
const { sslOptions } = require('../src/platform/db/sequelize');

(async () => {
  const { db } = loadConfig();
  const ssl = sslOptions(db);
  for (let i = 1; i <= 30; i += 1) {
    try {
      const conn = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password, database: db.name, ssl });
      await conn.end();
      console.log(`[wait-for-db] DB ${db.name} sẵn sàng`);
      return;
    } catch (err) {
      console.log(`[wait-for-db] lần ${i}: ${err.code || err.message} — thử lại sau 2 giây`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('[wait-for-db] Hết thời gian chờ DB');
  process.exit(1);
})();
