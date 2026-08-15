'use strict';

// Dữ liệu mẫu để test tay tính năng kho mới (nhà cung cấp, phiếu nhập kho,
// sổ nhật ký kho, giá vốn bình quân gia quyền). Giả định seeder ban đầu
// (20260723000001-seed-initial-data.js) và migration M1 (branch id=1) đã
// chạy trước — dùng extras id 1-4 và branch id=1 do 2 file đó tạo ra.
//
// Không hardcode id cho suppliers/goods_receipts vì các bảng này có thể đã
// có dữ liệu thật (kể cả bản ghi đã soft-delete) — tra lại id sau khi insert
// bằng khoá tự nhiên (name/code) thay vì giả định auto-increment bắt đầu từ 1.

const BRANCH_ID = 1;
const ADMIN_USER_ID = 1;

const SUPPLIERS = [
  {
    name: 'Yonex Việt Nam',
    phone: '0281234567',
    email: 'sales@yonex.vn',
    address: 'Quận 1, TP. Hồ Chí Minh',
    tax_code: '0301234567',
    note: 'Nhà phân phối chính hãng cầu lông & vợt'
  },
  {
    name: 'Đại lý nước giải khát Sài Gòn',
    phone: '0287654321',
    email: null,
    address: 'Quận 5, TP. Hồ Chí Minh',
    tax_code: null,
    note: 'Chuyên nước suối, nước điện giải bán sỉ'
  },
  {
    name: 'Kho vật tư thể thao Miền Nam',
    phone: '0909888777',
    email: 'contact@mnsports.vn',
    address: 'Quận 7, TP. Hồ Chí Minh',
    tax_code: '0309876543',
    note: null
  }
];

// { supplierName, note, items: [{ extraId, quantity, unitCost }] }
const RECEIPTS = [
  {
    supplierName: 'Yonex Việt Nam',
    note: 'Nhập cầu lông đầu tháng',
    items: [{ extraId: 1, quantity: 100, unitCost: 18000 }]
  },
  {
    supplierName: 'Yonex Việt Nam',
    note: 'Nhập vợt cho thuê',
    items: [{ extraId: 2, quantity: 20, unitCost: 22000 }]
  },
  {
    supplierName: 'Đại lý nước giải khát Sài Gòn',
    note: 'Nhập nước uống phục vụ quầy',
    items: [
      { extraId: 3, quantity: 200, unitCost: 7000 },
      { extraId: 4, quantity: 150, unitCost: 11000 }
    ]
  },
  {
    supplierName: 'Yonex Việt Nam',
    note: 'Nhập bổ sung cầu lông đợt 2 (giá nhích lên)',
    items: [{ extraId: 1, quantity: 50, unitCost: 19000 }]
  }
];

