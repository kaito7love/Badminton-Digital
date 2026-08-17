const express = require('express');
const router = express.Router();
const onlineOrderController = require('../controllers/onlineOrderController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { placeOrderRules, orderIdRules } = require('../validations/onlineOrderValidation');

// Đơn hàng của chính khách hàng. KHÔNG đi qua branchContextMiddleware: chi
// nhánh nhận hàng do khách chọn trong đơn, không phải chi nhánh công tác của
// một nhân viên. Cũng chỉ mở cho vai trò 'customer' — nhân viên bán hàng cho
// khách tại quầy vẫn dùng /sales-orders như cũ.
router.use(authMiddleware, roleMiddleware(['customer']));

router.get('/', onlineOrderController.getMyOrders);
router.post('/', placeOrderRules, onlineOrderController.placeOrder);
router.get('/:id', orderIdRules, onlineOrderController.getMyOrderById);
router.post('/:id/cancel', orderIdRules, onlineOrderController.cancelMyOrder);

module.exports = router;
