const roleMiddleware = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Bạn không có quyền truy cập tài nguyên này.',
        errors: null
      });
    }

    const hasRole = allowedRoles.includes(req.user.role.name);
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        data: null,
        message: `Quyền '${req.user.role.name}' không có quyền thao tác tính năng này.`,
        errors: null
      });
    }

    next();
  };
};

module.exports = roleMiddleware;
