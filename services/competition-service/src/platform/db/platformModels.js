const { DataTypes } = require('sequelize');
const { newId } = require('./ids');

const id = { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() };

// Model của các bảng kỹ thuật (migration 20260926100001).
const definePlatformModels = (sequelize) => {
  const OutboxEvent = sequelize.define(
    'OutboxEvent',
    {
      id,
      eventId: { type: DataTypes.CHAR(36), allowNull: false },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      type: { type: DataTypes.STRING(100), allowNull: false },
      aggregateType: { type: DataTypes.STRING(40), allowNull: false },
      aggregateId: { type: DataTypes.STRING(64), allowNull: false },
      target: { type: DataTypes.STRING(64), allowNull: true },
      payload: { type: DataTypes.JSON, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'delivered', 'dead', 'no_target'), allowNull: false },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      nextAttemptAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.STRING(500), allowNull: true },
      deliveredAt: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: 'outbox_events', underscored: true }
  );

  const InboxEvent = sequelize.define(
    'InboxEvent',
    {
      id,
      source: { type: DataTypes.STRING(64), allowNull: false },
      eventId: { type: DataTypes.STRING(64), allowNull: false },
      type: { type: DataTypes.STRING(100), allowNull: false },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      status: { type: DataTypes.ENUM('processed', 'ignored'), allowNull: false },
      result: { type: DataTypes.STRING(255), allowNull: true },
      receivedAt: { type: DataTypes.DATE, allowNull: false }
    },
    { tableName: 'inbox_events', underscored: true, timestamps: false }
  );

  const IdempotencyKey = sequelize.define(
    'IdempotencyKey',
    {
      id,
      clientId: { type: DataTypes.STRING(191), allowNull: false },
      idemKey: { type: DataTypes.STRING(128), allowNull: false },
      requestHash: { type: DataTypes.CHAR(64), allowNull: false },
      status: { type: DataTypes.ENUM('in_progress', 'completed'), allowNull: false },
      responseStatus: { type: DataTypes.INTEGER, allowNull: true },
      responseBody: { type: DataTypes.JSON, allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false }
    },
    { tableName: 'idempotency_keys', underscored: true }
  );

  const AuditLog = sequelize.define(
    'AuditLog',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      actorRef: { type: DataTypes.STRING(128), allowNull: false },
      action: { type: DataTypes.STRING(64), allowNull: false },
      targetType: { type: DataTypes.STRING(32), allowNull: false },
      targetId: { type: DataTypes.STRING(64), allowNull: false },
      before: { type: DataTypes.JSON, allowNull: true },
      after: { type: DataTypes.JSON, allowNull: true },
      requestId: { type: DataTypes.STRING(128), allowNull: true }
    },
    { tableName: 'audit_log', underscored: true, updatedAt: false }
  );

  return { OutboxEvent, InboxEvent, IdempotencyKey, AuditLog };
};

module.exports = { definePlatformModels };
