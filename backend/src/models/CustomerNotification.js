const { DataTypes } = require('sequelize');

// Thông báo trong ứng dụng cho khách (kế hoạch 43, migration 20261016100001).
module.exports = (sequelize) => sequelize.define('CustomerNotification', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false, field: 'customer_id' },
  branchId: { type: DataTypes.INTEGER, allowNull: true, field: 'branch_id' },
  type: { type: DataTypes.STRING(40), allowNull: false },
  title: { type: DataTypes.STRING(160), allowNull: false },
  body: { type: DataTypes.STRING(500), allowNull: false },
  bookingId: { type: DataTypes.INTEGER, allowNull: true, field: 'booking_id' },
  readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' }
}, {
  tableName: 'customer_notifications',
  timestamps: true,
  underscored: true
});
