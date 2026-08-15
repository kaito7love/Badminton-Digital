'use strict';
const bcrypt = require('bcrypt');

// Tạo thêm 2 chi nhánh demo (branch 2, 3) + 1 tài khoản nhân viên riêng cho
// mỗi chi nhánh + vài phiếu nhập kho khác nhau, để thấy trực quan tồn kho là
// tách biệt thật sự giữa các chi nhánh (đăng nhập tài khoản nào thì chỉ thấy
// đúng kho của chi nhánh đó — không có bộ chuyển chi nhánh trong hệ thống).
//
// Giả định: 20260723000001-seed-initial-data.js (roles, extras 1-4) và
// 20260805000001-m1-organizations-branches.js (organization 1, branch 1) đã
// chạy trước.

const ORG_ID = 1;
const BRANCHES = [
  { code: 'Q3', name: 'Chi nhánh Quận 3', address: 'Quận 3, TP. Hồ Chí Minh' },
  { code: 'Q7', name: 'Chi nhánh Quận 7', address: 'Quận 7, TP. Hồ Chí Minh' }
];

// Nhà cung cấp dùng chung toàn hệ thống (đã seed ở 20260815100001) — chi
// nhánh mới vẫn đặt hàng từ cùng danh sách này, chỉ tồn kho là riêng.
const EMPLOYEES = [
  { branchCode: 'Q3', email: 'employee.q3@badminton.com', phone: '0904444444', fullName: 'Nhân Viên Chi Nhánh Quận 3', position: 'Quản lý chi nhánh' },
  { branchCode: 'Q7', email: 'employee.q7@badminton.com', phone: '0905555555', fullName: 'Nhân Viên Chi Nhánh Quận 7', position: 'Quản lý chi nhánh' }
];

// { branchCode, supplierName, note, items: [{ extraId, quantity, unitCost }] }
const RECEIPTS = [
  {
    branchCode: 'Q3',
    supplierName: 'Yonex Việt Nam',
    note: 'Nhập hàng khai trương chi nhánh Quận 3',
    items: [
      { extraId: 1, quantity: 60, unitCost: 17000 },
      { extraId: 3, quantity: 80, unitCost: 6500 }
    ]
  },
  {
    branchCode: 'Q7',
    supplierName: 'Kho vật tư thể thao Miền Nam',
    note: 'Nhập hàng khai trương chi nhánh Quận 7',
    items: [
      { extraId: 2, quantity: 15, unitCost: 21000 },
      { extraId: 4, quantity: 60, unitCost: 10500 }
    ]
  }
];

