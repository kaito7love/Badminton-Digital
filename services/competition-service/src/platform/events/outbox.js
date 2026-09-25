const { newId } = require('../db/ids');

// Transactional outbox: sự kiện được ghi CÙNG transaction với thay đổi nghiệp vụ
// → không có chuyện đổi điểm xong mà mất sự kiện (hay ngược lại). Dispatcher gửi
// sau. Mỗi bên nhận (target) một dòng, để trạng thái giao từng bên độc lập.

const typeMatches = (pattern, type) =>
  pattern === type || (pattern.endsWith('*') && type.startsWith(pattern.slice(0, -1)));

const buildEvent = ({ type, tenant, subject, data, time = new Date() }) => ({
  specversion: '1.0',
  id: newId(),
  type,
  source: 'competition-service',
  time: time.toISOString(),
  tenant,
  subject,
  dataschema: `${type}/v1`,
  datacontenttype: 'application/json',
  data
});

const createOutbox = ({ OutboxEvent, targets, validator = null }) => {
  const add = async (transaction, { type, tenant, aggregateType, aggregateId, data }) => {
    const event = buildEvent({ type, tenant, subject: `${aggregateType}/${aggregateId}`, data });
    if (validator) validator.assertValid(event);
    const matching = targets.filter((t) => t.types.some((p) => typeMatches(p, type)));
    const base = {
      eventId: event.id,
      tenantId: tenant,
      type,
      aggregateType,
      aggregateId: String(aggregateId),
      payload: event
    };
    if (matching.length === 0) {
      // Không ai đăng ký nhận → vẫn lưu làm nhật ký sự kiện, không gửi.
      await OutboxEvent.create({ ...base, id: newId(), target: null, status: 'no_target' }, { transaction });
    } else {
      await OutboxEvent.bulkCreate(
        matching.map((t) => ({ ...base, id: newId(), target: t.name, status: 'pending', nextAttemptAt: new Date() })),
        { transaction }
      );
    }
    return event;
  };
  return { add };
};

module.exports = { createOutbox, buildEvent, typeMatches };
