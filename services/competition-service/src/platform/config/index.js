const fs = require('fs');

// Đọc + kiểm tra cấu hình một lần lúc khởi động. Sai là ném lỗi ngay — service
// không chạy nửa vời với cấu hình thiếu (cùng tinh thần jwtSecrets của app chính).

const MIN_SECRET_LENGTH = 32;

class ConfigError extends Error {}

const parseJsonEnv = (env, name, fallback) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`${name} không phải JSON hợp lệ: ${err.message}`);
  }
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
};

const parseIntEnv = (env, name, fallback) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new ConfigError(`${name} phải là số nguyên`);
  return n;
};

// TRUSTED_ISSUERS: [{ issuer, jwks: { keys: [...] } }] — khoá CÔNG KHAI của bên
// được phép ký service token. TRUSTED_ISSUERS_FILE trỏ tới file JSON cùng dạng.
const loadTrustedIssuers = (env) => {
  let issuers = parseJsonEnv(env, 'TRUSTED_ISSUERS', null);
  if (!issuers && env.TRUSTED_ISSUERS_FILE) {
    try {
      issuers = JSON.parse(fs.readFileSync(env.TRUSTED_ISSUERS_FILE, 'utf8'));
    } catch (err) {
      throw new ConfigError(`Không đọc được TRUSTED_ISSUERS_FILE: ${err.message}`);
    }
  }
  issuers = issuers || [];
  if (!Array.isArray(issuers)) throw new ConfigError('TRUSTED_ISSUERS phải là mảng');
  for (const item of issuers) {
    if (!item || typeof item.issuer !== 'string' || !item.jwks || !Array.isArray(item.jwks.keys)) {
      throw new ConfigError('Mỗi phần tử TRUSTED_ISSUERS cần { issuer, jwks: { keys: [...] } }');
    }
    for (const key of item.jwks.keys) {
      if (key.d) throw new ConfigError(`TRUSTED_ISSUERS (${item.issuer}) chứa khoá BÍ MẬT — chỉ được đưa khoá công khai`);
    }
  }
  return issuers;
};

const checkSecrets = (list, name) => {
  if (!Array.isArray(list)) throw new ConfigError(`${name} phải là mảng`);
  for (const item of list) {
    if (!item || typeof item.secret !== 'string' || item.secret.length < MIN_SECRET_LENGTH) {
      throw new ConfigError(`${name}: mỗi mục cần secret ≥ ${MIN_SECRET_LENGTH} ký tự`);
    }
  }
  return list;
};

const loadConfig = (env = process.env) => {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const config = {
    env: nodeEnv,
    isProduction,
    serviceName: 'competition-service',
    version: require('../../../package.json').version,
    http: {
      host: env.HOST || '127.0.0.1',
      port: parseIntEnv(env, 'PORT', 5100),
      docsEnabled: parseBool(env.DOCS_ENABLED, !isProduction),
      validateResponses: parseBool(env.OPENAPI_VALIDATE_RESPONSES, false),
      trustProxyHops: parseIntEnv(env, 'TRUST_PROXY_HOPS', 0)
    },
    db: {
      host: env.DB_HOST || '127.0.0.1',
      port: parseIntEnv(env, 'DB_PORT', 3306),
      name: env.DB_NAME || 'competition_service',
      user: env.DB_USER || 'root',
      password: env.DB_PASSWORD || '',
      ssl: parseBool(env.DB_SSL, false),
      sslCa: env.DB_SSL_CA || null,
      logging: parseBool(env.DB_LOGGING, false)
    },
    auth: {
      audience: env.SERVICE_AUDIENCE || 'competition-service',
      trustedIssuers: loadTrustedIssuers(env),
      maxTokenLifetimeSeconds: parseIntEnv(env, 'MAX_TOKEN_LIFETIME_SECONDS', 300),
      clockToleranceSeconds: 30
    },
    events: {
      // Hệ thống được phép gửi sự kiện vào POST /v1/events: [{ source, secret, tenant }]
      inboundSources: checkSecrets(parseJsonEnv(env, 'INBOUND_SOURCES', []), 'INBOUND_SOURCES'),
      // Nơi nhận sự kiện của service: [{ name, url, secret, types: ["competition.*"] }]
      webhookTargets: checkSecrets(parseJsonEnv(env, 'WEBHOOK_TARGETS', []), 'WEBHOOK_TARGETS'),
      dispatcherEnabled: parseBool(env.OUTBOX_ENABLED, true),
      pollMs: parseIntEnv(env, 'OUTBOX_POLL_MS', 5000),
      deliveryTimeoutMs: parseIntEnv(env, 'OUTBOX_TIMEOUT_MS', 5000),
      // Kiểm payload sự kiện theo JSON Schema trước khi ghi outbox — bật ở dev/test.
      validatePayloads: parseBool(env.EVENTS_VALIDATE, !isProduction),
      signatureToleranceSeconds: 300
    },
    jobs: {
      enabled: parseBool(env.JOBS_ENABLED, true),
      // Ảnh chụp BXH hằng ngày lúc SNAPSHOT_HOUR giờ theo SNAPSHOT_UTC_OFFSET_MINUTES (mặc định +07:00)
      snapshotHour: parseIntEnv(env, 'SNAPSHOT_HOUR', 3),
      snapshotUtcOffsetMinutes: parseIntEnv(env, 'SNAPSHOT_UTC_OFFSET_MINUTES', 420)
    },
    log: {
      level: env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info')
    }
  };

  for (const target of config.events.webhookTargets) {
    if (!target.url || !Array.isArray(target.types)) {
      throw new ConfigError('WEBHOOK_TARGETS: mỗi mục cần { name, url, secret, types }');
    }
  }
  for (const source of config.events.inboundSources) {
    if (!source.source || !source.tenant) {
      throw new ConfigError('INBOUND_SOURCES: mỗi mục cần { source, secret, tenant }');
    }
  }
  if (isProduction && config.auth.trustedIssuers.length === 0) {
    throw new ConfigError('Production cần TRUSTED_ISSUERS — không có bên nào ký token thì không ai gọi được API');
  }
  return config;
};

module.exports = { loadConfig, ConfigError, MIN_SECRET_LENGTH };
