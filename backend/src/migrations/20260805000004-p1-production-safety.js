'use strict';

const operationalTables = [
  'users',
  'employees',
  'customers',
  'courts',
  'bookings',
  'court_sessions',
  'extras',
  'session_extras',
  'invoices',
  'payments'
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const safetySchemaInitialized = tables.includes('branch_document_sequences');

    if (!safetySchemaInitialized) {
    await queryInterface.createTable('branch_document_sequences', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      branch_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      document_type: {
        allowNull: false,
        type: Sequelize.STRING(32)
      },
      next_value: {
        allowNull: false,
        type: Sequelize.BIGINT,
        defaultValue: 1
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });
    await queryInterface.addIndex('branch_document_sequences', ['branch_id', 'document_type'], {
      unique: true,
      name: 'uk_branch_document_sequences_branch_type'
    });
    await queryInterface.sequelize.query(
      `INSERT INTO branch_document_sequences (branch_id, document_type, next_value, created_at, updated_at)
       SELECT id, 'invoice', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM branches`
    );

    for (const table of operationalTables) {
      await queryInterface.addColumn(table, 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
      await queryInterface.addColumn(table, 'version', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }

    await queryInterface.addColumn('payments', 'amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true
    });
    await queryInterface.addColumn('payments', 'currency', {
      type: Sequelize.STRING(3),
      allowNull: false,
      defaultValue: 'VND'
    });
    await queryInterface.addColumn('payments', 'provider', {
      type: Sequelize.STRING(50),
      allowNull: true
    });
    await queryInterface.addColumn('payments', 'provider_reference', {
      type: Sequelize.STRING(128),
      allowNull: true
    });
    await queryInterface.addColumn('payments', 'confirmed_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('payments', 'webhook_payload', {
      type: Sequelize.JSON,
      allowNull: true
    });
    await queryInterface.addIndex('payments', ['provider', 'provider_reference'], {
      unique: true,
      name: 'uk_payments_provider_reference'
    });
    await queryInterface.changeColumn('payments', 'status', {
      type: Sequelize.ENUM('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded'),
      allowNull: false,
      defaultValue: 'pending'
    });
    await queryInterface.sequelize.query(
      `UPDATE payments p INNER JOIN invoices i ON i.id = p.invoice_id
       SET p.amount = i.total_amount, p.confirmed_at = COALESCE(p.paid_at, p.created_at)
       WHERE p.amount IS NULL AND p.status = 'paid'`
    );
    }

    await queryInterface.removeConstraint('activity_logs', 'activity_logs_ibfk_1').catch(() => {});
    await queryInterface.changeColumn('activity_logs', 'employee_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addConstraint('activity_logs', {
      fields: ['employee_id'],
      type: 'foreign key',
      name: 'fk_activity_logs_employee',
      references: { table: 'employees', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('activity_logs', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('activity_logs', 'branch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'branches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('activity_logs', 'old_values', {
      type: Sequelize.JSON,
      allowNull: true
    });
    await queryInterface.addColumn('activity_logs', 'new_values', {
      type: Sequelize.JSON,
      allowNull: true
    });
    await queryInterface.addColumn('activity_logs', 'request_id', {
      type: Sequelize.STRING(64),
      allowNull: true
    });
    await queryInterface.addIndex('activity_logs', ['branch_id', 'target_type', 'target_id', 'created_at'], {
      name: 'idx_activity_logs_entity_timeline'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('activity_logs', 'idx_activity_logs_entity_timeline').catch(() => {});
    await queryInterface.removeColumn('activity_logs', 'request_id');
    await queryInterface.removeColumn('activity_logs', 'new_values');
    await queryInterface.removeColumn('activity_logs', 'old_values');
    await queryInterface.removeColumn('activity_logs', 'branch_id');
    await queryInterface.removeColumn('activity_logs', 'user_id');

    await queryInterface.removeIndex('payments', 'uk_payments_provider_reference').catch(() => {});
    await queryInterface.removeColumn('payments', 'webhook_payload');
    await queryInterface.removeColumn('payments', 'confirmed_at');
    await queryInterface.removeColumn('payments', 'provider_reference');
    await queryInterface.removeColumn('payments', 'provider');
    await queryInterface.removeColumn('payments', 'currency');
    await queryInterface.removeColumn('payments', 'amount');

    for (const table of operationalTables) {
      await queryInterface.removeColumn(table, 'version');
      await queryInterface.removeColumn(table, 'deleted_at');
    }

    await queryInterface.dropTable('branch_document_sequences');
  }
};
