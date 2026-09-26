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
  const RankingResult = sequelize.define(
    'RankingResult',
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      category: { type: DataTypes.ENUM('MS', 'WS', 'MD', 'WD', 'XD'), allowNull: false },
      tournamentId: { type: DataTypes.CHAR(36), allowNull: false },
      tournamentName: { type: DataTypes.STRING(120), allowNull: false },
      placementFrom: { type: DataTypes.INTEGER, allowNull: false },
      placementTo: { type: DataTypes.INTEGER, allowNull: false },
      placementLabel: { type: DataTypes.STRING(40), allowNull: false },
      basePoints: { type: DataTypes.INTEGER, allowNull: false },
      tierFactor: { type: DataTypes.DECIMAL(4, 2), allowNull: false },
      sizeFactor: { type: DataTypes.DECIMAL(4, 3), allowNull: false },
      strengthFactor: { type: DataTypes.DECIMAL(4, 3), allowNull: false },
      points: { type: DataTypes.INTEGER, allowNull: false },
      awardedAt: { type: DataTypes.DATE, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: 'ranking_results', underscored: true, updatedAt: false }
  );

  return { LeaderboardSnapshot, RankingResult };
};

module.exports = { defineRankingModels };
