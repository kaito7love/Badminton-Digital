const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductStock = sequelize.define(
    "ProductStock",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      productVariantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "product_variant_id",
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "branch_id",
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      averageCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: "average_cost",
      },
    },
    {
      tableName: "product_stocks",
      timestamps: true,
      underscored: true,
      version: true,
    },
  );

  return ProductStock;
};
