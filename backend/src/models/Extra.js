const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Extra = sequelize.define(
    "Extra",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      stockQuantity: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "stock_quantity",
      },
      lowStockThreshold: {
        type: DataTypes.INTEGER,
        defaultValue: 5,
        field: "low_stock_threshold",
      },
    },
    {
      tableName: "extras",
      timestamps: true,
      underscored: true,
      paranoid: true,
      version: true,
    },
  );

  return Extra;
};
