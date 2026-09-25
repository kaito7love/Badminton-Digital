const { QueryTypes } = require('sequelize');
const { sign } = require('./signature');

// Gửi sự kiện trong outbox tới các bên nhận (webhook ký HMAC).
//  - "Thuê" dòng bằng transaction ngắn (FOR UPDATE SKIP LOCKED + đẩy next_attempt_at
//    lên) rồi mới gọi HTTP ngoài transaction → không giữ khoá DB trong lúc chờ mạng,
//    chạy nhiều bản dispatcher cũng không gửi trùng.
//  - Thứ tự theo từng aggregate: sự kiện sau chỉ được gửi khi sự kiện trước (cùng
//    bên nhận, cùng aggregate) đã giao xong.
//  - Lỗi → gửi lại lùi dần 10s → 1m → 5m → 30m → 2h → 6h…; quá MAX_ATTEMPTS
//    (~ hơn 24 giờ) thì `dead`, xem / gửi lại qua /v1/ops/outbox.

const BACKOFF_SECONDS = [10, 60, 300, 1800, 7200, 21600];
const MAX_ATTEMPTS = 10;
const LEASE_SECONDS = 60;
const BATCH = 50;

const backoffFor = (attempts) => BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];

const createDispatcher = ({ sequelize, OutboxEvent, targets, logger, timeoutMs = 5000, fetchImpl = fetch }) => {
  const targetByName = new Map(targets.map((t) => [t.name, t]));
  let timer = null;
  let running = false;

  const claim = async (now) =>
    sequelize.transaction(async (transaction) => {
      // Bị chặn khi có sự kiện TRƯỚC (cùng bên nhận + aggregate) còn chưa tới hạn —
      // đang chờ thử lại hoặc đang bị dispatcher khác "thuê". Các sự kiện trước đã tới
      // hạn nằm cùng lô và được xử lý trước (ORDER BY id; lỗi thì chặn phần còn lại).
      const rows = await sequelize.query(
        `SELECT o.id FROM outbox_events o
          WHERE o.status = 'pending' AND o.next_attempt_at <= :now
            AND NOT EXISTS (
              SELECT 1 FROM outbox_events p
               WHERE p.status = 'pending' AND p.target = o.target
                 AND p.aggregate_type = o.aggregate_type AND p.aggregate_id = o.aggregate_id
                 AND p.id < o.id AND (p.next_attempt_at IS NULL OR p.next_attempt_at > :now))
          ORDER BY o.id
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`,
        { replacements: { now }, type: QueryTypes.SELECT, transaction }
      );
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      await OutboxEvent.update(
        { nextAttemptAt: new Date(now.getTime() + LEASE_SECONDS * 1000) },
        { where: { id: ids }, transaction }
      );
      return OutboxEvent.findAll({ where: { id: ids }, order: [['id', 'ASC']], transaction });
    });

  const deliver = async (row) => {
    const target = targetByName.get(row.target);
    if (!target) throw new Error(`Bên nhận ${row.target} không còn trong WEBHOOK_TARGETS`);
    const body = JSON.stringify(row.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const res = await fetchImpl(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Event-Id': row.eventId,
        'X-Event-Type': row.type,
        'X-Event-Source': 'competition-service',
        'X-Timestamp': String(timestamp),
        'X-Signature': sign(target.secret, timestamp, body)
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  };

  const runOnce = async (now = new Date()) => {
    const rows = await claim(now);
    const blocked = new Set();
    const result = { delivered: 0, failed: 0, dead: 0 };
    for (const row of rows) {
      const aggregate = `${row.target}|${row.aggregateType}|${row.aggregateId}`;
      if (blocked.has(aggregate)) {
        // Sự kiện trước cùng aggregate vừa lỗi → chờ nó, trả lại hạn ngay.
        await row.update({ nextAttemptAt: row.createdAt });
        continue;
      }
      const attempts = row.attempts + 1;
      try {
        await deliver(row);
        await row.update({ status: 'delivered', attempts, deliveredAt: new Date(), lastError: null });
        result.delivered += 1;
      } catch (err) {
        blocked.add(aggregate);
        const dead = attempts >= MAX_ATTEMPTS;
        await row.update({
          attempts,
          status: dead ? 'dead' : 'pending',
          lastError: String(err.message || err).slice(0, 500),
          nextAttemptAt: dead ? null : new Date(Date.now() + backoffFor(attempts) * 1000)
        });
        if (dead) result.dead += 1;
        else result.failed += 1;
        logger.warn({ eventId: row.eventId, type: row.type, target: row.target, attempts, err: err.message }, 'outbox delivery failed');
      }
    }
    return result;
  };

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOnce();
    } catch (err) {
      logger.error({ err: err.message }, 'outbox dispatcher error');
    } finally {
      running = false;
    }
  };

  return {
    runOnce,
    start: (pollMs) => {
      if (!timer && targets.length) timer = setInterval(tick, pollMs);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
};

module.exports = { createDispatcher, BACKOFF_SECONDS, MAX_ATTEMPTS };
