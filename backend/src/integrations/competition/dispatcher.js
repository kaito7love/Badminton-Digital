const { QueryTypes, Op } = require('sequelize');
const { sign } = require('./signature');

// Gửi outbox sang competition-service (POST /v1/events, ký HMAC). Chạy trong process backend, chỉ khi đã cấu hình.
//  - "thuê" dòng bằng transaction ngắn (FOR UPDATE SKIP LOCKED + đẩy next_attempt_at ra sau) → hai bản backend
//    không gửi trùng, process chết giữa chừng thì dòng tự quay lại hàng đợi;
//  - thứ tự theo từng khách (subject): không gửi sự kiện sau khi sự kiện trước của cùng khách chưa xong;
//  - lỗi → lùi dần 5 giây … 1 giờ, quá 12 lần hoặc service báo sự kiện sai (400 / 422) → `dead` (xem bằng SQL, gửi lại
//    bằng cách đặt lại status = 'pending');
//  - service khử trùng theo id sự kiện nên gửi lại là an toàn ("ít nhất một lần").

const LEASE_SECONDS = 60;
const PURGE_AFTER_DAYS = 30;

const backoffSeconds = (attempts) => Math.min(3600, 5 * 2 ** (attempts - 1));

const createDispatcher = ({
  config,
  sequelize,
  model,
  fetchImpl = (...args) => fetch(...args),
  logger = console,
  pollMs = 5000,
  batchSize = 20,
  maxAttempts = 12,
  timeoutMs = 5000,
  now = () => new Date()
}) => {
  let timer = null;
  let running = false;
  let lastPurge = 0;

  const claim = async (at) =>
    sequelize.transaction(async (transaction) => {
      const rows = await sequelize.query(
        `SELECT o.id FROM integration_outbox o
          WHERE o.status = 'pending' AND o.next_attempt_at <= :at
            AND NOT EXISTS (SELECT 1 FROM integration_outbox p WHERE p.subject = o.subject AND p.status = 'pending' AND p.id < o.id)
          ORDER BY o.id LIMIT :batchSize
          FOR UPDATE SKIP LOCKED`,
        { replacements: { at, batchSize }, type: QueryTypes.SELECT, transaction }
      );
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      await model.update({ nextAttemptAt: new Date(at.getTime() + LEASE_SECONDS * 1000) }, { where: { id: ids }, transaction });
      return model.findAll({ where: { id: ids }, order: [['id', 'ASC']], transaction });
    });

  const deliver = async (row) => {
    const body = JSON.stringify(row.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const res = await fetchImpl(`${config.serviceUrl}/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Event-Id': row.eventId,
        'X-Event-Type': row.type,
        'X-Event-Source': config.issuer,
        'X-Timestamp': String(timestamp),
        'X-Signature': sign(config.eventSecret, timestamp, body)
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (res.status < 200 || res.status >= 300) {
      const error = new Error(`HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
  };

  const settle = async (row, error, at) => {
    const attempts = row.attempts + 1;
    if (!error) {
      await row.update({ status: 'sent', attempts, sentAt: at, lastError: null });
      return 'sent';
    }
    const permanent = error.status === 400 || error.status === 422;
    const dead = permanent || attempts >= maxAttempts;
    await row.update({
      attempts,
      status: dead ? 'dead' : 'pending',
      nextAttemptAt: new Date(at.getTime() + backoffSeconds(attempts) * 1000),
      lastError: String(error.message || error).slice(0, 255)
    });
    if (dead) logger.error(`[competition] Sự kiện ${row.type} (${row.eventId}) bị đánh dấu dead: ${error.message}`);
    return dead ? 'dead' : 'retry';
  };

  /** Một lượt: lấy lô → gửi → ghi kết quả; lặp tới khi hết dòng đến hạn (tối đa 10 lô) để chuỗi sự kiện cùng khách đi liền. */
  const runOnce = async () => {
    const result = { sent: 0, retry: 0, dead: 0 };
    for (let round = 0; round < 10; round += 1) {
      const at = now();
      const rows = await claim(at);
      if (rows.length === 0) break;
      for (const row of rows) {
        let error = null;
        try {
          await deliver(row);
        } catch (err) {
          error = err;
        }
        result[await settle(row, error, now())] += 1;
      }
    }
    return result;
  };

  const purge = async () => {
    const cutoff = new Date(now().getTime() - PURGE_AFTER_DAYS * 24 * 3600 * 1000);
    return model.destroy({ where: { status: 'sent', sentAt: { [Op.lt]: cutoff } } });
  };

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOnce();
      if (Date.now() - lastPurge > 3600 * 1000) {
        lastPurge = Date.now();
        await purge();
      }
    } catch (err) {
      logger.error(`[competition] Dispatcher lỗi: ${err.message}`);
    } finally {
      running = false;
    }
  };

  return {
    runOnce,
    purge,
    start: () => {
      if (!timer) {
        timer = setInterval(tick, pollMs);
        timer.unref();
      }
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
};

module.exports = { createDispatcher, backoffSeconds };
