'use strict';

// Bảng kỹ thuật dùng chung: outbox / inbox sự kiện, khoá idempotency, nhật ký
// thao tác. Mọi bảng có khoá chính `id` (Aiven bật sql_require_primary_key).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const id = { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false };
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    };

    await queryInterface.createTable('outbox_events', {
      id,
      event_id: { type: Sequelize.CHAR(36), allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      type: { type: Sequelize.STRING(100), allowNull: false },
      aggregate_type: { type: Sequelize.STRING(40), allowNull: false },
      aggregate_id: { type: Sequelize.STRING(64), allowNull: false },
      target: { type: Sequelize.STRING(64), allowNull: true },
      payload: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'delivered', 'dead', 'no_target'), allowNull: false },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      next_attempt_at: { type: Sequelize.DATE, allowNull: true },
      last_error: { type: Sequelize.STRING(500), allowNull: true },
      delivered_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps
    });
    await queryInterface.addIndex('outbox_events', ['status', 'next_attempt_at'], { name: 'idx_outbox_due' });
    await queryInterface.addIndex('outbox_events', ['event_id'], { name: 'idx_outbox_event' });
    await queryInterface.addIndex('outbox_events', ['aggregate_type', 'aggregate_id'], { name: 'idx_outbox_aggregate' });

    await queryInterface.createTable('inbox_events', {
      id,
      source: { type: Sequelize.STRING(64), allowNull: false },
      event_id: { type: Sequelize.STRING(64), allowNull: false },
      type: { type: Sequelize.STRING(100), allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      status: { type: Sequelize.ENUM('processed', 'ignored'), allowNull: false },
      result: { type: Sequelize.STRING(255), allowNull: true },
      received_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('inbox_events', ['source', 'event_id'], { unique: true, name: 'uq_inbox_source_event' });

    await queryInterface.createTable('idempotency_keys', {
      id,
      client_id: { type: Sequelize.STRING(191), allowNull: false },
      idem_key: { type: Sequelize.STRING(128), allowNull: false },
      request_hash: { type: Sequelize.CHAR(64), allowNull: false },
      status: { type: Sequelize.ENUM('in_progress', 'completed'), allowNull: false },
      response_status: { type: Sequelize.INTEGER, allowNull: true },
      response_body: { type: Sequelize.JSON, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      ...timestamps
    });
    await queryInterface.addIndex('idempotency_keys', ['client_id', 'idem_key'], { unique: true, name: 'uq_idem_client_key' });
    await queryInterface.addIndex('idempotency_keys', ['expires_at'], { name: 'idx_idem_expires' });

    await queryInterface.createTable('audit_log', {
      id,
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      actor_ref: { type: Sequelize.STRING(128), allowNull: false },
      action: { type: Sequelize.STRING(64), allowNull: false },
      target_type: { type: Sequelize.STRING(32), allowNull: false },
      target_id: { type: Sequelize.STRING(64), allowNull: false },
      before: { type: Sequelize.JSON, allowNull: true },
      after: { type: Sequelize.JSON, allowNull: true },
      request_id: { type: Sequelize.STRING(128), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('audit_log', ['tenant_id', 'target_type', 'target_id'], { name: 'idx_audit_target' });
    await queryInterface.addIndex('audit_log', ['created_at'], { name: 'idx_audit_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_log');
    await queryInterface.dropTable('idempotency_keys');
    await queryInterface.dropTable('inbox_events');
    await queryInterface.dropTable('outbox_events');
  }
};
