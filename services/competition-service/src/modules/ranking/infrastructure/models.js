const { DataTypes } = require('sequelize');
const { newId } = require('../../../platform/db/ids');

const defineRankingModels = (sequelize) => {
  const LeaderboardSnapshot = sequelize.define(
    'LeaderboardSnapshot',
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      kind: { type: DataTypes.ENUM('rating', 'points'), allowNull: false },
      category: { type: DataTypes.STRING(4), allowNull: false },
      scope: { type: DataTypes.STRING(80), allowNull: false },
      snapshotDate: { type: DataTypes.DATEONLY, allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      rank: { type: DataTypes.INTEGER, allowNull: false },
      value: { type: DataTypes.DECIMAL(10, 3), allowNull: false }
    },
    { tableName: 'leaderboard_snapshots', underscored: true, updatedAt: false }
  );
  return { LeaderboardSnapshot };
};

module.exports = { defineRankingModels };
