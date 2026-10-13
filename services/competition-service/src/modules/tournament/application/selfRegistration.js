const { Op } = require('sequelize');
const { AppError, notFound, unprocessable, conflict } = require('../../../platform/http/errors');
const { assertAction } = require('../domain/stateMachine');
const { checkPlayer, checkPair } = require('../domain/eligibility');
const { PUBLIC_STATUSES } = require('./publicQueries');
const { profile, guest: guestRules } = require('../../player').domain;
const { ratingConfig } = require('../../rating').domain;

// Khách TỰ ĐĂNG KÝ giải trên trang công khai (plan 27, slice p1). Dùng lại đúng lệnh `register` / `withdraw` của nhân viên
// (kiểm điều kiện trình / giới tính / hạng, hết chỗ → danh sách chờ, khoá giải khi ghi) — chỉ đổi cửa vào:
//  - quyền là `entry:self` (không phải tournament:operate) và người đăng ký luôn là CHÍNH MÌNH (claim `player` của token);
//  - giải cặp cố định: đăng ký mình + 1 đồng đội trong MỘT lần, nhận cả hai người cùng lúc. Đồng đội là người đã có hồ sơ
//    (chọn từ tìm kiếm, tôn trọng quyền riêng tư) hoặc người chưa có tài khoản (tên + SĐT + giới tính + mức trình);
//  - đồng đội chưa có tài khoản: tạo hồ sơ khách + điểm tạm "chấm nhanh" (chưa xác nhận) → hàng chờ duyệt / cờ ở danh sách đăng ký
//    của nhân viên. Kiểm điều kiện trên dữ liệu "ảo" TRƯỚC khi tạo gì, để đăng ký hỏng không để lại hồ sơ rác;
//  - rút: chỉ trước bốc thăm (sau đó có lịch, W.O. — liên hệ nhân viên).

const LEVELS = Object.keys(ratingConfig.QUICK_LEVEL_POINTS);

const createSelfRegistration = ({ models, players, rating, service, ctx, pub }) => {
  const { TournamentEntry } = models;

  const loadPublic = async (auth, id) => {
    const t = await ctx.load(null, auth.tenant, id);
    if (!PUBLIC_STATUSES.includes(t.status)) throw notFound('Không tìm thấy giải');
    return t;
  };

  // Đồng đội đã có hồ sơ: chỉ chọn được người mà thành viên được thấy (public / members), đang hoạt động.
  const existingPartner = async (auth, playerId) => {
    const p = await players.findById(auth.tenant, playerId);
    if (!p || p.status !== 'active' || !profile.canViewProfile(p, 'member', false)) throw notFound('Không tìm thấy người chơi');
    return p.id;
  };

  // Đồng đội chưa có tài khoản → id hồ sơ khách (tạo mới hoặc dùng lại hồ sơ cùng SĐT).
  const guestPartner = async (auth, t, self, input, requestId) => {
    const g = guestRules.validateGuest(input, LEVELS);
    const found = await players.findGuestByPhone(auth.tenant, g.contactPhone);
    if (found) return found.id; // một SĐT = một hồ sơ; điều kiện sẽ do `register` kiểm trên dữ liệu thật

    // Kiểm trước trên dữ liệu ảo: người đăng ký + khách (điểm tạm theo nhãn) + cặp. Hỏng thì chưa tạo gì.
    const points = ratingConfig.QUICK_LEVEL_POINTS[g.level];
    const ghost = { id: 'guest', status: 'active', gender: g.gender, displayName: g.displayName };
    const ghostRating = { rating: points, pairingRating: points };
    const mine = (await rating.queries.disciplineRatings(auth.tenant, [self.id], t.discipline)).get(self.id);
    checkPlayer({ tournament: t, player: self, rating: mine });
    checkPlayer({ tournament: t, player: ghost, rating: ghostRating });
    checkPair({ tournament: t, a: self, b: ghost, ratingA: mine, ratingB: ghostRating });

    const { player: created, created: isNew } = await players.createGuest({
      tenant: auth.tenant, displayName: g.displayName, contactPhone: g.contactPhone, gender: g.gender, createdByRef: auth.sub, organizerRef: t.organizerRef, requestId
    });
    if (isNew) {
      await rating.service.quickAssess({
        auth: { tenant: auth.tenant, sub: auth.sub }, playerId: created.id, level: g.level,
        note: 'Khách chọn mức trình khi đăng ký online hộ đồng đội — chờ nhân viên xác nhận', requestId
      });
    }
    return created.id;
  };

  const register = async ({ auth, id, partner, requestId }) => {
    const t = await loadPublic(auth, id);
    assertAction(t, 'register');
    const self = await players.ensureSelf(auth, { requestId });
    const needsPartner = t.discipline === 'doubles' && t.pairingMode === 'fixed';
    if (needsPartner && !partner) throw unprocessable('PARTNER_REQUIRED', 'Giải đánh đôi cặp cố định — cần thêm đồng đội');
    if (!needsPartner && partner) throw unprocessable('PARTNER_NOT_ALLOWED', 'Giải này đăng ký từng người, không có đồng đội');
    let partnerPlayerId = null;
    if (partner) {
      const given = [partner.playerId, partner.guest].filter(Boolean).length;
      if (given !== 1) throw unprocessable('PARTNER_INVALID', 'Đồng đội: chọn một người đã có trong hệ thống hoặc nhập thông tin người mới');
      partnerPlayerId = partner.playerId ? await existingPartner(auth, partner.playerId) : await guestPartner(auth, t, self, partner.guest, requestId);
    }
    await service.register({ auth, id: t.id, playerId: self.id, partnerPlayerId, requestId, self: true });
    return pub.detail({ auth, id: t.id });
  };

  const withdraw = async ({ auth, id, requestId }) => {
    const t = await loadPublic(auth, id);
    const me = auth.player ? await players.findByRef(auth.tenant, auth.player) : null;
    const entry = me ? await TournamentEntry.findOne({ where: { tournamentId: t.id, playerId: me.id, status: { [Op.ne]: 'withdrawn' } } }) : null;
    if (!entry) throw new AppError(404, 'NOT_REGISTERED', 'Bạn chưa đăng ký giải này');
    if (t.status !== 'open') {
      throw conflict('WITHDRAW_LOCKED', 'Giải đã bốc thăm — hãy liên hệ nhân viên nếu bạn không thể tham gia nữa');
    }
    await service.withdraw({ auth, id: t.id, entryId: entry.id, requestId, self: true });
    return pub.detail({ auth, id: t.id });
  };

  return { register, withdraw, LEVELS };
};

module.exports = { createSelfRegistration };
