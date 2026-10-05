const fs = require('fs');
const { Sequelize } = require('sequelize');

// DB RIÊNG của service (mặc định `competition_service`) — không bao giờ nối vào
// DB của app chính (luật ranh giới B2).

const PEM_HEADER = '-----BEGIN CERTIFICATE-----';

// DB_SSL_CA nhận: PEM (kể cả khi ô env lưu xuống dòng thành "\n"), base64 của PEM (cách dán lên Render / GitHub
// Secrets — giống DB_SSL_CA của app chính, vì bản demo dùng chung một biến cho hai DB), hoặc đường dẫn tới file PEM.
const decodeCa = (raw) => {
  const value = String(raw).trim();
  if (value.includes(PEM_HEADER)) return value.replace(/\\n/g, '\n');
  if (/^[A-Za-z0-9+/=\s]{100,}$/.test(value)) {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    if (decoded.includes(PEM_HEADER)) return decoded;
  }
  return fs.readFileSync(value, 'utf8');
};

const sslOptions = (db) => {
  if (!db.ssl) return undefined;
  // Luôn kiểm chứng chứng chỉ server (như config/dbSsl.js của app chính).
  return { ca: db.sslCa ? decodeCa(db.sslCa) : undefined, rejectUnauthorized: true };
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

module.exports = { createSequelize, buildSequelizeOptions, sslOptions, decodeCa };
