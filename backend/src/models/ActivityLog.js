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
      allowNull: true,
      field: 'employee_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id'
    },
    branchId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'branch_id'
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
    },
    oldValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'old_values'
    },
    newValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'new_values'
    },
    requestId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'request_id'
    }
  }, {
    tableName: 'activity_logs',
    timestamps: true,
    underscored: true
  });

  return ActivityLog;
};
