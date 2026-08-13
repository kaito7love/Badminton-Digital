const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Branch",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organizationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "organization_id",
      },
      code: { type: DataTypes.STRING(32), allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      timezone: { type: DataTypes.STRING(64), allowNull: false },
      address: { type: DataTypes.STRING(500), allowNull: true },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        field: "is_active",
      },
    },
    {
      tableName: "branches",
      timestamps: true,
      underscored: true,
    },
  );
