const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ExtraStock = sequelize.define(
    "ExtraStock",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      extraId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "extra_id",
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
      tableName: "extra_stocks",
      timestamps: true,
      underscored: true,
      version: true,
    },
  );

  return ExtraStock;
};
