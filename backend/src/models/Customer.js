const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Customer = sequelize.define('Customer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    branchId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'branch_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id'
    },
    fullName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'full_name'
    },
    // Cho phép rỗng: khách vãng lai chưa để lại số vẫn là khách hàng, chỉ là hồ sơ
    // thiếu thông tin. Tính duy nhất do unique index (branch_id, phone) đảm nhiệm —
    // vừa cho phép nhiều hồ sơ không số, vừa cho phép hai chi nhánh trùng số.
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    totalSpent: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      field: 'total_spent'
    },
    loyaltyTier: {
      type: DataTypes.STRING(20),
      defaultValue: 'normal',
      field: 'loyalty_tier'
    }
  }, {
    tableName: 'customers',
    timestamps: true,
    underscored: true,
    paranoid: true,
    version: true
  });

  return Customer;
};
