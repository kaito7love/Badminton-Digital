const express = require('express');
const router = express.Router();
const realtimeController = require('../controllers/realtimeController');
const sseAuthMiddleware = require('../middleware/sseAuthMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');

router.get(
  '/stream',
  sseAuthMiddleware,
  (req, res, next) => {
    // EventSource của trình duyệt không set được header tuỳ ý — chấp nhận
    // branchId qua query string (cần cho admin đang xem 1 chi nhánh cụ thể
    // qua bộ chuyển chi nhánh) rồi ánh xạ sang đúng header X-Branch-Id, để
    // dùng lại nguyên branchContextMiddleware như mọi route JSON khác.
    if (req.query.branchId && !req.headers['x-branch-id']) {
      req.headers['x-branch-id'] = String(req.query.branchId);
    }
    next();
  },
  branchContextMiddleware,
  realtimeController.stream
);

module.exports = router;
