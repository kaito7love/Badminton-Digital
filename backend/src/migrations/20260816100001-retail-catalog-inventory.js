'use strict';

/**
 * feat/retail-catalog-inventory — sửa lại schema catalog M2 để dùng thật cho
 * trụ "bán lẻ dụng cụ cầu lông" (vợt/áo/quần/cầu), và tổng quát hoá ledger
 * kho hiện có (M4) để dùng chung cho cả extras (trụ 1) lẫn product_variants
 * (trụ 2), theo docs/05-extra/02-remediation/07-ke-hoach-ban-le-phu-kien.md.
 *
 * Thứ tự bắt buộc:
 *  1. Xoá data snapshot chết từ M2 (2026-08-05) — làm TRƯỚC khi thêm CHECK
 *     constraint loại trừ lẫn nhau trên invoices, vì dữ liệu cũ do M3 backfill
 *     có thể vi phạm CHECK đó (1 invoice vừa có session_id vừa có
 *     sales_order_id trỏ snapshot cũ). Xoá sales_orders sẽ tự động NULL hoá
 *     invoices.sales_order_id qua FK onDelete SET NULL.
 *  2. Sửa schema catalog (bỏ branch_id khỏi products/product_categories —
 *     catalog dùng chung toàn chuỗi theo quyết định của chủ dự án).
 *  3. Sửa product_variants (bỏ stock_quantity — tồn kho phải tách theo chi
 *     nhánh, không thể là 1 số đơn trên chính bảng catalog; thêm size/color).
 *  4. Tạo product_stocks (bảng cân đối tồn kho theo chi nhánh, cùng mẫu
 *     extra_stocks).
 *  5. Tổng quát hoá stock_movements/goods_receipt_items để nhận cả extra_id
 *     lẫn product_variant_id (đúng 1 trong 2).
 *  6. Cho phép invoices.session_id NULL (bán lẻ không gắn phiên sân), thêm
 *     CHECK loại trừ lẫn nhau giữa session_id/sales_order_id.
 *  7. Thêm cột version cho sales_orders (optimistic lock, cùng mẫu Invoice/
 *     Payment/GoodsReceipt) — bảng M2 gốc tạo thiếu cột này.
 */

