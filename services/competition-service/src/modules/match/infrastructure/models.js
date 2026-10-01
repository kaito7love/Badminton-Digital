const { DataTypes } = require('sequelize');
const { newId } = require('../../../platform/db/ids');

const defineMatchModels = (sequelize) => {
  const Match = sequelize.define(
    'Match',
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      contextType: { type: DataTypes.ENUM('tournament', 'session'), allowNull: false },
      contextId: { type: DataTypes.CHAR(36), allowNull: false },
      discipline: { type: DataTypes.ENUM('singles', 'doubles'), allowNull: false },
      stage: { type: DataTypes.ENUM('group', 'knockout', 'extra', 'session'), allowNull: false },
      label: { type: DataTypes.STRING(60), allowNull: true },
      groupNo: { type: DataTypes.INTEGER, allowNull: true },
      roundNo: { type: DataTypes.INTEGER, allowNull: true },
      slotNo: { type: DataTypes.INTEGER, allowNull: true },
      bracketPos: { type: DataTypes.INTEGER, allowNull: true },
      nextMatchId: { type: DataTypes.CHAR(36), allowNull: true },
      nextSlot: { type: DataTypes.ENUM('A', 'B'), allowNull: true },
      loserNextMatchId: { type: DataTypes.CHAR(36), allowNull: true },
      loserNextSlot: { type: DataTypes.ENUM('A', 'B'), allowNull: true },
      teamAId: { type: DataTypes.CHAR(36), allowNull: true },
      teamBId: { type: DataTypes.CHAR(36), allowNull: true },
      scoring: { type: DataTypes.JSON, allowNull: false },
      games: { type: DataTypes.JSON, allowNull: true },
      outcome: { type: DataTypes.ENUM('normal', 'walkover', 'retired'), allowNull: true },
      winnerSide: { type: DataTypes.ENUM('A', 'B'), allowNull: true },
      // ended = đã đánh xong nhưng không nhập tỉ số (chỉ buổi giao lưu).
      status: { type: DataTypes.ENUM('scheduled', 'in_play', 'completed', 'cancelled', 'ended'), allowNull: false },
      ratingWeight: { type: DataTypes.DECIMAL(3, 2), allowNull: false, defaultValue: 1 },
      counted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      courtRef: { type: DataTypes.STRING(64), allowNull: true },
      calledAt: { type: DataTypes.DATE, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      recordedByRef: { type: DataTypes.STRING(128), allowNull: true }
    },
    { tableName: 'matches', underscored: true, version: true }
  );

  const MatchParticipant = sequelize.define(
    'MatchParticipant',
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      matchId: { type: DataTypes.CHAR(36), allowNull: false },
      side: { type: DataTypes.ENUM('A', 'B'), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false }
    },
    { tableName: 'match_participants', underscored: true, updatedAt: false }
  );

  // Bấm điểm trực tiếp: chuỗi pha cầu của một trận (domain/liveScore.js).
  const MatchLiveScore = sequelize.define(
    'MatchLiveScore',
    {
      matchId: { type: DataTypes.CHAR(36), primaryKey: true },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      rallies: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
      firstServer: { type: DataTypes.ENUM('A', 'B'), allowNull: false, defaultValue: 'A' },
      revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      scoredByRef: { type: DataTypes.STRING(128), allowNull: true }
    },
    { tableName: 'match_live_scores', underscored: true }
  );

  return { Match, MatchParticipant, MatchLiveScore };
};

module.exports = { defineMatchModels };
