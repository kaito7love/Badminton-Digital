const { DataTypes } = require("sequelize");

const PRODUCT_TYPES = ["retail", "consumable", "rental", "service"];

module.exports = (sequelize) => {
  const Product = sequelize.define(
    "Product",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "category_id",
      },
      productType: {
        type: DataTypes.ENUM(...PRODUCT_TYPES),
        allowNull: false,
        defaultValue: "retail",
        field: "product_type",
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: "is_active",
      },
      legacyExtraId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "legacy_extra_id",
      },
    },
    {
      tableName: "products",
      timestamps: true,
      underscored: true,
    },
  );

  Product.PRODUCT_TYPES = PRODUCT_TYPES;

  return Product;
};
