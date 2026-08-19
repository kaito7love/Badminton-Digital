const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
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
    invoiceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'invoice_id'
    },
    method: {
      type: DataTypes.ENUM('cash', 'transfer'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded'),
      defaultValue: 'pending',
      allowNull: false
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'paid_at'
    },
    // NULL cho giao dịch xác nhận qua webhook (đơn online tự chuyển khoản) —
    // không có nhân viên nào đứng quầy xử lý những giao dịch đó.
    employeeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'employee_id'
    },
    idempotencyKey: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'idempotency_key'
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'VND'
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    providerReference: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'provider_reference'
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'confirmed_at'
    },
    webhookPayload: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'webhook_payload'
    }
  }, {
    tableName: 'payments',
    timestamps: true,
    underscored: true,
    paranoid: true,
    version: true
  });

  return Payment;
};
