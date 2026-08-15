const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InvoiceLine = sequelize.define(
    'InvoiceLine',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      invoiceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'invoice_id',
      },
      lineKind: {
        type: DataTypes.ENUM('court_time', 'product', 'rental', 'discount', 'tax', 'other'),
        allowNull: false,
        field: 'line_kind',
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: 'unit_price',
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      referenceType: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'reference_type',
      },
      referenceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'reference_id',
      },
    },
    {
      tableName: 'invoice_lines',
      timestamps: true,
      underscored: true,
    },
  );

  return InvoiceLine;
};
