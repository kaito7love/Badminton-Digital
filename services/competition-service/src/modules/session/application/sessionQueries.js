const { Op } = require('sequelize');
const { canAccessOrganizer } = require('../../../platform/http/auth');
const { perCourt, queueOrder } = require('../domain/sessionRules');

// Đọc dữ liệu buổi giao lưu — không ghi gì.

const iso = (d) => (d ? new Date(d).toISOString() : null);
const RECENT = 6;

const createSessionQueries = ({ models, players, matches, ctx, service }) => {
  const { PlaySession } = models;

  const progress = async (s) => {
    const snap = await service.snapshot(s.tenantId, s);
    const count = (st) => snap.list.filter((m) => m.status === st).length;
    return {
      players: { present: snap.roster.filter((r) => r.status === 'present').length, left: snap.roster.filter((r) => r.status === 'left').length },
      matches: { total: snap.list.filter((m) => m.status !== 'cancelled').length, inPlay: count('in_play'), completed: count('completed'), ended: count('ended') },
      freeCourts: s.status === 'open' ? snap.freeCourts.length : 0
    };
  };

  const list = async ({ auth, status, organizerRef, from, to, page, limit }) => {
    const where = { tenantId: auth.tenant };
    if (status) where.status = status;
    if (organizerRef) where.organizerRef = organizerRef;
    else if (!auth.allOrgs) where.organizerRef = auth.org.length ? auth.org : '__none__';
    if (organizerRef && !canAccessOrganizer(auth, organizerRef)) return { rows: [], count: 0 };
    if (from || to) where.startsAt = { ...(from ? { [Op.gte]: new Date(from) } : {}), ...(to ? { [Op.lt]: new Date(new Date(to).getTime() + 86400000) } : {}) };
    return PlaySession.findAndCountAll({ where, order: [['startsAt', 'DESC'], ['createdAt', 'DESC']], offset: (page - 1) * limit, limit });
  };

  const loadForRead = async (auth, id) => {
    const s = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, s, 'read');
    return s;
  };

  const rosterRows = async (auth, s, snap) => {
    const people = await players.findByIds(auth.tenant, snap.roster.map((r) => r.playerId));
    const views = new Map((await players.enrich(auth.tenant, people, { auth })).map((v) => [v.id, v]));
    const disc = s.format === 'singles' ? 'singles' : 'doubles';
    return snap.roster.map((r) => {
      const v = views.get(r.playerId);
      const rating = v && v.ratings ? v.ratings[disc] : null;
      return {
        playerId: r.playerId,
        name: v ? v.displayName : null,
        gender: v ? v.gender ?? null : null,
        status: r.status,
        joinedAt: iso(r.joinedAt),
        leftAt: iso(r.leftAt),
        gamesPlayed: r.gamesPlayed,
        gamesCredit: r.gamesCredit,
        waitingSince: iso(r.waitingSince),
        onCourt: snap.courtOf.get(r.playerId) || null,
        rating: rating ? rating.rating : null,
        pairingRating: rating ? rating.pairingRating : null,
        flags: v ? v.flags || [] : []
      };
    });
  };

  const roster = async ({ auth, id }) => {
    const s = await loadForRead(auth, id);
    return rosterRows(auth, s, await service.snapshot(auth.tenant, s));
  };

  const sessionMatches = async ({ auth, id }) => {
    const s = await loadForRead(auth, id);
    const rows = await matches.listForContext(auth.tenant, 'session', s.id);
    const courtIndex = new Map(s.courtRefs.map((c, i) => [c, i]));
    rows.sort((a, b) => a.roundNo - b.roundNo || (courtIndex.get(a.courtRef) ?? 99) - (courtIndex.get(b.courtRef) ?? 99));
    return matches.views(auth.tenant, rows);
  };

  // Màn hình lớn (TV) ở sân: sân – ai với ai – từ lúc nào; hàng chờ theo thứ tự ưu
  // tiên, đánh dấu những người sẽ ra sân ở lượt tới; vài kết quả gần nhất.
  const board = async ({ auth, id }) => {
    const s = await loadForRead(auth, id);
    const snap = await service.snapshot(auth.tenant, s);
    const shown = [...snap.live, ...snap.list.filter((m) => m.status === 'completed').sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, RECENT)];
    const views = new Map((await matches.views(auth.tenant, shown)).map((v) => [v.id, v]));
    const rows = await rosterRows(auth, s, snap);
    const byCourt = new Map(snap.live.map((m) => [m.courtRef, m]));
    const queue = rows
      .filter((r) => r.status === 'present' && !r.onCourt)
      .map((r) => ({ ...r, effectiveGames: r.gamesPlayed + r.gamesCredit }))
      .sort(queueOrder);
    const size = perCourt(s.format);
    const nextCount = s.status === 'open' ? Math.min(size * Math.max(snap.freeCourts.length, 1), Math.floor(queue.length / size) * size) : 0;
    return {
      session: { id: s.id, name: s.name, status: s.status, format: s.format, mode: s.mode, rated: s.rated, rounds: s.rounds },
      serverTime: new Date().toISOString(),
      courts: s.courtRefs.map((courtRef) => {
        const m = byCourt.get(courtRef);
        return { courtRef, status: m ? 'busy' : 'free', match: m ? views.get(m.id) : null };
      }),
      queue: queue.map((r, i) => ({
        position: i + 1, playerId: r.playerId, name: r.name, gamesPlayed: r.gamesPlayed, waitingSince: r.waitingSince, next: i < nextCount
      })),
      recent: shown.filter((m) => m.status === 'completed').map((m) => views.get(m.id)),
      counts: { present: rows.filter((r) => r.status === 'present').length, onCourt: rows.filter((r) => r.onCourt).length, waiting: queue.length }
    };
  };

  // Bản xem trước "Xếp sân trống" — id để gửi lại nguyên văn khi xác nhận, tên / điểm ở `players`
  // (effectiveGames = số trận đã đánh + số trận được bù khi đến muộn, dùng để ưu tiên).
  const proposalView = async ({ auth, session: s, snap, inputs, result }) => {
    const people = new Map((await players.findByIds(auth.tenant, inputs.map((p) => p.id))).map((p) => [p.id, p]));
    const input = new Map(inputs.map((p) => [p.id, p]));
    const partnerCount = new Map(snap.history.partners.map(([a, b, n]) => [`${a}|${b}`, n]));
    const repeats = (side) => (side.length === 2 ? partnerCount.get([...side].sort().join('|')) || 0 : 0);
    return {
      seed: result.seed,
      round: s.rounds + 1,
      freeCourts: snap.freeCourts,
      assignments: result.assignments.map((a) => ({ ...a, repeatPartners: repeats(a.sideA) + repeats(a.sideB) })),
      waiting: result.waiting,
      players: Object.fromEntries(
        inputs.map((p) => [p.id, { name: people.get(p.id) ? people.get(p.id).displayName : null, pairingRating: input.get(p.id).rating, effectiveGames: p.gamesPlayed }])
      )
    };
  };

  return { progress, list, roster, sessionMatches, board, proposalView };
};

module.exports = { createSessionQueries };
