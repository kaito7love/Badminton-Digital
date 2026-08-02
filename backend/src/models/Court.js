const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Court = sequelize.define('Court', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('empty', 'playing', 'maintenance'),
      defaultValue: 'empty',
      allowNull: false
    },
    peakPricePerHour: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'peak_price_per_hour'
    },
    offpeakPricePerHour: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'offpeak_price_per_hour'
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'courts',
    timestamps: true,
    underscored: true
  });

  return Court;
};
