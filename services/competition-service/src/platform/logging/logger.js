const pino = require('pino');

const createLogger = (config) =>
  pino({
    level: config.log.level,
    base: { service: config.serviceName, version: config.version },
    // Không bao giờ ghi token / secret ra log.
    redact: ['req.headers.authorization', '*.secret', '*.password', '*.token']
  });

// Log truy cập: method, route, status, thời gian, ai gọi — không log body.
const accessLog = (logger) => (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Number(process.hrtime.bigint() - started) / 1e6,
        sub: req.auth ? req.auth.sub : undefined,
        client: req.auth ? req.auth.issuer : undefined
      },
      'request'
    );
  });
  next();
};

module.exports = { createLogger, accessLog };
