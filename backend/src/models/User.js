const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "role_id",
      },
      email: {
        // Khách đặt sân online chỉ có số điện thoại, nên email không còn bắt
        // buộc. Ràng buộc "phải có ít nhất một trong hai" nằm ở tầng DB
        // (chk_users_login_identity) — tài khoản trống cả hai thì không ai
        // đăng nhập vào được.
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: "password_hash",
      },
      fullName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: "full_name",
      },
      phone: {
        // Là danh tính đăng nhập, nên phải duy nhất. NULL không bị UNIQUE chặn,
        // nhân viên cũ chưa khai số vẫn dùng email như cũ.
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
      },
      avatarUrl: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "avatar_url",
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: "is_active",
      },
      refreshToken: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "refresh_token",
      },
    },
    {
      tableName: "users",
      timestamps: true,
      underscored: true,
      paranoid: true,
      version: true,
    },
  );

  return User;
};
