const { Op } = require('sequelize');
const { conflict } = require('../../../platform/http/errors');

// Gộp hồ sơ (docs/05 mục 4): đăng ký + đội của nguồn chuyển sang đích, thống kê giải
// của đích dựng lại. Nguồn và đích cùng ở một giải → 409 MERGE_CONFLICT; ngoại lệ:
// một bên đã rút TRƯỚC bốc thăm (chưa vào đội nào) thì bỏ dòng đăng ký đó.

const createTournamentMergeHandler = ({ models, finalizer }) => {
  const { Tournament, TournamentEntry, TournamentTeam } = models;

  return async ({ tenant, target, source, transaction }) => {
    const ids = [target.id, source.id];
    const entries = await TournamentEntry.findAll({ where: { tenantId: tenant, playerId: ids }, transaction });
    const teams = await TournamentTeam.findAll({
      where: { tenantId: tenant, [Op.or]: [{ player1Id: ids }, { player2Id: ids }] },
      transaction
    });
    const inTeam = (tournamentId, playerId) =>
      teams.some((x) => x.tournamentId === tournamentId && (x.player1Id === playerId || x.player2Id === playerId));
    const tournamentIds = [...new Set([...entries.map((e) => e.tournamentId), ...teams.map((x) => x.tournamentId)])];
    const touched = [];

    for (const tid of tournamentIds) {
      const src = entries.find((e) => e.tournamentId === tid && e.playerId === source.id);
      const tgt = entries.find((e) => e.tournamentId === tid && e.playerId === target.id);
      const srcTeam = inTeam(tid, source.id);
      if (!src && !srcTeam) continue;
      if ((src || srcTeam) && (tgt || inTeam(tid, target.id))) {
        const droppable = (e, playerId) => e && e.status === 'withdrawn' && !inTeam(tid, playerId);
        if (droppable(src, source.id)) {
          await src.destroy({ transaction });
          continue;
        }
        if (droppable(tgt, target.id)) {
          await tgt.destroy({ transaction });
        } else {
          const t = await Tournament.findOne({ where: { id: tid }, attributes: ['name'], transaction });
          throw conflict('MERGE_CONFLICT', `Hai hồ sơ cùng có mặt trong giải "${t ? t.name : tid}" — rút một bên ra trước`);
        }
      }
      touched.push(tid);
    }
    if (!touched.length) return { tournaments: 0 };

    const scope = { tenantId: tenant, tournamentId: touched };
    await TournamentEntry.update({ playerId: target.id }, { where: { ...scope, playerId: source.id }, transaction });
    await TournamentEntry.update({ partnerPlayerId: target.id }, { where: { ...scope, partnerPlayerId: source.id }, transaction });
    await TournamentTeam.update({ player1Id: target.id }, { where: { ...scope, player1Id: source.id }, transaction });
    await TournamentTeam.update({ player2Id: target.id }, { where: { ...scope, player2Id: source.id }, transaction });

    const disciplines = await Tournament.findAll({ where: { id: touched }, attributes: ['discipline'], transaction });
    for (const discipline of new Set(disciplines.map((t) => t.discipline))) {
      await finalizer.rebuildTournamentStats(transaction, tenant, [target.id], discipline);
    }
    return { tournaments: touched.length };
  };
};

module.exports = { createTournamentMergeHandler };
