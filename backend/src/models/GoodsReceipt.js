const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GoodsReceipt = sequelize.define(
    "GoodsReceipt",
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
      code: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      supplierId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "supplier_id",
      },
      receivedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "received_by_user_id",
      },
      note: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      totalCost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        field: "total_cost",
      },
    },
    {
      tableName: "goods_receipts",
      timestamps: true,
      underscored: true,
      version: true,
    },
  );

  return GoodsReceipt;
};
