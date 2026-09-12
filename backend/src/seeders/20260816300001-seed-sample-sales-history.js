'use strict';

const { assertDemoSeedAllowed } = require('../utils/demoSeedGuard');

// Dữ liệu mẫu trải dài 7 ngày, nhiều chi nhánh, cho 2 báo cáo mới
// (revenue-breakdown, inventory-reconciliation) có gì để hiển thị — thay vì
// chỉ vài giao dịch test lẻ tẻ. Ghi trực tiếp bằng SQL có tính toán tay
// (giống seeder inventory mẫu trước đó), KHÔNG gọi qua SalesOrderService,
// vì cần đặt `created_at` lùi về quá khứ (service luôn dùng NOW()).
//
// Toàn bộ chạy trong 1 transaction + LAST_INSERT_ID() để lấy id vừa tạo —
// không tra lại bằng created_at (Date object qua replacements bị lệch múi
// giờ so với giá trị mysql2 tự serialize lúc INSERT, tra lại sẽ không khớp).
//
// Giả định đã chạy trước: seeder retail mẫu (20260816200001) — dùng lại
// product_variants/giá của nó; branch 1/2/3 đã có sẵn từ migration.

const IDEMPOTENCY_PREFIX = 'seed-sales-history-';
const SEED_NOTE = 'Nhập kho ban đầu — dữ liệu mẫu lịch sử bán hàng';

const EXTRA_BRANCH_STOCK = [
  {
    branchId: 2,
    items: [
      { sku: 'YNX-SHIRT-M-RED', quantity: 10, unitCost: 150000 },
      { sku: 'YNX-GRIP-WHITE', quantity: 15, unitCost: 12000 },
      { sku: 'YNX-AX100ZZ', quantity: 5, unitCost: 3600000 }
    ]
  },
  {
    branchId: 3,
    items: [
      { sku: 'YNX-SHIRT-L-RED', quantity: 10, unitCost: 150000 },
      { sku: 'YNX-GRIP-WHITE', quantity: 15, unitCost: 12000 },
      { sku: 'YNX-SHORT-L', quantity: 10, unitCost: 130000 }
    ]
  }
];

// { branchId, daysAgo, items: [{sku, qty}], discountAmount? }
const TRANSACTIONS = [
  { branchId: 1, daysAgo: 6, items: [{ sku: 'YNX-SHIRT-M-RED', qty: 2 }] },
  { branchId: 1, daysAgo: 6, items: [{ sku: 'YNX-GRIP-WHITE', qty: 3 }, { sku: 'WRISTBAND-BLACK', qty: 2 }] },
  { branchId: 1, daysAgo: 5, items: [{ sku: 'YNX-SHORT-M', qty: 1 }], discountAmount: 20000 },
  { branchId: 1, daysAgo: 5, items: [{ sku: 'YNX-AX100ZZ', qty: 1 }] },
  { branchId: 1, daysAgo: 4, items: [{ sku: 'YNX-BAG-6', qty: 1 }, { sku: 'YNX-GRIP-WHITE', qty: 2 }] },
  { branchId: 1, daysAgo: 3, items: [{ sku: 'YNX-SHIRT-L-BLUE', qty: 2 }], discountAmount: 25000 },
  { branchId: 1, daysAgo: 2, items: [{ sku: 'WRISTBAND-BLACK', qty: 5 }] },
  { branchId: 1, daysAgo: 1, items: [{ sku: 'YNX-NF800', qty: 1 }] },
  { branchId: 2, daysAgo: 4, items: [{ sku: 'YNX-SHIRT-M-RED', qty: 1 }] },
  { branchId: 2, daysAgo: 2, items: [{ sku: 'YNX-GRIP-WHITE', qty: 4 }], discountAmount: 5000 },
  { branchId: 2, daysAgo: 1, items: [{ sku: 'YNX-AX100ZZ', qty: 1 }] },
  { branchId: 3, daysAgo: 3, items: [{ sku: 'YNX-SHIRT-L-RED', qty: 2 }] },
  { branchId: 3, daysAgo: 2, items: [{ sku: 'YNX-GRIP-WHITE', qty: 2 }] },
  { branchId: 3, daysAgo: 1, items: [{ sku: 'YNX-SHORT-L', qty: 1 }], discountAmount: 10000 }
];

const dateDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(14, 30, 0, 0);
  return d;
};

const lastInsertId = async (queryInterface, transaction) => {
  const [[row]] = await queryInterface.sequelize.query('SELECT LAST_INSERT_ID() AS id', { transaction });
  return row.id;
};

