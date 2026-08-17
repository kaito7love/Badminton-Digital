const { DataTypes } = require("sequelize");

const CHANNELS = ["session", "pos", "online"];
const STATUSES = ["draft", "open", "paid", "cancelled"];

module.exports = (sequelize) => {
  const SalesOrder = sequelize.define(
    "SalesOrder",
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
      channel: {
        type: DataTypes.ENUM(...CHANNELS),
        allowNull: false,
        defaultValue: "session",
      },
      sessionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "session_id",
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "customer_id",
      },
      cashierEmployeeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "cashier_employee_id",
      },
      // Chỉ dùng cho đơn 'online': ai tới quầy lấy hàng và dặn gì thêm. Đơn POS
      // để trống vì khách đang đứng ngay đó.
      contactName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: "contact_name",
      },
      contactPhone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "contact_phone",
      },
      customerNote: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: "customer_note",
      },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: "open",
      },
    },
    {
      tableName: "sales_orders",
      timestamps: true,
      underscored: true,
      version: true,
    },
  );

  SalesOrder.CHANNELS = CHANNELS;
  SalesOrder.STATUSES = STATUSES;

  return SalesOrder;
};
