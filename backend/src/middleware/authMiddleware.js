const { verifyAccessToken } = require('../utils/jwt');
const { User, Role, Employee, Customer } = require('../models');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Không tìm thấy Access Token xác thực.',
        errors: null
      });
    }

    const token = authHeader.split(' ')[1];
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

module.exports = authMiddleware;
