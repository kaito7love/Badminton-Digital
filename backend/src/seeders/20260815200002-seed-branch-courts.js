'use strict';

const { assertDemoSeedAllowed } = require('../utils/demoSeedGuard');

// Mỗi chi nhánh có hệ thống sân riêng (courts.branch_id đã cách ly đầy đủ ở
// tầng service — xem CourtService). Vấn đề chỉ là 2 chi nhánh demo (Quận 3,
// Quận 7) tạo ở 20260815200001 chưa có sân nào nên trang "Quản Lý Sân" trống
// trơn khi đăng nhập bằng tài khoản của 2 chi nhánh đó. Seeder này bổ sung
// sân mẫu cho từng chi nhánh, số lượng/giá khác nhau để thấy rõ đây là 2 hệ
// thống sân độc lập, không phải chia sẻ chung.

const COURTS_BY_BRANCH_CODE = {
  Q3: [
    { name: 'Sân số 1 (Thường)', status: 'active', peak: 85000, offpeak: 55000 },
    { name: 'Sân số 2 (Thường)', status: 'active', peak: 85000, offpeak: 55000 },
    { name: 'Sân VIP (Thảm Yonex)', status: 'active', peak: 130000, offpeak: 95000 }
  ],
  Q7: [
    { name: 'Sân số 1 (Thường)', status: 'active', peak: 95000, offpeak: 65000 },
    { name: 'Sân số 2 (Thường)', status: 'active', peak: 95000, offpeak: 65000 },
    { name: 'Sân số 3 (Thường)', status: 'maintenance', peak: 95000, offpeak: 65000, note: 'Đang thay lưới, tạm ngưng nhận khách' }
  ]
};

module.exports = {
  async up(queryInterface) {
    assertDemoSeedAllowed();
    const now = new Date();
    const codes = Object.keys(COURTS_BY_BRANCH_CODE);

    const [branchRows] = await queryInterface.sequelize.query(
      'SELECT id, code FROM branches WHERE code IN (:codes)',
      { replacements: { codes } }
    );
    if (branchRows.length < codes.length) {
      throw new Error('Thiếu chi nhánh demo — chạy seeder 20260815200001-seed-branches-2-3.js trước.');
    }
    const branchIdByCode = Object.fromEntries(branchRows.map((r) => [r.code, r.id]));

    const [existing] = await queryInterface.sequelize.query(
      'SELECT id FROM courts WHERE branch_id IN (:branchIds)',
      { replacements: { branchIds: branchRows.map((r) => r.id) } }
    );
    if (existing.length) {
      throw new Error('Chi nhánh demo đã có sân — seeder này chỉ chạy 1 lần trên môi trường chưa có sân ở Quận 3/Quận 7.');
    }

    await queryInterface.bulkInsert(
      'courts',
      codes.flatMap((code) =>
        COURTS_BY_BRANCH_CODE[code].map((c) => ({
          branch_id: branchIdByCode[code],
          name: c.name,
          status: c.status,
          peak_price_per_hour: c.peak,
          offpeak_price_per_hour: c.offpeak,
          note: c.note || null,
          created_at: now,
          updated_at: now,
          version: 0
        }))
      ),
      {}
    );
  },

  async down(queryInterface) {
    const codes = Object.keys(COURTS_BY_BRANCH_CODE);
    const [branchRows] = await queryInterface.sequelize.query(
      'SELECT id FROM branches WHERE code IN (:codes)',
      { replacements: { codes } }
    );
    const branchIds = branchRows.map((r) => r.id);
    if (branchIds.length) {
      await queryInterface.bulkDelete('courts', { branch_id: branchIds }, {});
    }
  }
};
