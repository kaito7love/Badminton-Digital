const { DataTypes } = require('sequelize');

// Sự kiện competition-service → app chính đã nhận, để khử trùng (plan 23, migration 20261005100002).
module.exports = (sequelize) => sequelize.define('IntegrationInbox', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  eventId: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'event_id' },
  type: { type: DataTypes.STRING(100), allowNull: false },
  status: { type: DataTypes.ENUM('processed', 'ignored'), allowNull: false },
  receivedAt: { type: DataTypes.DATE, allowNull: false, field: 'received_at' }
}, {
  tableName: 'integration_inbox',
  timestamps: true,
  underscored: true
});
