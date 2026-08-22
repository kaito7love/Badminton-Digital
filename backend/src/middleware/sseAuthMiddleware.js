const { verifyAccessToken } = require('../utils/jwt');
const { User, Role, Employee, Customer } = require('../models');

/**
 * Biến thể của authMiddleware.js dành riêng cho kết nối SSE — EventSource
 * của trình duyệt không set được header Authorization tuỳ ý, nên access
 * token phải truyền qua query string (?token=...). Không sửa
 * authMiddleware.js gốc để tránh ảnh hưởng mọi route JSON khác — chỉ route
 * /realtime/stream dùng bản này. Vẫn chấp nhận header Authorization nếu có
 * (gọi thử bằng Postman/curl không cần query).
 */
const sseAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const token = headerToken || req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Không tìm thấy Access Token xác thực.',
        errors: null
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Access Token không hợp lệ hoặc đã hết hạn.',
        errors: null
      });
    }

    const user = await User.findByPk(decoded.id, {
      include: [
        { model: Role, as: 'role' },
        { model: Employee, as: 'employee' },
        { model: Customer, as: 'customer' }
      ]
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Tài khoản không tồn tại hoặc đã bị khóa.',
        errors: null
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = sseAuthMiddleware;
