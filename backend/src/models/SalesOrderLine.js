const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const SalesOrderLine = sequelize.define(
    "SalesOrderLine",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      salesOrderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "sales_order_id",
      },
      variantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "variant_id",
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: "unit_price",
      },
      lineTotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: "line_total",
      },
      legacySessionExtraId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "legacy_session_extra_id",
      },
    },
    {
      tableName: "sales_order_lines",
      timestamps: true,
      underscored: true,
    },
  );

  return SalesOrderLine;
};
