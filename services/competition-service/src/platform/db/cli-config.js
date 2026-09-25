// Cấu hình cho sequelize-cli (npm run migrate). Dùng chung loadConfig với service.
require('dotenv').config();
const { loadConfig } = require('../config');
const { buildSequelizeOptions } = require('./sequelize');

const { db } = loadConfig();
const common = {
  username: db.user,
  password: db.password,
  database: db.name,
  ...buildSequelizeOptions(db),
  migrationStorageTableName: 'SequelizeMeta'
};

module.exports = { development: common, test: common, production: common };
