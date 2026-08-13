const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "BranchDocumentSequence",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "branch_id",
      },
      documentType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: "document_type",
      },
      nextValue: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: "next_value",
      },
    },
    {
      tableName: "branch_document_sequences",
      timestamps: true,
      underscored: true,
    },
  );