async function dropForeignKeyOnColumn(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    { replacements: { table, column } }
  );
  for (const row of rows) {
    await queryInterface.sequelize.query(
      `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``
    );
  }
}

/**
 * MySQL cấm dùng 1 cột trong CHECK constraint nếu cột đó thuộc 1 FK có
 * referential action CASCADE/SET NULL/SET DEFAULT (ON UPDATE hoặc ON
 * DELETE) — hành động đó có thể âm thầm đổi giá trị cột, phá vỡ CHECK.
 * Dựng lại FK với RESTRICT cho cả 2 chiều trước khi thêm CHECK trên cột đó.
 * Vô hại về hành vi thật: các bảng tham chiếu (branches/extras/
 * product_variants/court_sessions) đều dùng khoá chính auto-increment,
 * không bao giờ UPDATE giá trị id, nên CASCADE vs RESTRICT trên ON UPDATE
 * không khác nhau trong thực tế.
 */
async function forceRestrictForeignKey(queryInterface, table, column, refTable) {
  await dropForeignKeyOnColumn(queryInterface, table, column);
  await queryInterface.sequelize.query(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`fk_${table}_${column}_restrict\`
     FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\` (\`id\`)
     ON UPDATE RESTRICT ON DELETE RESTRICT`
  );
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Xoá data snapshot chết (con -> cha), giữ nguyên bảng.
    await queryInterface.bulkDelete('sales_order_lines', null, {});
    await queryInterface.bulkDelete('sales_orders', null, {});
    await queryInterface.bulkDelete('product_variants', null, {});
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('product_categories', null, {});

    // 2. Catalog dùng chung toàn chuỗi — bỏ branch_id.
    await dropForeignKeyOnColumn(queryInterface, 'product_categories', 'branch_id');
    await queryInterface.removeColumn('product_categories', 'branch_id');
    await dropForeignKeyOnColumn(queryInterface, 'products', 'branch_id');
    await queryInterface.removeColumn('products', 'branch_id');

    // 3. product_variants: bỏ stock_quantity (sai thiết kế — thiếu chiều
    //    branch_id), thêm size/color.
    await queryInterface.removeColumn('product_variants', 'stock_quantity');
    await queryInterface.addColumn('product_variants', 'size', {
      type: Sequelize.STRING(50),
      allowNull: true
    });
    await queryInterface.addColumn('product_variants', 'color', {
      type: Sequelize.STRING(50),
      allowNull: true
    });

    // 4. Bảng cân đối tồn kho riêng cho sản phẩm bán lẻ, theo từng chi nhánh
    //    — cùng mẫu extra_stocks, không tái dùng thẳng bảng đó để không đụng
    //    dữ liệu tồn kho thật đang chạy của trụ 1.
    await queryInterface.createTable('product_stocks', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      product_variant_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'product_variants', key: 'id' },
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
    await queryInterface.addIndex('product_stocks', ['product_variant_id', 'branch_id'], {
      unique: true,
      name: 'uk_product_stocks_variant_branch'
    });

    // 5. Tổng quát hoá ledger kho dùng chung cho cả 2 trụ.
    await queryInterface.changeColumn('stock_movements', 'extra_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('stock_movements', 'product_variant_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'product_variants', key: 'id' },
      onUpdate: 'RESTRICT',
      onDelete: 'RESTRICT'
    });
    // FK gốc của extra_id (từ M4) dùng ON UPDATE CASCADE — MySQL cấm cột đó
    // tham gia CHECK khi FK có referential action CASCADE/SET NULL, phải
    // dựng lại RESTRICT trước (xem doc-comment forceRestrictForeignKey).
    await forceRestrictForeignKey(queryInterface, 'stock_movements', 'extra_id', 'extras');
    await queryInterface.sequelize.query(`
      ALTER TABLE stock_movements
      ADD CONSTRAINT chk_stock_movements_one_item
      CHECK (
        (extra_id IS NOT NULL AND product_variant_id IS NULL) OR
        (extra_id IS NULL AND product_variant_id IS NOT NULL)
      )
    `);
    await queryInterface.addIndex('stock_movements', ['branch_id', 'product_variant_id', 'created_at'], {
      name: 'idx_stock_movements_branch_variant_time'
    });

    await queryInterface.changeColumn('goods_receipt_items', 'extra_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('goods_receipt_items', 'product_variant_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'product_variants', key: 'id' },
      onUpdate: 'RESTRICT',
      onDelete: 'RESTRICT'
    });
    await forceRestrictForeignKey(queryInterface, 'goods_receipt_items', 'extra_id', 'extras');
    await queryInterface.sequelize.query(`
      ALTER TABLE goods_receipt_items
      ADD CONSTRAINT chk_goods_receipt_items_one_item
      CHECK (
        (extra_id IS NOT NULL AND product_variant_id IS NULL) OR
        (extra_id IS NULL AND product_variant_id IS NOT NULL)
      )
    `);

    // 6. Hoá đơn bán lẻ không gắn phiên sân. session_id gốc dùng ON UPDATE
    //    CASCADE, sales_order_id gốc (M3) dùng ON DELETE SET NULL — cả 2 đều
    //    phải chuyển RESTRICT trước khi CHECK được phép tham chiếu cột đó.
    //    Đổi sales_order_id sang ON DELETE RESTRICT là thay đổi hành vi có
    //    chủ đích: không cho xoá 1 sales_order đã phát hành hoá đơn (đúng
    //    tinh thần bảo toàn dữ liệu tài chính đang áp dụng trong toàn hệ
    //    thống), thay vì âm thầm NULL hoá liên kết như thiết kế M3 gốc.
    await queryInterface.changeColumn('invoices', 'session_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: true
    });
    await forceRestrictForeignKey(queryInterface, 'invoices', 'session_id', 'court_sessions');
    await forceRestrictForeignKey(queryInterface, 'invoices', 'sales_order_id', 'sales_orders');
    await queryInterface.sequelize.query(`
      ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_one_source
      CHECK (
        (session_id IS NOT NULL AND sales_order_id IS NULL) OR
        (session_id IS NULL AND sales_order_id IS NOT NULL)
      )
    `);

    // 7. sales_orders (M2) chưa có version — cần cho optimistic lock khi
    //    thêm/xoá dòng hàng đồng thời.
    await queryInterface.addColumn('sales_orders', 'version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('sales_orders', 'version');

    await queryInterface.sequelize.query('ALTER TABLE invoices DROP CONSTRAINT chk_invoices_one_source');
    await dropForeignKeyOnColumn(queryInterface, 'invoices', 'sales_order_id');
    await queryInterface.sequelize.query(`
      ALTER TABLE invoices ADD CONSTRAINT invoices_sales_order_id_foreign_idx
      FOREIGN KEY (sales_order_id) REFERENCES sales_orders (id)
      ON UPDATE CASCADE ON DELETE SET NULL
    `);
    await dropForeignKeyOnColumn(queryInterface, 'invoices', 'session_id');
    await queryInterface.changeColumn('invoices', 'session_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      unique: true
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE invoices ADD CONSTRAINT invoices_session_id_foreign_idx
      FOREIGN KEY (session_id) REFERENCES court_sessions (id)
      ON UPDATE CASCADE ON DELETE RESTRICT
    `);

    await queryInterface.sequelize.query('ALTER TABLE goods_receipt_items DROP CONSTRAINT chk_goods_receipt_items_one_item');
    await queryInterface.removeColumn('goods_receipt_items', 'product_variant_id');
    await dropForeignKeyOnColumn(queryInterface, 'goods_receipt_items', 'extra_id');
    await queryInterface.changeColumn('goods_receipt_items', 'extra_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE goods_receipt_items ADD CONSTRAINT goods_receipt_items_extra_id_foreign_idx
      FOREIGN KEY (extra_id) REFERENCES extras (id)
      ON UPDATE CASCADE ON DELETE RESTRICT
    `);

    await queryInterface.removeIndex('stock_movements', 'idx_stock_movements_branch_variant_time');
    await queryInterface.sequelize.query('ALTER TABLE stock_movements DROP CONSTRAINT chk_stock_movements_one_item');
    await queryInterface.removeColumn('stock_movements', 'product_variant_id');
    await dropForeignKeyOnColumn(queryInterface, 'stock_movements', 'extra_id');
    await queryInterface.changeColumn('stock_movements', 'extra_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_extra_id_foreign_idx
      FOREIGN KEY (extra_id) REFERENCES extras (id)
      ON UPDATE CASCADE ON DELETE RESTRICT
    `);

    await queryInterface.dropTable('product_stocks');

    await queryInterface.removeColumn('product_variants', 'color');
    await queryInterface.removeColumn('product_variants', 'size');
    await queryInterface.addColumn('product_variants', 'stock_quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.addColumn('products', 'branch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'branches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
    await queryInterface.addColumn('product_categories', 'branch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'branches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
    // Không khôi phục lại data snapshot đã xoá ở up() — down() chỉ cần đúng
    // cấu trúc bảng để không kẹt migration chain, giống mẫu các migration
    // dead-data trước đó trong repo này.
  }
};
