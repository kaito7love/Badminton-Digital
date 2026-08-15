const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GoodsReceiptItem = sequelize.define(
    "GoodsReceiptItem",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      goodsReceiptId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "goods_receipt_id",
      },
      extraId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "extra_id",
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      unitCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: "unit_cost",
      },
      subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
    },
    {
      tableName: "goods_receipt_items",
      timestamps: true,
      underscored: true,
    },
  );

  return GoodsReceiptItem;
};
