const fs = require('fs');
const path = require('path');
const express = require('express');
const { QueryTypes } = require('sequelize');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

// /health/live: process còn sống. /health/ready: DB trả lời VÀ đã chạy hết
// migration — chưa đủ thì 503 để orchestrator không đẩy traffic vào.
const createHealthRouter = ({ sequelize, config }) => {
  const router = express.Router();
  const expected = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.js')).length;

  router.get('/health/live', (req, res) => res.json({ status: 'ok', service: config.serviceName, version: config.version }));

  router.get('/health/ready', async (req, res) => {
    try {
      await sequelize.authenticate();
      const [{ count }] = await sequelize.query('SELECT COUNT(*) AS count FROM SequelizeMeta', { type: QueryTypes.SELECT });
      if (Number(count) < expected) {
        return res.status(503).json({ status: 'not_ready', reason: `Còn ${expected - Number(count)} migration chưa chạy` });
      }
      return res.json({ status: 'ready', migrations: Number(count) });
    } catch (err) {
      return res.status(503).json({ status: 'not_ready', reason: 'Không kết nối được DB' });
    }
  });

  return router;
};

module.exports = { createHealthRouter };