const PASSWORD = 'Employee@123';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [existing] = await queryInterface.sequelize.query(
      'SELECT code FROM branches WHERE code IN (:codes)',
      { replacements: { codes: BRANCHES.map((b) => b.code) } }
    );
    if (existing.length) {
      throw new Error(
        `Chi nhánh đã tồn tại: ${existing.map((r) => r.code).join(', ')}. Seeder này chỉ chạy 1 lần trên môi trường chưa có 2 chi nhánh demo này.`
      );
    }

    // 1. Branches
    await queryInterface.bulkInsert(
      'branches',
      BRANCHES.map((b) => ({
        organization_id: ORG_ID,
        code: b.code,
        name: b.name,
        timezone: 'Asia/Ho_Chi_Minh',
        address: b.address,
        is_active: true,
        created_at: now,
        updated_at: now
      })),
      {}
    );
    const [branchRows] = await queryInterface.sequelize.query(
      'SELECT id, code FROM branches WHERE code IN (:codes)',
      { replacements: { codes: BRANCHES.map((b) => b.code) } }
    );
    const branchIdByCode = Object.fromEntries(branchRows.map((r) => [r.code, r.id]));

    // 2. Document sequences (invoice + goods_receipt) cho từng chi nhánh mới —
    //    thiếu dòng này thì checkout/nhập kho ở chi nhánh mới sẽ lỗi 500.
    await queryInterface.bulkInsert(
      'branch_document_sequences',
      branchRows.flatMap((b) => [
        { branch_id: b.id, document_type: 'invoice', next_value: 1, created_at: now, updated_at: now },
        { branch_id: b.id, document_type: 'goods_receipt', next_value: 1, created_at: now, updated_at: now }
      ]),
      {}
    );

    // 3. Tài khoản nhân viên riêng cho từng chi nhánh
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await queryInterface.bulkInsert(
      'users',
      EMPLOYEES.map((e) => ({
        role_id: 2, // employee
        email: e.email,
        password_hash: passwordHash,
        full_name: e.fullName,
        phone: e.phone,
        is_active: true,
        created_at: now,
        updated_at: now,
        version: 0
      })),
      {}
    );
    const [userRows] = await queryInterface.sequelize.query(
      'SELECT id, email FROM users WHERE email IN (:emails)',
      { replacements: { emails: EMPLOYEES.map((e) => e.email) } }
    );
    const userIdByEmail = Object.fromEntries(userRows.map((r) => [r.email, r.id]));

    await queryInterface.bulkInsert(
      'employees',
      EMPLOYEES.map((e) => ({
        user_id: userIdByEmail[e.email],
        branch_id: branchIdByCode[e.branchCode],
        position: e.position,
        shift: 'Toàn thời gian',
        hired_at: now,
        created_at: now,
        updated_at: now,
        version: 0
      })),
      {}
    );

    // 4. Phiếu nhập kho khai trương — số liệu khác hẳn chi nhánh 1 để thấy
    //    ngay sự tách biệt khi đăng nhập từng tài khoản.
    const [supplierRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM suppliers WHERE name IN (:names)',
      { replacements: { names: [...new Set(RECEIPTS.map((r) => r.supplierName))] } }
    );
    const supplierIdByName = Object.fromEntries(supplierRows.map((r) => [r.name, r.id]));
    if (Object.keys(supplierIdByName).length < new Set(RECEIPTS.map((r) => r.supplierName)).size) {
      throw new Error('Thiếu nhà cung cấp mẫu — chạy seeder 20260815100001-seed-inventory-sample-data.js trước.');
    }

    for (const r of RECEIPTS) {
      const branchId = branchIdByCode[r.branchCode];
      const [[seqRow]] = await queryInterface.sequelize.query(
        "SELECT next_value FROM branch_document_sequences WHERE branch_id = :branchId AND document_type = 'goods_receipt'",
        { replacements: { branchId } }
      );
      const code = `GR-${branchId}-${String(Number(seqRow.next_value)).padStart(8, '0')}`;

      await queryInterface.bulkInsert(
        'goods_receipts',
        [{
          branch_id: branchId,
          code,
          supplier_id: supplierIdByName[r.supplierName],
          received_by_user_id: userIdByEmail[EMPLOYEES.find((e) => e.branchCode === r.branchCode).email],
          note: r.note,
          total_cost: r.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
          created_at: now,
          updated_at: now,
          version: 0
        }],
        {}
      );
      const [[receiptRow]] = await queryInterface.sequelize.query(
        'SELECT id FROM goods_receipts WHERE branch_id = :branchId AND code = :code',
        { replacements: { branchId, code } }
      );

      await queryInterface.bulkInsert(
        'goods_receipt_items',
        r.items.map((i) => ({
          goods_receipt_id: receiptRow.id,
          extra_id: i.extraId,
          quantity: i.quantity,
          unit_cost: i.unitCost,
          subtotal: i.quantity * i.unitCost,
          created_at: now,
          updated_at: now
        })),
        {}
      );

      await queryInterface.bulkInsert(
        'stock_movements',
        r.items.map((i) => ({
          branch_id: branchId,
          extra_id: i.extraId,
          type: 'purchase_receipt',
          quantity: i.quantity,
          unit_cost: i.unitCost,
          note: r.note,
          reference_type: 'goods_receipt',
          reference_id: receiptRow.id,
          actor_user_id: userIdByEmail[EMPLOYEES.find((e) => e.branchCode === r.branchCode).email],
          created_at: now
        })),
        {}
      );

      for (const i of r.items) {
        await queryInterface.sequelize.query(
          `INSERT INTO extra_stocks (extra_id, branch_id, quantity, average_cost, created_at, updated_at, version)
           VALUES (:extraId, :branchId, :quantity, :unitCost, :now, :now, 0)
           ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), average_cost = VALUES(average_cost), updated_at = VALUES(updated_at), version = version + 1`,
          { replacements: { extraId: i.extraId, branchId, quantity: i.quantity, unitCost: i.unitCost.toFixed(2), now } }
        );
      }

      await queryInterface.sequelize.query(
        "UPDATE branch_document_sequences SET next_value = next_value + 1 WHERE branch_id = :branchId AND document_type = 'goods_receipt'",
        { replacements: { branchId } }
      );
    }
  },

  async down(queryInterface) {
    const [branchRows] = await queryInterface.sequelize.query(
      'SELECT id, code FROM branches WHERE code IN (:codes)',
      { replacements: { codes: BRANCHES.map((b) => b.code) } }
    );
    const branchIds = branchRows.map((r) => r.id);
    if (!branchIds.length) return;

    await queryInterface.sequelize.query('DELETE FROM stock_movements WHERE branch_id IN (:branchIds)', { replacements: { branchIds } });
    const [receiptRows] = await queryInterface.sequelize.query('SELECT id FROM goods_receipts WHERE branch_id IN (:branchIds)', { replacements: { branchIds } });
    const receiptIds = receiptRows.map((r) => r.id);
    if (receiptIds.length) {
      await queryInterface.bulkDelete('goods_receipt_items', { goods_receipt_id: receiptIds }, {});
      await queryInterface.bulkDelete('goods_receipts', { id: receiptIds }, {});
    }
    await queryInterface.bulkDelete('extra_stocks', { branch_id: branchIds }, {});
    await queryInterface.bulkDelete('employees', { branch_id: branchIds }, {});

    const [userRows] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email IN (:emails)',
      { replacements: { emails: EMPLOYEES.map((e) => e.email) } }
    );
    const userIds = userRows.map((r) => r.id);
    if (userIds.length) {
      await queryInterface.bulkDelete('users', { id: userIds }, {});
    }

    await queryInterface.bulkDelete('branch_document_sequences', { branch_id: branchIds }, {});
    await queryInterface.bulkDelete('branches', { id: branchIds }, {});
  }
};
