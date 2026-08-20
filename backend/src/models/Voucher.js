const { DataTypes } = require('sequelize');

const DISCOUNT_TYPES = ['percent', 'flat'];

module.exports = (sequelize) => {
  const Voucher = sequelize.define('Voucher', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    code: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    discountType: {
      type: DataTypes.ENUM(...DISCOUNT_TYPES),
      allowNull: false,
      field: 'discount_type'
    },
    discountValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'discount_value'
    },
    maxDiscountAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'max_discount_amount'
    },
    minOrderAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'min_order_amount'
    },
    startsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'starts_at'
    },
    endsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ends_at'
    },
    usageLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'usage_limit'
    },
    perCustomerLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'per_customer_limit'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'vouchers',
    timestamps: true,
    underscored: true,
    version: true
  });

  Voucher.DISCOUNT_TYPES = DISCOUNT_TYPES;

  return Voucher;
};
