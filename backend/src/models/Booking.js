const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Booking = sequelize.define('Booking', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    branchId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'branch_id'
    },
    courtId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'court_id'
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'customer_id'
    },
    customerName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'guest_name'
    },
    customerPhone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'guest_phone'
    },
    bookingDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'booking_date'
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
      field: 'start_time'
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
      field: 'end_time'
    },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'completed'),
      defaultValue: 'pending',
      allowNull: false
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'created_by'
    }
  }, {
    tableName: 'bookings',
    timestamps: true,
    underscored: true,
    paranoid: true,
    version: true
  });

  return Booking;
};
