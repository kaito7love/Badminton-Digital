const { DataTypes } = require("sequelize");

const MOVEMENT_TYPES = [
  "opening_balance",
  "purchase_receipt",
  "sale",
  "sale_return",
  "adjustment_in",
  "adjustment_out",
  "damaged",
  "lost",
];

module.exports = (sequelize) => {
  const StockMovement = sequelize.define(
    "StockMovement",
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
      extraId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "extra_id",
      },
      productVariantId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "product_variant_id",
      },
      type: {
        type: DataTypes.ENUM(...MOVEMENT_TYPES),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      unitCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: "unit_cost",
      },
      note: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      referenceType: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: "reference_type",
      },
      referenceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "reference_id",
      },
      actorUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "actor_user_id",
      },
    },
    {
      tableName: "stock_movements",
      timestamps: true,
      underscored: true,
      updatedAt: false,
    },
  );

  StockMovement.MOVEMENT_TYPES = MOVEMENT_TYPES;
  StockMovement.INCOMING_TYPES = ["opening_balance", "purchase_receipt", "sale_return", "adjustment_in"];
  StockMovement.OUTGOING_TYPES = ["sale", "adjustment_out", "damaged", "lost"];

  return StockMovement;
};
