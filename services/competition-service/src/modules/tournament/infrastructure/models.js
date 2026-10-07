const { DataTypes } = require('sequelize');
const { newId } = require('../../../platform/db/ids');

const id = { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() };

const defineTournamentModels = (sequelize) => {
  const Tournament = sequelize.define(
    'Tournament',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      organizerRef: { type: DataTypes.STRING(64), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      startsOn: { type: DataTypes.DATEONLY, allowNull: false },
      // Giờ bắt đầu 'HH:MM' (giờ chi nhánh) — giờ dự kiến từng lượt (plan 20).
      startTime: { type: DataTypes.CHAR(5), allowNull: true },
      tier: { type: DataTypes.ENUM('club', 'open', 'chain'), allowNull: false },
      discipline: { type: DataTypes.ENUM('singles', 'doubles'), allowNull: false },
      genderRule: { type: DataTypes.ENUM('open', 'men', 'women', 'mixed'), allowNull: false },
      pairingMode: { type: DataTypes.ENUM('fixed', 'random_balanced'), allowNull: false },
      maxPartnerGap: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
      maxEntries: { type: DataTypes.INTEGER, allowNull: true },
      // Bốc thăm tại sân: chỉ lấy người đã điểm danh (plan 20).
      checkInRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ratingRule: { type: DataTypes.JSON, allowNull: true },
      format: { type: DataTypes.ENUM('round_robin', 'groups_knockout', 'knockout'), allowNull: false },
      groupCount: { type: DataTypes.INTEGER, allowNull: true },
      groupMode: { type: DataTypes.ENUM('seeded', 'level'), allowNull: false, defaultValue: 'seeded' },
      advancePerGroup: { type: DataTypes.INTEGER, allowNull: true },
      thirdPlaceMatch: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      scoring: { type: DataTypes.JSON, allowNull: false },
      courtCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
      // Sân của giải — "Gọi ra sân" chỉ vào các sân này. null = giải cũ, chỉ có số sân.
      courtRefs: { type: DataTypes.JSON, allowNull: true },
      matchMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 15 },
      rated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ranked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      drawSeed: { type: DataTypes.STRING(64), allowNull: true },
      status: { type: DataTypes.ENUM('draft', 'open', 'drawn', 'in_progress', 'finalized', 'cancelled'), allowNull: false },
      stage: { type: DataTypes.ENUM('group', 'knockout'), allowNull: true },
      finalizedAt: { type: DataTypes.DATE, allowNull: true },
      createdByRef: { type: DataTypes.STRING(128), allowNull: false }
    },
    { tableName: 'tournaments', underscored: true, version: true }
  );

  const TournamentEntry = sequelize.define(
    'TournamentEntry',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      tournamentId: { type: DataTypes.CHAR(36), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      partnerPlayerId: { type: DataTypes.CHAR(36), allowNull: true },
      status: { type: DataTypes.ENUM('registered', 'waitlisted', 'withdrawn'), allowNull: false },
      waitlistReason: { type: DataTypes.ENUM('capacity', 'draw', 'absent'), allowNull: true },
      checkedInAt: { type: DataTypes.DATE, allowNull: true },
      checkedInByRef: { type: DataTypes.STRING(128), allowNull: true },
      ratingSnapshot: { type: DataTypes.DECIMAL(5, 3), allowNull: true },
      pairingRatingSnapshot: { type: DataTypes.DECIMAL(5, 3), allowNull: true },
      registeredAt: { type: DataTypes.DATE, allowNull: false },
      registeredByRef: { type: DataTypes.STRING(128), allowNull: false },
      // 'self' = khách tự đăng ký online (plan 27) — nhân viên thấy chip "Đăng ký online"; 'staff' = nhân viên nhập (mặc định, mọi đăng ký cũ).
      registeredVia: { type: DataTypes.ENUM('staff', 'self'), allowNull: false, defaultValue: 'staff' }
    },
    { tableName: 'tournament_entries', underscored: true }
  );

  const TournamentTeam = sequelize.define(
    'TournamentTeam',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      tournamentId: { type: DataTypes.CHAR(36), allowNull: false },
      player1Id: { type: DataTypes.CHAR(36), allowNull: false, field: 'player1_id' },
      player2Id: { type: DataTypes.CHAR(36), allowNull: true, field: 'player2_id' },
      teamRating: { type: DataTypes.DECIMAL(5, 3), allowNull: false },
      groupNo: { type: DataTypes.INTEGER, allowNull: true },
      potNo: { type: DataTypes.INTEGER, allowNull: true },
      seed: { type: DataTypes.INTEGER, allowNull: true },
      withdrawnAt: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: 'tournament_teams', underscored: true }
  );

  const TournamentPlacement = sequelize.define(
    'TournamentPlacement',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      tournamentId: { type: DataTypes.CHAR(36), allowNull: false },
      teamId: { type: DataTypes.CHAR(36), allowNull: false },
      positionFrom: { type: DataTypes.INTEGER, allowNull: false },
      positionTo: { type: DataTypes.INTEGER, allowNull: false },
      label: { type: DataTypes.STRING(40), allowNull: false },
      reachedKnockout: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      wins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    },
    { tableName: 'tournament_placements', underscored: true, updatedAt: false }
  );

  return { Tournament, TournamentEntry, TournamentTeam, TournamentPlacement };
};

module.exports = { defineTournamentModels };
