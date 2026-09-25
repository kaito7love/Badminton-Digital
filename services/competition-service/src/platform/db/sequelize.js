const fs = require('fs');
const { Sequelize } = require('sequelize');

// DB RIÊNG của service (mặc định `competition_service`) — không bao giờ nối vào
// DB của app chính (luật ranh giới B2).

const sslOptions = (db) => {
  if (!db.ssl) return undefined;
  // Luôn kiểm chứng chứng chỉ server (như config/dbSsl.js của app chính).
  const ca = db.sslCa ? (db.sslCa.includes('BEGIN CERTIFICATE') ? db.sslCa : fs.readFileSync(db.sslCa, 'utf8')) : undefined;
  return { ca, rejectUnauthorized: true };
};

const buildSequelizeOptions = (db, logger) => ({
  host: db.host,
  port: db.port,
  dialect: 'mysql',
  timezone: '+00:00',
  logging: db.logging && logger ? (sql) => logger.debug({ sql }, 'sql') : false,
  dialectOptions: { decimalNumbers: true, ssl: sslOptions(db), charset: 'utf8mb4' },
  define: { underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  pool: { max: 10, min: 0, idle: 10000, acquire: 30000 }
});

const createSequelize = (db, logger) => new Sequelize(db.name, db.user, db.password, buildSequelizeOptions(db, logger));

module.exports = { createSequelize, buildSequelizeOptions };
