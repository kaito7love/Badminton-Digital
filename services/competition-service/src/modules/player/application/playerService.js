const { Op, UniqueConstraintError } = require('sequelize');
const { withTransaction } = require('../../../platform/db/transaction');
const { notFound, unprocessable, conflict } = require('../../../platform/http/errors');
const { validateProfilePatch } = require('../domain/profile');
const { fullView } = require('./views');

// Use case của hồ sơ người chơi. Module khác gắn thêm hành vi qua các "hook" đăng
// ký lúc lắp ráp (composition) — module `player` không phụ thuộc ai:
//   enrichers        : thêm dữ liệu vào view (rating thêm điểm, ranking thêm thứ hạng)
//   listFilters      : lọc danh sách theo dữ liệu của module khác (vd khoảng điểm)
//   profileGuards    : chặn sửa hồ sơ (rating chặn đổi giới tính khi đã có trận)
//   mergeHandlers    : chuyển dữ liệu của module khác khi gộp hồ sơ
//   anonymizeHandlers: dọn dữ liệu của module khác khi ẩn danh

const MAX_MERGE_CHAIN = 10;

const createPlayerService = ({ models, sequelize, audit }) => {
  const { Player } = models;
  const hooks = { enrichers: [], listFilters: [], profileGuards: [], mergeHandlers: [], anonymizeHandlers: [] };

  const findById = (tenant, id, { transaction, lock } = {}) =>
    Player.findOne({ where: { id, tenantId: tenant }, transaction, lock: lock ? transaction.LOCK.UPDATE : undefined });

  const requirePlayer = async (tenant, id, opts = {}) => {
    const player = await findById(tenant, id, opts);
    if (!player) throw notFound('Không tìm thấy người chơi');
    return player;
  };

  const requireActive = async (tenant, id, opts = {}) => {
    const player = await requirePlayer(tenant, id, opts);
    if (player.status !== 'active') throw conflict('INVALID_STATE', `Hồ sơ người chơi đang ở trạng thái ${player.status}`);
    return player;
  };

  // Tra theo mã ngoài; hồ sơ đã gộp thì đi tiếp tới hồ sơ đích (docs/05 mục 4).
  const findByRef = async (tenant, externalRef, { transaction } = {}) => {
    let player = await Player.findOne({ where: { tenantId: tenant, externalRef }, transaction });
    for (let i = 0; player && player.status === 'merged' && player.mergedIntoPlayerId && i < MAX_MERGE_CHAIN; i += 1) {
      player = await Player.findOne({ where: { tenantId: tenant, id: player.mergedIntoPlayerId }, transaction });
    }
    return player;
  };

  // --- Thống kê (bảng tổng hợp; nguồn sự thật là matches — module match / tournament
  // dựng lại rồi ghi vào đây qua upsertStats) ---
  const upsertStats = async (transaction, { tenant, playerId, discipline, context, patch }) => {
    const { PlayerStats } = models;
    const [row] = await PlayerStats.findOrCreate({
      where: { tenantId: tenant, playerId, discipline, context },
      defaults: { tenantId: tenant, playerId, discipline, context },
      transaction
    });
    await row.update(patch, { transaction });
    return row;
  };

  const getStats = async (tenant, playerId) => {
    const rows = await models.PlayerStats.findAll({ where: { tenantId: tenant, playerId } });
    return rows.map((r) => ({
      discipline: r.discipline,
      context: r.context,
      matches: r.matches,
      wins: r.wins,
      losses: r.losses,
      winRate: r.matches ? Math.round((r.wins / r.matches) * 1000) / 1000 : null,
      gamesWon: r.gamesWon,
      gamesLost: r.gamesLost,
      pointsWon: r.pointsWon,
      pointsLost: r.pointsLost,
      streak: r.streak,
      last5: r.last5 || [],
      tournaments: r.tournaments,
      titles: r.titles,
      runnerUps: r.runnerUps,
      semis: r.semis,
      bestRating: r.bestRating === null ? null : Math.round(Number(r.bestRating) * 100) / 100,
      bestRatingAt: r.bestRatingAt ? new Date(r.bestRatingAt).toISOString() : null
    }));
  };

  const distinctTenants = async () =>
    (await Player.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('tenant_id')), 'tenantId']], raw: true })).map((r) => r.tenantId);

  const findByIds = (tenant, ids, { transaction } = {}) =>
    ids.length ? Player.findAll({ where: { tenantId: tenant, id: ids }, transaction }) : Promise.resolve([]);

  const upsertByRef = async ({ tenant, externalRef, displayName, actorRef, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const existing = await findByRef(tenant, externalRef, { transaction });
      if (existing) {
        if (displayName && existing.displayName !== displayName && existing.status === 'active') {
          const before = existing.displayName;
          await existing.update({ displayName }, { transaction });
          await audit.record(transaction, {
            tenant, actorRef, action: 'player.renamed', targetType: 'player', targetId: existing.id,
            before: { displayName: before }, after: { displayName }, requestId
          });
        }
        return { player: existing, created: false };
      }
      const player = await Player.create({ tenantId: tenant, externalRef, displayName }, { transaction });
      await audit.record(transaction, {
        tenant, actorRef, action: 'player.created', targetType: 'player', targetId: player.id,
        after: { externalRef, displayName }, requestId
      });
      return { player, created: true };
    });

  // Hồ sơ của chính người gọi (claim `player`). Lần đầu thì tự tạo (JIT) từ `player_name`.
  const ensureSelf = async (auth, { requestId } = {}) => {
    if (!auth.player) throw unprocessable('PLAYER_CLAIM_REQUIRED', 'Token không gắn với người chơi nào (thiếu claim player)');
    const existing = await findByRef(auth.tenant, auth.player);
    if (existing) return existing;
    if (!auth.playerName) throw unprocessable('PLAYER_NAME_REQUIRED', 'Lần đầu dùng cần claim player_name để tạo hồ sơ');
    const { player } = await upsertByRef({
      tenant: auth.tenant, externalRef: auth.player, displayName: auth.playerName, actorRef: auth.sub, requestId
    });
    return player;
  };

  const updateProfile = async ({ tenant, playerId, patch, actorRef, isStaff, requestId, transaction: outer }) =>
    withTransaction(sequelize, outer, async (transaction) => {
      const player = await requireActive(tenant, playerId, { transaction, lock: true });
      const changes = validateProfilePatch(patch);
      for (const guard of hooks.profileGuards) await guard({ tenant, player, changes, isStaff, transaction });
      const before = {};
      for (const key of Object.keys(changes)) before[key] = player[key];
      try {
        await player.update(changes, { transaction });
      } catch (err) {
        if (err instanceof UniqueConstraintError) {
          throw unprocessable('NICKNAME_TAKEN', 'Tên thi đấu đã có người dùng', [{ field: 'nickname', message: 'Đã có người dùng' }]);
        }
        throw err;
      }
      await audit.record(transaction, {
        tenant, actorRef, action: 'player.profile_updated', targetType: 'player', targetId: player.id, before, after: changes, requestId
      });
      return player;
    });

  // Ghép dữ liệu của các module khác vào view (một lần cho cả danh sách).
  const enrich = async (tenant, players, context = {}) => {
    const views = players.map((p) => ({ ...fullView(p) }));
    for (const enricher of hooks.enrichers) {
      const extra = await enricher(tenant, players, context);
      views.forEach((v) => Object.assign(v, extra.get(v.id) || {}));
    }
    return views;
  };

  const list = async ({ tenant, search, gender, status = 'active', query, page, limit }) => {
    const where = { tenantId: tenant, status };
    if (gender) where.gender = gender;
    if (search) {
      const like = `%${search.replace(/[%_]/g, (c) => `\\${c}`)}%`;
      where[Op.or] = [{ displayName: { [Op.like]: like } }, { nickname: { [Op.like]: like } }, { externalRef: search }];
    }
    for (const filter of hooks.listFilters) {
      const ids = await filter(tenant, query);
      if (ids) where.id = where.id ? { [Op.and]: [where.id, { [Op.in]: [...ids] }] } : { [Op.in]: [...ids] };
    }
    const { rows, count } = await Player.findAndCountAll({
      where,
      order: [['displayName', 'ASC'], ['id', 'ASC']],
      offset: (page - 1) * limit,
      limit
    });
    return { rows, count };
  };

  // Gộp hồ sơ nguồn vào đích (docs/05 mục 4). Các module khác chuyển dữ liệu của
  // mình qua mergeHandlers, trong cùng transaction.
  const merge = async ({ tenant, targetId, sourceId, actorRef, requestId, transaction: outer }) =>
    withTransaction(sequelize, outer, async (transaction) => {
      if (targetId === sourceId) throw unprocessable('MERGE_SAME_PLAYER', 'Không thể gộp một hồ sơ vào chính nó');
      // Khoá theo thứ tự id để hai lệnh gộp ngược chiều không deadlock.
      const [firstId, secondId] = [targetId, sourceId].sort();
      const first = await requireActive(tenant, firstId, { transaction, lock: true });
      const second = await requireActive(tenant, secondId, { transaction, lock: true });
      const target = first.id === targetId ? first : second;
      const source = first.id === sourceId ? first : second;
      const details = {};
      for (const handler of hooks.mergeHandlers) Object.assign(details, await handler({ tenant, target, source, actorRef, transaction }));
      // Hồ sơ đích thiếu thông tin nào thì lấy từ nguồn.
      const fill = {};
      for (const key of ['nickname', 'gender', 'birthYear', 'dominantHand', 'playingSinceYear', 'sessionsPerWeek', 'preferredPlay', 'doublesPosition', 'homeOrganizerRef']) {
        if ((target[key] === null || target[key] === undefined) && source[key] !== null && source[key] !== undefined) fill[key] = source[key];
      }
      // Nhả tên thi đấu của nguồn trước (unique index) rồi mới gán cho đích.
      await source.update({ status: 'merged', mergedIntoPlayerId: target.id, nickname: null }, { transaction });
      if (Object.keys(fill).length) await target.update(fill, { transaction });
      await audit.record(transaction, {
        tenant, actorRef, action: 'player.merged', targetType: 'player', targetId: target.id,
        before: { sourceId: source.id, sourceRef: source.externalRef }, after: { filled: Object.keys(fill), ...details }, requestId
      });
      return { target, source, details };
    });

  const anonymize = async ({ tenant, playerId, actorRef, requestId, transaction: outer }) =>
    withTransaction(sequelize, outer, async (transaction) => {
      const player = await requirePlayer(tenant, playerId, { transaction, lock: true });
      if (player.status === 'anonymized') return player;
      for (const handler of hooks.anonymizeHandlers) await handler({ tenant, player, actorRef, transaction });
      const before = { externalRef: player.externalRef, status: player.status };
      await player.update(
        {
          displayName: 'Người chơi đã xoá',
          nickname: null,
          externalRef: `anon:${player.id}`,
          gender: null,
          birthYear: null,
          dominantHand: null,
          playingSinceYear: null,
          sessionsPerWeek: null,
          preferredPlay: null,
          doublesPosition: null,
          homeOrganizerRef: null,
          visibility: 'hidden',
          status: 'anonymized'
        },
        { transaction }
      );
      await audit.record(transaction, {
        tenant, actorRef, action: 'player.anonymized', targetType: 'player', targetId: player.id, before, requestId
      });
      return player;
    });

  return {
    hooks,
    registerEnricher: (fn) => hooks.enrichers.push(fn),
    registerListFilter: (fn) => hooks.listFilters.push(fn),
    registerProfileGuard: (fn) => hooks.profileGuards.push(fn),
    registerMergeHandler: (fn) => hooks.mergeHandlers.push(fn),
    registerAnonymizeHandler: (fn) => hooks.anonymizeHandlers.push(fn),
    findById,
    requirePlayer,
    requireActive,
    findByRef,
    findByIds,
    distinctTenants,
    upsertStats,
    getStats,
    upsertByRef,
    ensureSelf,
    updateProfile,
    enrich,
    list,
    merge,
    anonymize
  };
};

module.exports = { createPlayerService };
