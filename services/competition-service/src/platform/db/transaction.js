// Chạy fn trong transaction có sẵn (khi được gọi từ một use case lớn hơn), hoặc
// mở transaction mới.
const withTransaction = (sequelize, transaction, fn) => (transaction ? fn(transaction) : sequelize.transaction(fn));

module.exports = { withTransaction };
