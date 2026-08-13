'use strict';

/**
 * M3 — Invoice lines, invoice numbering/status, payment idempotency; backfill from legacy invoice totals.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoices', 'invoice_no', {
      type: Sequelize.STRING(32),
      allowNull: true
    });
    await queryInterface.addColumn('invoices', 'status', {
      type: Sequelize.ENUM('draft', 'issued', 'paid', 'void'),
      allowNull: false,
      defaultValue: 'issued'
    });
    await queryInterface.addColumn('invoices', 'sales_order_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sales_orders', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.createTable('invoice_lines', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      invoice_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'invoices', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      line_kind: {
        type: Sequelize.ENUM('court_time', 'product', 'rental', 'discount', 'tax', 'other'),
        allowNull: false,
        defaultValue: 'other'
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      unit_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      reference_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      reference_id: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex('invoice_lines', ['invoice_id'], {
      name: 'idx_invoice_lines_invoice'
    });

    await queryInterface.addColumn('payments', 'idempotency_key', {
      type: Sequelize.STRING(64),
      allowNull: true
    });

    const [invoices] = await queryInterface.sequelize.query(
      `SELECT i.id, i.session_id, i.branch_id, i.court_fee, i.extras_fee, i.discount_amount, i.total_amount,
              i.created_at, p.id AS payment_id, p.status AS payment_status
       FROM invoices i
       LEFT JOIN payments p ON p.invoice_id = i.id
       ORDER BY i.id`
    );

    const now = new Date();
    let seq = 1;

    for (const inv of invoices) {
      const branchId = inv.branch_id || 1;
      const invoiceNo = `BD-${branchId}-${String(seq).padStart(6, '0')}`;
      seq += 1;

      const invoiceStatus =
        inv.payment_status === 'paid' ? 'paid' : 'issued';

      await queryInterface.sequelize.query(
        `UPDATE invoices SET invoice_no = :invoiceNo, status = :status WHERE id = :id`,
        { replacements: { invoiceNo, status: invoiceStatus, id: inv.id } }
      );

      if (Number(inv.court_fee) > 0) {
        await queryInterface.bulkInsert('invoice_lines', [
          {
            invoice_id: inv.id,
            line_kind: 'court_time',
            description: 'Tiền sân',
            quantity: 1,
            unit_price: inv.court_fee,
            amount: inv.court_fee,
            reference_type: 'court_session',
            reference_id: inv.session_id,
            created_at: inv.created_at || now,
            updated_at: inv.created_at || now
          }
        ]);
      }

      if (Number(inv.extras_fee) > 0) {
        await queryInterface.bulkInsert('invoice_lines', [
          {
            invoice_id: inv.id,
            line_kind: 'product',
            description: 'Phụ kiện / hàng hóa',
            quantity: 1,
            unit_price: inv.extras_fee,
            amount: inv.extras_fee,
            reference_type: 'sales_order',
            reference_id: null,
            created_at: inv.created_at || now,
            updated_at: inv.created_at || now
          }
        ]);
      }

      if (Number(inv.discount_amount) > 0) {
        await queryInterface.bulkInsert('invoice_lines', [
          {
            invoice_id: inv.id,
            line_kind: 'discount',
            description: 'Giảm giá',
            quantity: 1,
            unit_price: -Number(inv.discount_amount),
            amount: -Number(inv.discount_amount),
            reference_type: null,
            reference_id: null,
            created_at: inv.created_at || now,
            updated_at: inv.created_at || now
          }
        ]);
      }

      const [orderRows] = await queryInterface.sequelize.query(
        `SELECT id FROM sales_orders WHERE session_id = ${inv.session_id} LIMIT 1`
      );
      if (orderRows.length) {
        await queryInterface.sequelize.query(
          `UPDATE invoices SET sales_order_id = ${orderRows[0].id} WHERE id = ${inv.id}`
        );
      }

      if (inv.payment_id) {
        await queryInterface.sequelize.query(
          `UPDATE payments SET idempotency_key = :key WHERE id = :id AND idempotency_key IS NULL`,
          {
            replacements: {
              key: `legacy-payment-${inv.payment_id}`,
              id: inv.payment_id
            }
          }
        );
      }
    }

    await queryInterface.sequelize.query(
      `UPDATE invoices SET invoice_no = CONCAT('BD-', branch_id, '-', LPAD(id, 6, '0')) WHERE invoice_no IS NULL`
    );

    await queryInterface.changeColumn('invoices', 'invoice_no', {
      type: Sequelize.STRING(32),
      allowNull: false
    });

    await queryInterface.addIndex('invoices', ['branch_id', 'invoice_no'], {
      unique: true,
      name: 'uk_invoices_branch_invoice_no'
    });

    await queryInterface.addIndex('payments', ['idempotency_key'], {
      unique: true,
      name: 'uk_payments_idempotency_key'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', 'uk_payments_idempotency_key').catch(() => {});
    await queryInterface.removeIndex('invoices', 'uk_invoices_branch_invoice_no').catch(() => {});
    await queryInterface.removeColumn('payments', 'idempotency_key');
    await queryInterface.dropTable('invoice_lines');
    await queryInterface.removeColumn('invoices', 'sales_order_id');
    await queryInterface.removeColumn('invoices', 'status');
    await queryInterface.removeColumn('invoices', 'invoice_no');
  }
};