module.exports = {
  async up(queryInterface) {
    assertDemoSeedAllowed();
    const [existing] = await queryInterface.sequelize.query(
      `SELECT idempotency_key FROM payments WHERE idempotency_key LIKE :prefix LIMIT 1`,
      { replacements: { prefix: `${IDEMPOTENCY_PREFIX}%` } }
    );
    if (existing.length) {
      throw new Error(
        'Seeder dữ liệu bán hàng mẫu đã chạy trước đó — dùng ' +
        '"npx sequelize-cli db:seed:undo --seed 20260816300001-seed-sample-sales-history.js" nếu muốn chạy lại.'
      );
    }

    const [variantRows] = await queryInterface.sequelize.query(`SELECT id, sku, list_price FROM product_variants`);
    const variantBySku = Object.fromEntries(variantRows.map((v) => [v.sku, v]));

    // Thu ngân của từng chi nhánh: TRA THEO CHI NHÁNH, không hardcode id.
    // Bản trước ghi cứng { 1: 2, 2: 14, 3: 15 } trong khi seed chuẩn chỉ tạo
    // tới employee id 6 — nên seeder này gãy ở khoá ngoại cashier_employee_id
    // trên mọi lần cài mới. Lấy nhân viên có id nhỏ nhất mỗi chi nhánh.
    const [employeeRows] = await queryInterface.sequelize.query(
      `SELECT branch_id, MIN(id) AS employee_id FROM employees
       WHERE branch_id IS NOT NULL AND deleted_at IS NULL GROUP BY branch_id`
    );
    const branchEmployee = Object.fromEntries(employeeRows.map((e) => [Number(e.branch_id), Number(e.employee_id)]));
    const missingBranches = [...new Set(TRANSACTIONS.map((t) => t.branchId))].filter((b) => !branchEmployee[b]);
    if (missingBranches.length) {
      throw new Error(
        `Chi nhánh ${missingBranches.join(', ')} chưa có nhân viên nào — chạy seeder ` +
        '20260815300003-seed-branch-managers trước khi chạy seeder lịch sử bán hàng này.'
      );
    }

    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Tồn kho ban đầu cho chi nhánh 2/3 (chi nhánh 1 đã có sẵn)
      for (const branchStock of EXTRA_BRANCH_STOCK) {
        const now = new Date();
        const [[seqRow]] = await queryInterface.sequelize.query(
          `SELECT next_value FROM branch_document_sequences WHERE branch_id = :branchId AND document_type = 'goods_receipt'`,
          { replacements: { branchId: branchStock.branchId }, transaction }
        );
        const code = `GR-${branchStock.branchId}-${String(seqRow.next_value).padStart(8, '0')}`;
        const totalCost = branchStock.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

        await queryInterface.sequelize.query(
          `INSERT INTO goods_receipts (branch_id, code, supplier_id, received_by_user_id, note, total_cost, created_at, updated_at, version)
           VALUES (:branchId, :code, NULL, 1, :note, :totalCost, :now, :now, 0)`,
          { replacements: { branchId: branchStock.branchId, code, note: SEED_NOTE, totalCost, now }, transaction }
        );
        const receiptId = await lastInsertId(queryInterface, transaction);

        for (const item of branchStock.items) {
          const variant = variantBySku[item.sku];
          await queryInterface.sequelize.query(
            `INSERT INTO goods_receipt_items (goods_receipt_id, extra_id, product_variant_id, quantity, unit_cost, subtotal, created_at, updated_at)
             VALUES (:receiptId, NULL, :variantId, :qty, :unitCost, :subtotal, :now, :now)`,
            { replacements: { receiptId, variantId: variant.id, qty: item.quantity, unitCost: item.unitCost, subtotal: item.quantity * item.unitCost, now }, transaction }
          );
          await queryInterface.sequelize.query(
            `INSERT INTO stock_movements (branch_id, extra_id, product_variant_id, type, quantity, unit_cost, note, reference_type, reference_id, actor_user_id, created_at)
             VALUES (:branchId, NULL, :variantId, 'purchase_receipt', :qty, :unitCost, :note, 'goods_receipt', :receiptId, 1, :now)`,
            { replacements: { branchId: branchStock.branchId, variantId: variant.id, qty: item.quantity, unitCost: item.unitCost, note: SEED_NOTE, receiptId, now }, transaction }
          );
          await queryInterface.sequelize.query(
            `INSERT INTO product_stocks (product_variant_id, branch_id, quantity, average_cost, created_at, updated_at, version)
             VALUES (:variantId, :branchId, :qty, :unitCost, :now, :now, 0)`,
            { replacements: { variantId: variant.id, branchId: branchStock.branchId, qty: item.quantity, unitCost: item.unitCost, now }, transaction }
          );
        }

        await queryInterface.sequelize.query(
          `UPDATE branch_document_sequences SET next_value = next_value + 1 WHERE branch_id = :branchId AND document_type = 'goods_receipt'`,
          { replacements: { branchId: branchStock.branchId }, transaction }
        );
      }

      // 2. Các giao dịch bán lẻ mẫu, trải dài 7 ngày qua, nhiều chi nhánh
      let txIndex = 0;
      for (const tx of TRANSACTIONS) {
        txIndex += 1;
        const createdAt = dateDaysAgo(tx.daysAgo);
        const employeeId = branchEmployee[tx.branchId];

        const lines = tx.items.map((item) => {
          const variant = variantBySku[item.sku];
          const unitPrice = Number(variant.list_price);
          return { variantId: variant.id, sku: variant.sku, quantity: item.qty, unitPrice, lineTotal: unitPrice * item.qty };
        });
        const extrasFee = lines.reduce((sum, l) => sum + l.lineTotal, 0);
        const discountAmount = tx.discountAmount || 0;
        const totalAmount = extrasFee - discountAmount;

        await queryInterface.sequelize.query(
          `INSERT INTO sales_orders (branch_id, channel, session_id, customer_id, cashier_employee_id, status, created_at, updated_at, version)
           VALUES (:branchId, 'pos', NULL, NULL, :employeeId, 'paid', :createdAt, :createdAt, 1)`,
          { replacements: { branchId: tx.branchId, employeeId, createdAt }, transaction }
        );
        const orderId = await lastInsertId(queryInterface, transaction);

        const lineIds = [];
        for (const line of lines) {
          await queryInterface.sequelize.query(
            `INSERT INTO sales_order_lines (sales_order_id, variant_id, quantity, unit_price, line_total, created_at, updated_at)
             VALUES (:orderId, :variantId, :qty, :unitPrice, :lineTotal, :createdAt, :createdAt)`,
            { replacements: { orderId, variantId: line.variantId, qty: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal, createdAt }, transaction }
          );
          lineIds.push(await lastInsertId(queryInterface, transaction));
        }

        const [[seqRow]] = await queryInterface.sequelize.query(
          `SELECT next_value FROM branch_document_sequences WHERE branch_id = :branchId AND document_type = 'invoice'`,
          { replacements: { branchId: tx.branchId }, transaction }
        );
        const invoiceNo = `BD-${tx.branchId}-${String(seqRow.next_value).padStart(8, '0')}`;
        await queryInterface.sequelize.query(
          `INSERT INTO invoices (branch_id, invoice_no, status, sales_order_id, session_id, court_fee, extras_fee, discount_amount, total_amount, created_at, updated_at, version)
           VALUES (:branchId, :invoiceNo, 'paid', :orderId, NULL, 0, :extrasFee, :discountAmount, :totalAmount, :createdAt, :createdAt, 1)`,
          { replacements: { branchId: tx.branchId, invoiceNo, orderId, extrasFee, discountAmount, totalAmount, createdAt }, transaction }
        );
        const invoiceId = await lastInsertId(queryInterface, transaction);
        await queryInterface.sequelize.query(
          `UPDATE branch_document_sequences SET next_value = next_value + 1 WHERE branch_id = :branchId AND document_type = 'invoice'`,
          { replacements: { branchId: tx.branchId }, transaction }
        );

        for (let i = 0; i < lines.length; i++) {
          await queryInterface.sequelize.query(
            `INSERT INTO invoice_lines (invoice_id, line_kind, description, quantity, unit_price, amount, reference_type, reference_id, created_at, updated_at)
             VALUES (:invoiceId, 'product', :description, :qty, :unitPrice, :amount, 'sales_order_line', :lineId, :createdAt, :createdAt)`,
            { replacements: { invoiceId, description: lines[i].sku, qty: lines[i].quantity, unitPrice: lines[i].unitPrice, amount: lines[i].lineTotal, lineId: lineIds[i], createdAt }, transaction }
          );
        }
        if (discountAmount > 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO invoice_lines (invoice_id, line_kind, description, quantity, unit_price, amount, reference_type, reference_id, created_at, updated_at)
             VALUES (:invoiceId, 'discount', 'Giảm giá', 1, :negAmount, :negAmount, NULL, NULL, :createdAt, :createdAt)`,
            { replacements: { invoiceId, negAmount: -discountAmount, createdAt }, transaction }
          );
        }

        await queryInterface.sequelize.query(
          `INSERT INTO payments (branch_id, invoice_id, method, status, paid_at, employee_id, idempotency_key, amount, currency, confirmed_at, created_at, updated_at, version)
           VALUES (:branchId, :invoiceId, 'cash', 'paid', :createdAt, :employeeId, :idemKey, :totalAmount, 'VND', :createdAt, :createdAt, :createdAt, 0)`,
          { replacements: { branchId: tx.branchId, invoiceId, createdAt, employeeId, idemKey: `${IDEMPOTENCY_PREFIX}${txIndex}`, totalAmount }, transaction }
        );

        for (let i = 0; i < lines.length; i++) {
          await queryInterface.sequelize.query(
            `INSERT INTO stock_movements (branch_id, extra_id, product_variant_id, type, quantity, unit_cost, note, reference_type, reference_id, actor_user_id, created_at)
             VALUES (:branchId, NULL, :variantId, 'sale', :qty, NULL, NULL, 'sales_order_line', :lineId, NULL, :createdAt)`,
            { replacements: { branchId: tx.branchId, variantId: lines[i].variantId, qty: lines[i].quantity, lineId: lineIds[i], createdAt }, transaction }
          );
          await queryInterface.sequelize.query(
            `UPDATE product_stocks SET quantity = quantity - :qty, version = version + 1, updated_at = :now
             WHERE product_variant_id = :variantId AND branch_id = :branchId`,
            { replacements: { qty: lines[i].quantity, now: new Date(), variantId: lines[i].variantId, branchId: tx.branchId }, transaction }
          );
        }
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const [saleMovements] = await queryInterface.sequelize.query(
      `SELECT sm.product_variant_id, sm.branch_id, sm.quantity
       FROM stock_movements sm
       JOIN sales_order_lines sol ON sm.reference_type = 'sales_order_line' AND sm.reference_id = sol.id
       JOIN sales_orders so ON sol.sales_order_id = so.id
       JOIN invoices i ON i.sales_order_id = so.id
       JOIN payments p ON p.invoice_id = i.id
       WHERE p.idempotency_key LIKE :prefix`,
      { replacements: { prefix: `${IDEMPOTENCY_PREFIX}%` } }
    );
    for (const m of saleMovements) {
      await queryInterface.sequelize.query(
        `UPDATE product_stocks SET quantity = quantity + :qty WHERE product_variant_id = :variantId AND branch_id = :branchId`,
        { replacements: { qty: m.quantity, variantId: m.product_variant_id, branchId: m.branch_id } }
      );
    }

    const [orderRows] = await queryInterface.sequelize.query(
      `SELECT so.id AS orderId, i.id AS invoiceId
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       JOIN sales_orders so ON i.sales_order_id = so.id
       WHERE p.idempotency_key LIKE :prefix`,
      { replacements: { prefix: `${IDEMPOTENCY_PREFIX}%` } }
    );
    const orderIds = orderRows.map((r) => r.orderId);
    const invoiceIds = orderRows.map((r) => r.invoiceId);

    if (orderIds.length) {
      await queryInterface.sequelize.query(
        `DELETE sm FROM stock_movements sm
         JOIN sales_order_lines sol ON sm.reference_type = 'sales_order_line' AND sm.reference_id = sol.id
         WHERE sol.sales_order_id IN (:orderIds)`,
        { replacements: { orderIds } }
      );
      await queryInterface.bulkDelete('invoice_lines', { invoice_id: invoiceIds }, {});
      await queryInterface.bulkDelete('payments', { invoice_id: invoiceIds }, {});
      await queryInterface.bulkDelete('invoices', { id: invoiceIds }, {});
      await queryInterface.bulkDelete('sales_order_lines', { sales_order_id: orderIds }, {});
      await queryInterface.bulkDelete('sales_orders', { id: orderIds }, {});
    }

    for (const branchStock of EXTRA_BRANCH_STOCK) {
      const [variantRows] = await queryInterface.sequelize.query(
        `SELECT id FROM product_variants WHERE sku IN (:skus)`,
        { replacements: { skus: branchStock.items.map((i) => i.sku) } }
      );
      const variantIds = variantRows.map((v) => v.id);
      await queryInterface.bulkDelete('stock_movements', { branch_id: branchStock.branchId, product_variant_id: variantIds, reference_type: 'goods_receipt' }, {});
      await queryInterface.bulkDelete('goods_receipt_items', { product_variant_id: variantIds }, {});
      await queryInterface.bulkDelete('goods_receipts', { branch_id: branchStock.branchId, note: SEED_NOTE }, {});
      await queryInterface.bulkDelete('product_stocks', { branch_id: branchStock.branchId, product_variant_id: variantIds }, {});
    }
  }
};
