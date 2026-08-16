const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductVariant = sequelize.define(
    "ProductVariant",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "product_id",
      },
      sku: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      size: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      color: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      listPrice: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: "list_price",
      },
      trackInventory: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: "track_inventory",
      },
      lowStockThreshold: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
        field: "low_stock_threshold",
      },
    },
    {
      tableName: "product_variants",
      timestamps: true,
      underscored: true,
    },
  );

  return ProductVariant;
};
