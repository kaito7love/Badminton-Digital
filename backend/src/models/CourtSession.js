const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CourtSession = sequelize.define('CourtSession', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    courtId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'court_id'
    },
    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'booking_id'
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'customer_id'
    },
    employeeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'employee_id'
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_time'
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'end_time'
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_seconds'
    },
    courtFee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'court_fee'
    },
    status: {
      type: DataTypes.ENUM('playing', 'closed'),
      defaultValue: 'playing',
      allowNull: false
    }
  }, {
    tableName: 'court_sessions',
    timestamps: true,
    underscored: true
  });

  return CourtSession;
};
