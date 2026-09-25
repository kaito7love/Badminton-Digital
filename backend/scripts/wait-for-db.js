'use strict';

/**
 * Chờ DB nhận kết nối rồi mới migrate (docker-entrypoint.sh gọi trước
 * `db:migrate`). Không chờ thì lúc DB còn khởi động — MySQL trong compose vừa
 * init xong, hay DB managed vừa được bật lại — migrate gặp ECONNREFUSED, container
 * thoát và restart liên tục.
 *
 * Chỉ thử KẾT NỐI lại; lỗi của chính migration thì không retry (entrypoint chạy
 * migrate đúng một lần, lỗi là dừng).
 */
const path = require('path');

const ATTEMPTS = Number(process.env.DB_WAIT_ATTEMPTS || 30);
const DELAY_MS = Number(process.env.DB_WAIT_DELAY_MS || 2000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { Sequelize } = require('sequelize');
  const config = require('../src/config/config.js')[process.env.NODE_ENV || 'development'];

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const sequelize = new Sequelize(config.database, config.username, config.password, {
      ...config,
      logging: false,
      pool: { max: 1, min: 0, acquire: 10000, idle: 1000 }
    });
    try {
      await sequelize.authenticate();
      console.log(`[wait-for-db] DB sẵn sàng (lần thử ${attempt}).`);
      return;
    } catch (err) {
      console.log(`[wait-for-db] Chưa kết nối được DB (lần ${attempt}/${ATTEMPTS}): ${err.message}`);
      if (attempt === ATTEMPTS) {
        process.exitCode = 1;
        return;
      }
      await sleep(DELAY_MS);
    } finally {
      await sequelize.close().catch(() => {});
    }
  }
}

main();
