const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const CourtSession = sequelize.define(
    "CourtSession",
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
      courtId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "court_id",
      },
      bookingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "booking_id",
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "customer_id",
      },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "employee_id",
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "start_time",
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "end_time",
      },
      durationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "duration_seconds",
      },
      courtFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "court_fee",
      },
      // Chuyển sân giữa phiên: tiền các đoạn đã chơi ở sân trước được chốt vào
      // accruedCourtFee (chưa làm tròn), billedFrom là đầu đoạn đang tính theo
      // giá sân hiện tại. null = chưa chuyển sân lần nào, tính từ startTime.
      // Xem priceCalculator.calculateSessionCourtFee.
      billedFrom: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "billed_from",
      },
      accruedCourtFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        field: "accrued_court_fee",
      },
      status: {
        type: DataTypes.ENUM("playing", "closed"),
        defaultValue: "playing",
        allowNull: false,
      },
    },
    {
      tableName: "court_sessions",
      timestamps: true,
      underscored: true,
      paranoid: true,
      version: true,
    },
  );

  return CourtSession;
};
