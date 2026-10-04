const { DataTypes } = require('sequelize');

// Hàng đợi sự kiện app chính → competition-service (plan 23, migration 20261005100001).
module.exports = (sequelize) => sequelize.define('IntegrationOutbox', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  eventId: { type: DataTypes.STRING(36), allowNull: false, unique: true, field: 'event_id' },
  type: { type: DataTypes.STRING(100), allowNull: false },
  subject: { type: DataTypes.STRING(100), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'sent', 'dead'), allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: false, field: 'next_attempt_at' },
  lastError: { type: DataTypes.STRING(255), allowNull: true, field: 'last_error' },
  sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sent_at' }
}, {
  tableName: 'integration_outbox',
  timestamps: true,
  underscored: true
});
