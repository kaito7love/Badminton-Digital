const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductCategory = sequelize.define(
    "ProductCategory",
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
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "sort_order",
      },
    },
    {
      tableName: "product_categories",
      timestamps: true,
      underscored: true,
    },
  );

  return ProductCategory;
};
