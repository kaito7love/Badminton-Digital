const { DataTypes } = require('sequelize');
const { newId } = require('../../../platform/db/ids');

const definePlayerModels = (sequelize) => {
  const Player = sequelize.define(
    'Player',
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      externalRef: { type: DataTypes.STRING(128), allowNull: true },
      sourceVersion: { type: DataTypes.BIGINT, allowNull: true },
      displayName: { type: DataTypes.STRING(100), allowNull: false },
      nickname: { type: DataTypes.STRING(30), allowNull: true },
      gender: { type: DataTypes.ENUM('male', 'female'), allowNull: true },
      birthYear: { type: DataTypes.SMALLINT, allowNull: true },
      dominantHand: { type: DataTypes.ENUM('right', 'left'), allowNull: true },
      playingSinceYear: { type: DataTypes.SMALLINT, allowNull: true },
      sessionsPerWeek: { type: DataTypes.TINYINT, allowNull: true },
      preferredPlay: { type: DataTypes.ENUM('singles', 'doubles', 'both'), allowNull: true },
      doublesPosition: { type: DataTypes.ENUM('front', 'back', 'both'), allowNull: true },
      homeOrganizerRef: { type: DataTypes.STRING(64), allowNull: true },
      visibility: { type: DataTypes.ENUM('public', 'members', 'hidden'), allowNull: false, defaultValue: 'members' },
      status: { type: DataTypes.ENUM('active', 'merged', 'anonymized'), allowNull: false, defaultValue: 'active' },
      mergedIntoPlayerId: { type: DataTypes.CHAR(36), allowNull: true }
    },
    { tableName: 'players', underscored: true, version: true }
  );

  const PlayerStats = sequelize.define(
    'PlayerStats',
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() },
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      discipline: { type: DataTypes.ENUM('singles', 'doubles'), allowNull: false },
      context: { type: DataTypes.ENUM('tournament', 'session'), allowNull: false },
      matches: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      wins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      losses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      gamesWon: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      gamesLost: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      pointsWon: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      pointsLost: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      tournaments: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      titles: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      runnerUps: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      semis: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      streak: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last5: { type: DataTypes.JSON, allowNull: true },
      bestRating: { type: DataTypes.DECIMAL(5, 3), allowNull: true },
      bestRatingAt: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: 'player_stats', underscored: true }
  );

  return { Player, PlayerStats };
};

module.exports = { definePlayerModels };
