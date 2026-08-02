const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'session_id'
    },
    courtFee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'court_fee'
    },
    extrasFee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'extras_fee'
    },
    discountAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      field: 'discount_amount'
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'total_amount'
    }
  }, {
    tableName: 'invoices',
    timestamps: true,
    underscored: true
  });

  return Invoice;
};
