const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ActivityLog = sequelize.define('ActivityLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employeeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'employee_id'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    targetType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'target_type'
    },
    targetId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'target_id'
    }
  }, {
    tableName: 'activity_logs',
    timestamps: true,
    underscored: true
  });

  return ActivityLog;
};
