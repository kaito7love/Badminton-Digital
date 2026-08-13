'use strict';

/**
 * M2 — Catalog + sales orders; backfill from extras / session_extras.
 * Legacy tables remain for dual-write period (see docs/architecture/MIGRATION_ROADMAP.md).
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_categories', {
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
        onDelete: 'RESTRICT'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.addIndex('product_categories', ['branch_id', 'name'], {
      name: 'idx_product_categories_branch'
    });

    await queryInterface.createTable('products', {
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
        onDelete: 'RESTRICT'
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'product_categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      product_type: {
        type: Sequelize.ENUM('retail', 'consumable', 'rental', 'service'),
        allowNull: false,
        defaultValue: 'retail'
      },
      name: {
        type: Sequelize.STRING(150),
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      legacy_extra_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Mapping from extras.id during migration'
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

    await queryInterface.addIndex('products', ['legacy_extra_id'], {
      unique: true,
      name: 'uk_products_legacy_extra_id'
    });

    await queryInterface.createTable('product_variants', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      sku: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },
      list_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      track_inventory: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      stock_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      low_stock_threshold: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5
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

    await queryInterface.createTable('sales_orders', {
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
        onDelete: 'RESTRICT'
      },
      channel: {
        type: Sequelize.ENUM('session', 'pos', 'online'),
        allowNull: false,
        defaultValue: 'session'
      },
      session_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'court_sessions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'customers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      cashier_employee_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      status: {
        type: Sequelize.ENUM('draft', 'open', 'paid', 'cancelled'),
        allowNull: false,
        defaultValue: 'open'
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

    await queryInterface.addIndex('sales_orders', ['branch_id', 'session_id', 'status'], {
      name: 'idx_sales_orders_branch_session_status'
    });

    await queryInterface.createTable('sales_order_lines', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      sales_order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sales_orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      variant_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'product_variants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      unit_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      line_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      legacy_session_extra_id: {
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

    await queryInterface.addIndex('sales_order_lines', ['sales_order_id'], {
      name: 'idx_sales_order_lines_order'
    });

    const [categories] = await queryInterface.sequelize.query(
      `SELECT id FROM branches WHERE id = 1 LIMIT 1`
    );
    const branchExists = categories.length > 0;
    if (!branchExists) {
      throw new Error('M2 requires M1 default branch id=1');
    }

    const now = new Date();
    await queryInterface.bulkInsert('product_categories', [
      {
        id: 1,
        branch_id: 1,
        name: 'Phụ kiện / Quầy',
        sort_order: 0,
        created_at: now,
        updated_at: now
      }
    ]);

    const [extras] = await queryInterface.sequelize.query(
      `SELECT id, name, price, stock_quantity, low_stock_threshold, created_at, updated_at FROM extras ORDER BY id`
    );

    for (const extra of extras) {
      await queryInterface.bulkInsert('products', [
        {
          branch_id: 1,
          category_id: 1,
          product_type: 'retail',
          name: extra.name,
          is_active: true,
          legacy_extra_id: extra.id,
          created_at: extra.created_at || now,
          updated_at: extra.updated_at || now
        }
      ]);

      const [productRows] = await queryInterface.sequelize.query(
        `SELECT id FROM products WHERE legacy_extra_id = ${extra.id} LIMIT 1`
      );
      const productId = productRows[0].id;

      const sku = `LEGACY-EXTRA-${extra.id}`;
      await queryInterface.bulkInsert('product_variants', [
        {
          product_id: productId,
          sku,
          list_price: extra.price,
          track_inventory: true,
          stock_quantity: extra.stock_quantity,
          low_stock_threshold: extra.low_stock_threshold,
          created_at: extra.created_at || now,
          updated_at: extra.updated_at || now
        }
      ]);
    }

    const [sessionExtras] = await queryInterface.sequelize.query(
      `SELECT se.id, se.session_id, se.extra_id, se.quantity, se.unit_price, se.subtotal, se.created_at, se.updated_at,
              cs.branch_id, cs.customer_id, cs.employee_id
       FROM session_extras se
       INNER JOIN court_sessions cs ON cs.id = se.session_id
       ORDER BY se.session_id, se.id`
    );

    const orderBySession = new Map();

    for (const row of sessionExtras) {
      if (!orderBySession.has(row.session_id)) {
        await queryInterface.bulkInsert('sales_orders', [
          {
            branch_id: row.branch_id || 1,
            channel: 'session',
            session_id: row.session_id,
            customer_id: row.customer_id,
            cashier_employee_id: row.employee_id,
            status: 'open',
            created_at: row.created_at || now,
            updated_at: row.updated_at || now
          }
        ]);
        const [orderRows] = await queryInterface.sequelize.query(
          `SELECT id FROM sales_orders WHERE session_id = ${row.session_id} ORDER BY id DESC LIMIT 1`
        );
        orderBySession.set(row.session_id, orderRows[0].id);
      }

      const orderId = orderBySession.get(row.session_id);
      const [variantRows] = await queryInterface.sequelize.query(
        `SELECT pv.id FROM product_variants pv
         INNER JOIN products p ON p.id = pv.product_id
         WHERE p.legacy_extra_id = ${row.extra_id} LIMIT 1`
      );
      if (!variantRows.length) continue;

      await queryInterface.bulkInsert('sales_order_lines', [
        {
          sales_order_id: orderId,
          variant_id: variantRows[0].id,
          quantity: row.quantity,
          unit_price: row.unit_price,
          line_total: row.subtotal,
          legacy_session_extra_id: row.id,
          created_at: row.created_at || now,
          updated_at: row.updated_at || now
        }
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sales_order_lines');
    await queryInterface.dropTable('sales_orders');
    await queryInterface.dropTable('product_variants');
    await queryInterface.dropTable('products');
    await queryInterface.dropTable('product_categories');
  }
};
