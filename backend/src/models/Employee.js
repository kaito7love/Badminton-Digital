const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Employee = sequelize.define('Employee', {
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
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'user_id'
    },
    position: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    shift: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    hiredAt: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'hired_at'
    }
  }, {
    tableName: 'employees',
    timestamps: true,
    underscored: true,
    paranoid: true,
    version: true
  });

  return Employee;
};
