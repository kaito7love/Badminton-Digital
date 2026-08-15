'use strict';

const MOVEMENT_TYPES = [
  'opening_balance',
  'purchase_receipt',
  'sale',
  'sale_return',
  'adjustment_in',
  'adjustment_out',
  'damaged',
  'lost'
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('suppliers', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { allowNull: false, type: Sequelize.STRING(150) },
      phone: { allowNull: true, type: Sequelize.STRING(20) },
      email: { allowNull: true, type: Sequelize.STRING(150) },
      address: { allowNull: true, type: Sequelize.STRING(255) },
      tax_code: { allowNull: true, type: Sequelize.STRING(50) },
      note: { allowNull: true, type: Sequelize.STRING(255) },
      is_active: { allowNull: false, type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
      deleted_at: { allowNull: true, type: Sequelize.DATE },
      version: { allowNull: false, type: Sequelize.INTEGER, defaultValue: 0 }
    });

    await queryInterface.createTable('extra_stocks', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      extra_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'extras', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      branch_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      quantity: { allowNull: false, type: Sequelize.INTEGER, defaultValue: 0 },
      average_cost: { allowNull: true, type: Sequelize.DECIMAL(10, 2) },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
      version: { allowNull: false, type: Sequelize.INTEGER, defaultValue: 0 }
    });
    await queryInterface.addIndex('extra_stocks', ['extra_id', 'branch_id'], {
      unique: true,
      name: 'uk_extra_stocks_extra_branch'
    });

    await queryInterface.createTable('stock_movements', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      branch_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      extra_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'extras', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      type: { allowNull: false, type: Sequelize.ENUM(...MOVEMENT_TYPES) },
      quantity: { allowNull: false, type: Sequelize.INTEGER },
      unit_cost: { allowNull: true, type: Sequelize.DECIMAL(10, 2) },
      note: { allowNull: true, type: Sequelize.STRING(255) },
      reference_type: { allowNull: true, type: Sequelize.STRING(32) },
      reference_id: { allowNull: true, type: Sequelize.INTEGER },
      actor_user_id: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('stock_movements', ['branch_id', 'extra_id', 'created_at'], {
      name: 'idx_stock_movements_branch_extra_time'
    });
    await queryInterface.addIndex('stock_movements', ['reference_type', 'reference_id'], {
      name: 'idx_stock_movements_reference'
    });

    await queryInterface.createTable('goods_receipts', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      branch_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      code: { allowNull: false, type: Sequelize.STRING(32) },
      supplier_id: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: { model: 'suppliers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      received_by_user_id: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      note: { allowNull: true, type: Sequelize.STRING(255) },
      total_cost: { allowNull: false, type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
      version: { allowNull: false, type: Sequelize.INTEGER, defaultValue: 0 }
    });
    await queryInterface.addIndex('goods_receipts', ['branch_id', 'code'], {
      unique: true,
      name: 'uk_goods_receipts_branch_code'
    });

    await queryInterface.createTable('goods_receipt_items', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      goods_receipt_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'goods_receipts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      extra_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'extras', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      quantity: { allowNull: false, type: Sequelize.INTEGER },
      unit_cost: { allowNull: false, type: Sequelize.DECIMAL(10, 2) },
      subtotal: { allowNull: false, type: Sequelize.DECIMAL(12, 2) },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    // Sequence riêng cho mã phiếu nhập kho, theo đúng cơ chế đã dùng cho invoice.
    await queryInterface.sequelize.query(
      `INSERT INTO branch_document_sequences (branch_id, document_type, next_value, created_at, updated_at)
       SELECT id, 'goods_receipt', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM branches`
    );

    // Tồn kho cũ là 1 số toàn hệ thống, không thể suy luận đúng nó thuộc chi
    // nhánh nào — khởi tạo 0 cho mọi cặp (extra, branch), số tồn thật sẽ được
    // nhập lại qua phiếu nhập kho để có ledger sạch ngay từ đầu.
    await queryInterface.sequelize.query(
      `INSERT INTO extra_stocks (extra_id, branch_id, quantity, created_at, updated_at, version)
       SELECT e.id, b.id, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0
       FROM extras e CROSS JOIN branches b`
    );

    await queryInterface.removeColumn('extras', 'stock_quantity');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('extras', 'stock_quantity', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });

    await queryInterface.sequelize.query(
      `DELETE FROM branch_document_sequences WHERE document_type = 'goods_receipt'`
    );

    await queryInterface.dropTable('goods_receipt_items');
    await queryInterface.dropTable('goods_receipts');
    await queryInterface.dropTable('stock_movements');
    await queryInterface.dropTable('extra_stocks');
    await queryInterface.dropTable('suppliers');
  }
};
