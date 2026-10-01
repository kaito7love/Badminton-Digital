require('dotenv').config();
const { loadConfig } = require('./platform/config');
const { createLogger } = require('./platform/logging/logger');
const { createSequelize } = require('./platform/db/sequelize');
const { defineModels } = require('./db');
const { createApp } = require('./app');

const main = async () => {
  const config = loadConfig();
  const logger = createLogger(config);
  const sequelize = createSequelize(config.db, logger);
  await sequelize.authenticate();
  const models = defineModels(sequelize);
  const { app, dispatcher, scheduler, sse } = createApp({ config, sequelize, models, logger });

  const server = app.listen(config.http.port, config.http.host, () => {
    logger.info({ host: config.http.host, port: config.http.port, env: config.env }, 'competition-service started');
  });
  if (config.events.dispatcherEnabled) dispatcher.start(config.events.pollMs);
  if (config.jobs.enabled) scheduler.start();

  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    dispatcher.stop();
    scheduler.stop();
    // Luồng TV giữ kết nối mở — đóng trước, nếu không server.close chờ tới lúc bị giết.
    sse.closeAll();
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[competition-service] Không khởi động được: ${err.message}`);
  process.exit(1);
});
