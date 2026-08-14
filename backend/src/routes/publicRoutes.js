const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const PublicCatalogService = require('../services/PublicCatalogService');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Nhóm route DUY NHẤT không đi qua authMiddleware. Mọi thứ thêm vào đây phải là
// thông tin quán sẵn sàng dán ngoài cửa, và phải là chỉ-đọc.

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((err) => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formatted, 400);
  }
  next();
};

const branchRule = query('branchId').optional().isInt({ min: 1 }).withMessage('branchId phải là số nguyên dương');

router.get('/courts', [branchRule, validate], async (req, res, next) => {
  try {
    const data = await PublicCatalogService.getCourts(req.query.branchId || null);
    return successResponse(res, data, 'Danh sách sân');
  } catch (err) {
    next(err);
  }
});

router.get(
  '/availability',
  [
    query('courtId').isInt({ min: 1 }).withMessage('courtId là bắt buộc'),
    query('bookingDate').isISO8601().withMessage('bookingDate phải dạng YYYY-MM-DD'),
    query('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('startTime phải dạng HH:mm'),
    query('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('endTime phải dạng HH:mm'),
    branchRule,
    validate
  ],
  async (req, res, next) => {
    try {
      const data = await PublicCatalogService.checkAvailability({
        courtId: req.query.courtId,
        bookingDate: req.query.bookingDate,
        startTime: req.query.startTime,
        endTime: req.query.endTime,
        branchId: req.query.branchId || null
      });
      return successResponse(res, data, 'Kết quả kiểm tra khung giờ');
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
