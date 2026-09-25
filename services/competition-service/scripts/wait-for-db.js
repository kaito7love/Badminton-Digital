// Chờ MySQL nhận kết nối (tối đa ~60 giây) — dùng trong docker-entrypoint.sh trước
// khi migrate, như backend/scripts/wait-for-db.js của app chính.
require('dotenv').config();
const mysql = require('mysql2/promise');
const { loadConfig } = require('../src/platform/config');

(async () => {
  const { db } = loadConfig();
  const ssl = db.ssl ? { ca: db.sslCa && db.sslCa.includes('BEGIN') ? db.sslCa : db.sslCa ? require('fs').readFileSync(db.sslCa, 'utf8') : undefined, rejectUnauthorized: true } : undefined;
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
