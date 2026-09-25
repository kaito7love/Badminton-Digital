// Sự kiện từ app chính (docs/02 mục 3.3). Mỗi handler chạy trong transaction của
// inbox (khử trùng lặp) và trả về một dòng mô tả kết quả để lưu vào inbox.

const registerInboundHandlers = ({ inbox, players, models }) => {
  const { Player } = models;

  inbox.register('bd.customer.updated', async (event, { transaction, tenant, actorRef }) => {
    const { externalRef, fullName, version } = event.data || {};
    if (!externalRef || !fullName) return 'Thiếu externalRef / fullName — bỏ qua';
    const player = await Player.findOne({ where: { tenantId: tenant, externalRef }, transaction, lock: transaction.LOCK.UPDATE });
    if (!player) return 'Chưa có hồ sơ người chơi — bỏ qua';
    // Sự kiện đến sai thứ tự: bản cũ hơn bản đã áp thì bỏ qua.
    if (version !== undefined && player.sourceVersion !== null && Number(player.sourceVersion) >= Number(version)) {
      return `Bỏ qua bản cũ (version ${version} ≤ ${player.sourceVersion})`;
    }
    await player.update({ displayName: fullName, sourceVersion: version !== undefined ? version : player.sourceVersion }, { transaction });
    return 'Đã đổi tên hiển thị';
  });

  inbox.register('bd.customer.merged', async (event, { transaction, tenant, actorRef }) => {
    const { sourceRef, targetRef } = event.data || {};
    if (!sourceRef || !targetRef) return 'Thiếu sourceRef / targetRef — bỏ qua';
    const source = await Player.findOne({ where: { tenantId: tenant, externalRef: sourceRef }, transaction });
    if (!source) return 'Hồ sơ nguồn không có trong service — bỏ qua';
    if (source.status === 'merged') return 'Đã gộp trước đó';
    const target = await players.findByRef(tenant, targetRef, { transaction });
    if (!target) {
      // Chỉ nguồn có hồ sơ → hồ sơ đó giờ thuộc về tài khoản đích.
      await source.update({ externalRef: targetRef }, { transaction });
      return 'Đổi mã ngoài của hồ sơ nguồn sang mã đích';
    }
    await players.merge({ tenant, targetId: target.id, sourceId: source.id, actorRef, transaction });
    return 'Đã gộp hồ sơ';
  });

  inbox.register('bd.customer.deleted', async (event, { transaction, tenant, actorRef }) => {
    const { externalRef } = event.data || {};
    if (!externalRef) return 'Thiếu externalRef — bỏ qua';
    const player = await Player.findOne({ where: { tenantId: tenant, externalRef }, transaction });
    if (!player) return 'Chưa có hồ sơ người chơi — bỏ qua';
    await players.anonymize({ tenant, playerId: player.id, actorRef, transaction });
    return 'Đã ẩn danh hoá';
  });
};

module.exports = { registerInboundHandlers };
