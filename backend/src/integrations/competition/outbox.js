const { randomUUID } = require('crypto');
const { getEventIdentity } = require('./config');

// Ghi sự kiện bd.customer.* vào outbox (plan 23, docs/02 mục 3.3). Gọi TRONG transaction của CustomerService nên
// việc đổi khách và sự kiện báo cho service thành công / thất bại cùng nhau. Luôn ghi, kể cả khi cổng đang tắt:
// bật service sau vẫn đồng bộ được hồ sơ khách đã gộp / xoá trước đó.

const customerRef = (id) => `bd:customer:${id}`;

/** Vỏ sự kiện (CloudEvents 1.0) — hàm thuần để test. */
const buildEvent = ({ type, subject, data }, { identity = getEventIdentity(), id = randomUUID(), now = new Date() } = {}) => ({
  specversion: '1.0',
  id,
  type,
  source: identity.source,
  time: now.toISOString(),
  tenant: identity.tenant,
  subject,
  dataschema: `${type}/v1`,
  datacontenttype: 'application/json',
  data
});

const enqueue = async ({ type, subject, data, transaction }, { model, now = new Date() } = {}) => {
  const Outbox = model || require('../../models').IntegrationOutbox;
  const event = buildEvent({ type, subject, data }, { now });
  return Outbox.create({
    eventId: event.id,
    type,
    subject,
    payload: event,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: now
  }, { transaction });
};

const versionOf = (customer) => {
  const stamp = new Date(customer.updatedAt).getTime();
  return Number.isFinite(stamp) ? stamp : Date.now();
};

/** Khách đổi tên hiển thị. `version` tăng theo thời gian để service bỏ qua bản cũ hơn bản đã áp. */
const enqueueCustomerUpdated = (customer, { transaction, ...deps } = {}) => enqueue({
  type: 'bd.customer.updated',
  subject: `customer/${customer.id}`,
  data: { externalRef: customerRef(customer.id), fullName: customer.fullName, version: versionOf(customer) },
  transaction
}, deps);

/** Hồ sơ tại quầy gộp vào hồ sơ tài khoản. Subject theo hồ sơ ĐÍCH để thứ tự đúng với các lần đổi tên sau đó. */
const enqueueCustomerMerged = ({ sourceId, targetId }, { transaction, ...deps } = {}) => enqueue({
  type: 'bd.customer.merged',
  subject: `customer/${targetId}`,
  data: { sourceRef: customerRef(sourceId), targetRef: customerRef(targetId) },
  transaction
}, deps);

const enqueueCustomerDeleted = (customerId, { transaction, ...deps } = {}) => enqueue({
  type: 'bd.customer.deleted',
  subject: `customer/${customerId}`,
  data: { externalRef: customerRef(customerId) },
  transaction
}, deps);

module.exports = { buildEvent, enqueue, enqueueCustomerUpdated, enqueueCustomerMerged, enqueueCustomerDeleted, customerRef };
