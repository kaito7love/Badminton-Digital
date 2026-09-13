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
        // `name` phải trùng tên index thật trong DB: Sequelize dựa vào đó để
        // biết lỗi trùng thuộc cột nào, nhờ vậy response 409 báo đúng field.
        unique: { name: "email", msg: "Email này đã được dùng cho tài khoản khác." },
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
        unique: { name: "uq_users_phone", msg: "Số điện thoại này đã có tài khoản khác." },
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
        // Chỉ lưu sha256 của refresh token (xem hashRefreshToken trong utils/jwt.js).
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
      // passwordHash/refreshToken không bao giờ theo bản ghi đi ra ngoài, kể cả
      // khi User được include từ model khác (Sequelize áp default scope cho cả
      // include). Có lỗi nào khác làm lộ bản ghi thì cũng không còn gì để lộ.
      // Chỗ nào thật sự cần hai trường này thì gọi User.scope("withSecrets").
      defaultScope: {
        attributes: { exclude: ["passwordHash", "refreshToken"] },
      },
      scopes: {
        withSecrets: {},
      },
    },
  );

  return User;
};