// { extraId, type, quantity, note }
const ADJUSTMENTS = [
  { extraId: 1, type: 'damaged', quantity: 5, note: 'Vỡ khi vận chuyển từ nhà cung cấp' },
  { extraId: 3, type: 'adjustment_out', quantity: 10, note: 'Thất lạc khi kiểm kê đầu kỳ' }
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // An toàn: seeder này SET tồn kho tuyệt đối cho extras 1-4 (không cộng dồn),
    // nên chỉ chạy khi các sản phẩm đó đang thật sự chưa có tồn kho — tránh đè
    // mất số liệu thật nếu ai đó đã "Nhập kho" tay trước khi chạy seeder demo này.
    const demoExtraIds = [...new Set(RECEIPTS.flatMap((r) => r.items.map((i) => i.extraId)))];
    const [[{ total }]] = await queryInterface.sequelize.query(
      'SELECT COALESCE(SUM(quantity), 0) AS total FROM extra_stocks WHERE branch_id = :branchId AND extra_id IN (:extraIds)',
      { replacements: { branchId: BRANCH_ID, extraIds: demoExtraIds } }
    );
    if (Number(total) > 0) {
      throw new Error(
        'extras 1-4 tại branch 1 đã có tồn kho thật (tổng = ' + total + '). ' +
        'Seeder dữ liệu mẫu này chỉ dành cho môi trường demo/mới cài — chạy "npx sequelize-cli db:seed:undo --seed 20260815100001-seed-inventory-sample-data.js" nếu đã chạy trước đó, hoặc bỏ qua seeder này trên DB có dữ liệu thật.'
      );
    }

    // 1. Suppliers
    await queryInterface.bulkInsert(
      'suppliers',
      SUPPLIERS.map((s) => ({ ...s, is_active: true, created_at: now, updated_at: now, version: 0 })),
      {}
    );
    const [supplierRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM suppliers WHERE name IN (:names)',
      { replacements: { names: SUPPLIERS.map((s) => s.name) } }
    );
    const supplierIdByName = Object.fromEntries(supplierRows.map((r) => [r.name, r.id]));

    // 2. Goods receipts — sinh code kế tiếp đúng theo sequence thật của chi nhánh
    const [[seqRow]] = await queryInterface.sequelize.query(
      "SELECT next_value FROM branch_document_sequences WHERE branch_id = :branchId AND document_type = 'goods_receipt'",
      { replacements: { branchId: BRANCH_ID } }
    );
    if (!seqRow) {
      throw new Error('Chưa có sequence goods_receipt cho branch — chạy migration inventory-foundation trước.');
    }
    let nextValue = Number(seqRow.next_value);
    const receiptsWithCode = RECEIPTS.map((r) => ({
      ...r,
      code: `GR-${BRANCH_ID}-${String(nextValue++).padStart(8, '0')}`
    }));

    await queryInterface.bulkInsert(
      'goods_receipts',
      receiptsWithCode.map((r) => ({
        branch_id: BRANCH_ID,
        code: r.code,
        supplier_id: supplierIdByName[r.supplierName],
        received_by_user_id: ADMIN_USER_ID,
        note: r.note,
        total_cost: r.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
        created_at: now,
        updated_at: now,
        version: 0
      })),
      {}
    );
    const [receiptRows] = await queryInterface.sequelize.query(
      'SELECT id, code FROM goods_receipts WHERE code IN (:codes)',
      { replacements: { codes: receiptsWithCode.map((r) => r.code) } }
    );
    const receiptIdByCode = Object.fromEntries(receiptRows.map((r) => [r.code, r.id]));

    await queryInterface.bulkInsert(
      'goods_receipt_items',
      receiptsWithCode.flatMap((r) =>
        r.items.map((i) => ({
          goods_receipt_id: receiptIdByCode[r.code],
          extra_id: i.extraId,
          quantity: i.quantity,
          unit_cost: i.unitCost,
          subtotal: i.quantity * i.unitCost,
          created_at: now,
          updated_at: now
        }))
      ),
      {}
    );

    // 3. Ledger — 1 dòng purchase_receipt cho mỗi dòng phiếu nhập
    const purchaseMovements = receiptsWithCode.flatMap((r) =>
      r.items.map((i) => ({
        branch_id: BRANCH_ID,
        extra_id: i.extraId,
        type: 'purchase_receipt',
        quantity: i.quantity,
        unit_cost: i.unitCost,
        note: r.note,
        reference_type: 'goods_receipt',
        reference_id: receiptIdByCode[r.code],
        actor_user_id: ADMIN_USER_ID,
        created_at: now
      }))
    );
    const adjustmentMovements = ADJUSTMENTS.map((a) => ({
      branch_id: BRANCH_ID,
      extra_id: a.extraId,
      type: a.type,
      quantity: a.quantity,
      unit_cost: null,
      note: a.note,
      reference_type: 'manual',
      reference_id: null,
      actor_user_id: ADMIN_USER_ID,
      created_at: now
    }));
    await queryInterface.bulkInsert('stock_movements', [...purchaseMovements, ...adjustmentMovements], {});

    // 4. Cập nhật tồn kho + giá vốn bình quân gia quyền cho extra_stocks (branch 1)
    //    — cùng công thức InventoryService.computeAverageCost, tính tay ở đây
    //    vì seeder chạy độc lập với service layer.
    const stockByExtra = {};
    for (const r of receiptsWithCode) {
      for (const i of r.items) {
        const s = stockByExtra[i.extraId] || { quantity: 0, averageCost: 0 };
        const totalQty = s.quantity + i.quantity;
        s.averageCost = totalQty > 0 ? (s.quantity * s.averageCost + i.quantity * i.unitCost) / totalQty : i.unitCost;
        s.quantity = totalQty;
        stockByExtra[i.extraId] = s;
      }
    }
    for (const a of ADJUSTMENTS) {
      const s = stockByExtra[a.extraId];
      const isOutgoing = ['adjustment_out', 'damaged', 'lost'].includes(a.type);
      s.quantity += isOutgoing ? -a.quantity : a.quantity;
    }

    for (const [extraId, s] of Object.entries(stockByExtra)) {
      await queryInterface.sequelize.query(
        `UPDATE extra_stocks SET quantity = :quantity, average_cost = :averageCost, version = version + 1, updated_at = :now
         WHERE extra_id = :extraId AND branch_id = :branchId`,
        { replacements: { quantity: s.quantity, averageCost: s.averageCost.toFixed(2), now, extraId: Number(extraId), branchId: BRANCH_ID } }
      );
    }

    // 5. Đồng bộ lại sequence cho đúng số phiếu đã dùng
    await queryInterface.sequelize.query(
      "UPDATE branch_document_sequences SET next_value = :nextValue WHERE branch_id = :branchId AND document_type = 'goods_receipt'",
      { replacements: { nextValue, branchId: BRANCH_ID } }
    );
  },

  async down(queryInterface) {
    const [receiptRows] = await queryInterface.sequelize.query(
      "SELECT id FROM goods_receipts WHERE branch_id = :branchId AND note IN (:notes)",
      { replacements: { branchId: BRANCH_ID, notes: RECEIPTS.map((r) => r.note) } }
    );
    const receiptIds = receiptRows.map((r) => r.id);

    if (receiptIds.length) {
      await queryInterface.sequelize.query(
        "DELETE FROM stock_movements WHERE reference_type = 'goods_receipt' AND reference_id IN (:ids)",
        { replacements: { ids: receiptIds } }
      );
      await queryInterface.bulkDelete('goods_receipt_items', { goods_receipt_id: receiptIds }, {});
      await queryInterface.bulkDelete('goods_receipts', { id: receiptIds }, {});
    }

    await queryInterface.sequelize.query(
      "DELETE FROM stock_movements WHERE reference_type = 'manual' AND note IN (:notes)",
      { replacements: { notes: ADJUSTMENTS.map((a) => a.note) } }
    );

    await queryInterface.bulkDelete('suppliers', { name: SUPPLIERS.map((s) => s.name) }, {});

    const extraIds = [...new Set(RECEIPTS.flatMap((r) => r.items.map((i) => i.extraId)))];
    await queryInterface.sequelize.query(
      'UPDATE extra_stocks SET quantity = 0, average_cost = NULL WHERE branch_id = :branchId AND extra_id IN (:extraIds)',
      { replacements: { branchId: BRANCH_ID, extraIds } }
    );
  }
};
