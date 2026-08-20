const express = require('express');
const router = express.Router();
const voucherController = require('../controllers/voucherController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { createVoucherRules, updateVoucherRules, voucherIdRules, previewVoucherRules } = require('../validations/voucherValidation');

router.use(authMiddleware, branchContextMiddleware);

// Xem trước số tiền giảm — mọi vai trò đã đăng nhập đều gọi được: khách hàng
// ở trang checkout, nhân viên/thu ngân khi áp mã tại quầy POS.
router.post('/preview', previewVoucherRules, voucherController.preview);

// Quản trị mã giảm giá — chỉ admin/branch_manager, vì mã dùng chung toàn
// chuỗi (Voucher không có branchId riêng).
router.get('/', roleMiddleware(['admin', 'branch_manager']), voucherController.list);
router.get('/:id', roleMiddleware(['admin', 'branch_manager']), voucherIdRules, voucherController.getById);
router.post('/', roleMiddleware(['admin', 'branch_manager']), createVoucherRules, voucherController.create);
router.put('/:id', roleMiddleware(['admin', 'branch_manager']), updateVoucherRules, voucherController.update);
router.post('/:id/deactivate', roleMiddleware(['admin', 'branch_manager']), voucherIdRules, voucherController.deactivate);

module.exports = router;
