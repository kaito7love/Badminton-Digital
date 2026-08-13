const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SessionExtra = sequelize.define('SessionExtra', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'session_id'
    },
    extraId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'extra_id'
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'unit_price'
    },
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    }
  }, {
    tableName: 'session_extras',
    timestamps: true,
    underscored: true,
    paranoid: true,
    version: true
  });

  return SessionExtra;
};
