const { DataTypes } = require('sequelize');
const { newId } = require('../../../platform/db/ids');

const id = { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() };

const defineRatingModels = (sequelize) => {
  const PlayerRating = sequelize.define(
    'PlayerRating',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      discipline: { type: DataTypes.ENUM('singles', 'doubles'), allowNull: false },
      rating: { type: DataTypes.DECIMAL(5, 3), allowNull: false },
      ratedMatches: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastMatchAt: { type: DataTypes.DATE, allowNull: true },
      verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      verifiedByRef: { type: DataTypes.STRING(128), allowNull: true },
      verifiedAt: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: 'player_ratings', underscored: true, version: true }
  );

  const Assessment = sequelize.define(
    'Assessment',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      source: { type: DataTypes.ENUM('self', 'staff', 'staff_quick', 'video_ai'), allowNull: false },
      rubricVersion: { type: DataTypes.STRING(16), allowNull: true },
      answers: { type: DataTypes.JSON, allowNull: false },
      profile: { type: DataTypes.JSON, allowNull: true },
      confidence: { type: DataTypes.JSON, allowNull: true },
      result: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.ENUM('applied', 'recorded', 'pending_review', 'rejected', 'superseded'), allowNull: false },
      needsVerification: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      submittedByRef: { type: DataTypes.STRING(128), allowNull: false },
      reviewedByRef: { type: DataTypes.STRING(128), allowNull: true },
      reviewedAt: { type: DataTypes.DATE, allowNull: true },
      reviewNote: { type: DataTypes.STRING(500), allowNull: true },
      evidenceRef: { type: DataTypes.STRING(128), allowNull: true },
      matchId: { type: DataTypes.CHAR(36), allowNull: true },
      note: { type: DataTypes.STRING(500), allowNull: true }
    },
    { tableName: 'assessments', underscored: true }
  );

  const RatingChange = sequelize.define(
    'RatingChange',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      discipline: { type: DataTypes.ENUM('singles', 'doubles'), allowNull: false },
      ratingBefore: { type: DataTypes.DECIMAL(5, 3), allowNull: true },
      ratingAfter: { type: DataTypes.DECIMAL(5, 3), allowNull: false },
      delta: { type: DataTypes.DECIMAL(6, 3), allowNull: false },
      reason: { type: DataTypes.ENUM('assessment', 'tournament', 'session', 'adjustment', 'rollback', 'merge'), allowNull: false },
      assessmentId: { type: DataTypes.CHAR(36), allowNull: true },
      contextType: { type: DataTypes.STRING(16), allowNull: true },
      contextId: { type: DataTypes.CHAR(36), allowNull: true },
      actorRef: { type: DataTypes.STRING(128), allowNull: false },
      note: { type: DataTypes.STRING(500), allowNull: true },
      calc: { type: DataTypes.JSON, allowNull: true }
    },
    { tableName: 'rating_changes', underscored: true, updatedAt: false }
  );

  return { PlayerRating, Assessment, RatingChange };
};

module.exports = { defineRatingModels };
