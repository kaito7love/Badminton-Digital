const { ageGroup, publicName } = require('../domain/profile');

const iso = (d) => (d ? new Date(d).toISOString() : null);

// Bản đầy đủ — cho nhân viên và chính chủ.
const fullView = (player, now = new Date()) => ({
  id: player.id ?? null,
  externalRef: player.externalRef ?? null,
  displayName: player.displayName ?? null,
  nickname: player.nickname ?? null,
  publicName: publicName(player),
  contactPhone: player.contactPhone ?? null,
  source: player.source ?? null,
  gender: player.gender ?? null,
  birthYear: player.birthYear ?? null,
  ageGroup: ageGroup(player.birthYear, now),
  dominantHand: player.dominantHand ?? null,
  playingSinceYear: player.playingSinceYear ?? null,
  sessionsPerWeek: player.sessionsPerWeek ?? null,
  preferredPlay: player.preferredPlay ?? null,
  doublesPosition: player.doublesPosition ?? null,
  homeOrganizerRef: player.homeOrganizerRef ?? null,
  visibility: player.visibility ?? null,
  status: player.status ?? null,
  mergedIntoPlayerId: player.mergedIntoPlayerId ?? null,
  version: player.version ?? null,
  createdAt: iso(player.createdAt),
  updatedAt: iso(player.updatedAt)
});

// Bản rút gọn theo quyền riêng tư (docs/05 mục 1.1): không có mã ngoài, năm sinh,
// số buổi / tuần; người xem chưa đăng nhập chỉ thấy tên rút gọn.
const publicView = (player, viewer, now = new Date()) => ({
  id: player.id ?? null,
  name: viewer === 'public' ? publicName(player) : player.displayName ?? null,
  nickname: player.nickname ?? null,
  gender: player.gender ?? null,
  ageGroup: ageGroup(player.birthYear, now),
  dominantHand: player.dominantHand ?? null,
  playingSinceYear: player.playingSinceYear ?? null,
  preferredPlay: player.preferredPlay ?? null,
  doublesPosition: player.doublesPosition ?? null,
  homeOrganizerRef: player.homeOrganizerRef ?? null
});

module.exports = { fullView, publicView };
