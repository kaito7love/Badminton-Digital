const { v7 } = require('uuid');

// UUIDv7: sinh theo thời gian nên index B-tree tốt, không lộ số lượng bản ghi,
// không đụng id giữa các service.
const newId = () => v7();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

module.exports = { newId, isUuid };
