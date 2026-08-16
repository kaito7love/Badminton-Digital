const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Invoice = sequelize.define(
    "Invoice",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "branch_id",
      },
      invoiceNo: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: "invoice_no",
      },
      status: {
        type: DataTypes.ENUM("draft", "issued", "paid", "void"),
        allowNull: false,
      },
      salesOrderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "sales_order_id",
      },
      sessionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
        field: "session_id",
      },
      courtFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: "court_fee",
      },
      extrasFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: "extras_fee",
      },
      discountAmount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.0,
        field: "discount_amount",
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: "total_amount",
      },
    },
    {
      tableName: "invoices",
      timestamps: true,
      underscored: true,
      paranoid: true,
      version: true,
    },
  );

  return Invoice;
};
