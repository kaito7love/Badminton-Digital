const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Court = sequelize.define(
    "Court",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "branch_id",
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      // Chỉ mô tả vòng đời khai thác của sân. Việc "đang có người chơi" không lưu
      // ở đây mà suy ra từ court_sessions đang mở — xem CourtService.formatCourt.
      status: {
        type: DataTypes.ENUM("active", "maintenance", "inactive"),
        defaultValue: "active",
        allowNull: false,
      },
      peakPricePerHour: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: "peak_price_per_hour",
      },
      offpeakPricePerHour: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: "offpeak_price_per_hour",
      },
      note: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: "courts",
      timestamps: true,
      underscored: true,
      paranoid: true,
      version: true,
    },
  );

  return Court;
};
