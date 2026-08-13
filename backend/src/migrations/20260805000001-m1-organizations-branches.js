'use strict';

/**
 * M1 — Tenancy shell: organizations, branches, branch_settings,
 * and branch_id on existing operational tables (default branch 1).
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('organizations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        unique: true
      },
      legal_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      tax_id: {
        type: Sequelize.STRING(50),
        allowNull: true
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

    await queryInterface.createTable('branches', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      code: {
        type: Sequelize.STRING(32),
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      timezone: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: 'Asia/Ho_Chi_Minh'
      },
      address: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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

    await queryInterface.addIndex('branches', ['organization_id', 'code'], {
      unique: true,
      name: 'uk_branches_org_code'
    });

    await queryInterface.createTable('branch_settings', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      branch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      key: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      value: {
        type: Sequelize.JSON,
        allowNull: false
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

    await queryInterface.addIndex('branch_settings', ['branch_id', 'key'], {
      unique: true,
      name: 'uk_branch_settings_branch_key'
    });

    const now = new Date();
    await queryInterface.bulkInsert('organizations', [
      {
        id: 1,
        code: 'BD-HQ',
        legal_name: 'Badminton Digital Center',
        tax_id: null,
        created_at: now,
        updated_at: now
      }
    ]);

    await queryInterface.bulkInsert('branches', [
      {
        id: 1,
        organization_id: 1,
        code: 'MAIN',
        name: 'Chi nhánh chính',
        timezone: 'Asia/Ho_Chi_Minh',
        address: null,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ]);

    const branchTables = [
      'courts',
      'bookings',
      'court_sessions',
      'customers',
      'employees',
      'invoices',
      'payments'
    ];

    for (const table of branchTables) {
      await queryInterface.addColumn(table, 'branch_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });
      await queryInterface.sequelize.query(
        `UPDATE \`${table}\` SET branch_id = 1 WHERE branch_id IS NULL`
      );
      await queryInterface.changeColumn(table, 'branch_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });
    }

    await queryInterface.addIndex('courts', ['branch_id', 'status'], {
      name: 'idx_courts_branch_status'
    });
    await queryInterface.addIndex('bookings', ['branch_id', 'court_id', 'booking_date'], {
      name: 'idx_bookings_branch_court_date'
    });
    await queryInterface.addIndex('court_sessions', ['branch_id', 'court_id', 'status'], {
      name: 'idx_sessions_branch_court_status'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('court_sessions', 'idx_sessions_branch_court_status').catch(() => {});
    await queryInterface.removeIndex('bookings', 'idx_bookings_branch_court_date').catch(() => {});
    await queryInterface.removeIndex('courts', 'idx_courts_branch_status').catch(() => {});

    const branchTables = [
      'payments',
      'invoices',
      'employees',
      'customers',
      'court_sessions',
      'bookings',
      'courts'
    ];

    for (const table of branchTables) {
      await queryInterface.removeColumn(table, 'branch_id');
    }

    await queryInterface.dropTable('branch_settings');
    await queryInterface.dropTable('branches');
    await queryInterface.dropTable('organizations');
  }
};
