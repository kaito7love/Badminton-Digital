const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Supplier = sequelize.define(
    "Supplier",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      taxCode: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: "tax_code",
      },
      note: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: "is_active",
      },
    },
    {
      tableName: "suppliers",
      timestamps: true,
      underscored: true,
      paranoid: true,
      version: true,
    },
  );

  return Supplier;
};
