const { DataTypes } = require('sequelize');
const { newId } = require('../../../platform/db/ids');

const id = { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: () => newId() };

const defineSessionModels = (sequelize) => {
  const PlaySession = sequelize.define(
    'PlaySession',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      organizerRef: { type: DataTypes.STRING(64), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      startsAt: { type: DataTypes.DATE, allowNull: false },
      courtRefs: { type: DataTypes.JSON, allowNull: false },
      format: { type: DataTypes.ENUM('doubles', 'singles'), allowNull: false },
      mode: { type: DataTypes.ENUM('balanced', 'level', 'random'), allowNull: false },
      scoring: { type: DataTypes.JSON, allowNull: false },
      rated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Sức chứa cho đăng ký online (plan 27): null = không giới hạn.
      maxPlayers: { type: DataTypes.INTEGER, allowNull: true },
      seed: { type: DataTypes.STRING(64), allowNull: false },
      rounds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM('open', 'closed', 'cancelled'), allowNull: false },
      closedAt: { type: DataTypes.DATE, allowNull: true },
      createdByRef: { type: DataTypes.STRING(128), allowNull: false }
    },
    { tableName: 'play_sessions', underscored: true, version: true }
  );

  const PlaySessionPlayer = sequelize.define(
    'PlaySessionPlayer',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      sessionId: { type: DataTypes.CHAR(36), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      status: { type: DataTypes.ENUM('present', 'left'), allowNull: false },
      joinedAt: { type: DataTypes.DATE, allowNull: false },
      leftAt: { type: DataTypes.DATE, allowNull: true },
      gamesPlayed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      gamesCredit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      waitingSince: { type: DataTypes.DATE, allowNull: true },
      checkedInByRef: { type: DataTypes.STRING(128), allowNull: false }
    },
    { tableName: 'play_session_players', underscored: true }
  );

  // Khách báo trước "tôi sẽ đến" (plan 27). Khác PlaySessionPlayer = điểm danh thật tại quầy.
  const SessionSignup = sequelize.define(
    'SessionSignup',
    {
      id,
      tenantId: { type: DataTypes.STRING(64), allowNull: false },
      sessionId: { type: DataTypes.CHAR(36), allowNull: false },
      playerId: { type: DataTypes.CHAR(36), allowNull: false },
      status: { type: DataTypes.ENUM('registered', 'waitlisted', 'attended', 'cancelled'), allowNull: false },
      signedUpByRef: { type: DataTypes.STRING(128), allowNull: false },
      // DATE(3) = DATETIME(3), giữ mili-giây. Đây là khoá xếp hàng chờ và thứ tự sắp
      // theo `(signedUpAt, id)`; để tới giây thì hai lượt đăng ký cùng giây rơi vào
      // tiebreak `id`, đẩy người đăng ký lại (dùng lại hàng cũ, id nhỏ) lên trước.
      // Xem migration 20261008100001.
      signedUpAt: { type: DataTypes.DATE(3), allowNull: false }
    },
    { tableName: 'session_signups', underscored: true }
  );

  return { PlaySession, PlaySessionPlayer, SessionSignup };
};

module.exports = { defineSessionModels };
