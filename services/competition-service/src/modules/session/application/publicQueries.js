const { Op, fn, col } = require('sequelize');
const { notFound } = require('../../../platform/http/errors');
const profile = require('../../player').domain.profile;
const { publicMatchView, playerIdsOf } = require('../../match').domain.publicView;

// Đọc dữ liệu buổi giao lưu cho TRANG CÔNG KHAI (plan 27) — cùng nguyên tắc với tournament/application/publicQueries:
// không kiểm chi nhánh, chỉ buổi `open` và buổi `closed` trong 30 ngày gần đây (huỷ coi như không tồn tại), trường được lộ
// liệt kê từng cái một, tên người chơi theo quyền riêng tư. Màn "bảng sân" tái dùng câu truy vấn của nhân viên.

const PUBLIC_STATUSES = ['open', 'closed'];
const CLOSED_VISIBLE_DAYS = 30;

const iso = (d) => (d ? new Date(d).toISOString() : null);

const createSessionPublic = ({ models, players, queries, service }) => {
  const { PlaySession, PlaySessionPlayer, SessionSignup } = models;

  const internal = (tenant) => ({ tenant, scopes: new Set(['session:read']), org: ['*'], allOrgs: true, sub: 'public', player: null });

  const visibleSince = (now) => new Date(now.getTime() - CLOSED_VISIBLE_DAYS * 86400000);

  const load = async (tenant, id, now = new Date()) => {
    const s = await PlaySession.findOne({ where: { id, tenantId: tenant } });
    const visible = s && (s.status === 'open' || (s.status === 'closed' && new Date(s.startsAt) >= visibleSince(now)));
    if (!visible) throw notFound('Không tìm thấy buổi giao lưu');
    return s;
  };

  const viewerOf = async (auth, s) => {
    const kind = profile.viewerKind(auth);
    const viewer = { kind, selfRef: auth.player || null, selfPlayerId: null, participant: false };
    if (kind === 'staff' || !auth.player) return viewer;
    const me = await players.findByRef(auth.tenant, auth.player);
    if (!me) return viewer;
    viewer.selfPlayerId = me.id;
    viewer.participant =
      (await PlaySessionPlayer.count({ where: { sessionId: s.id, playerId: me.id } })) > 0 ||
      (await SessionSignup.count({ where: { sessionId: s.id, playerId: me.id, status: ['registered', 'waitlisted', 'attended'] } })) > 0;
    return viewer;
  };

  const labeller = async (auth, viewer, ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    const found = unique.length ? await players.findByIds(auth.tenant, unique) : [];
    const byId = new Map(found.map((p) => [p.id, p]));
    return (id) => {
      const p = byId.get(id);
      return profile.publicRef(p, { viewer: viewer.kind, mine: viewer.participant || Boolean(p && viewer.selfRef && p.externalRef === viewer.selfRef) });
    };
  };

  const shapeSession = (s) => ({
    id: s.id,
    organizerRef: s.organizerRef,
    name: s.name,
    startsAt: iso(s.startsAt),
    format: s.format,
    mode: s.mode,
    rated: Boolean(s.rated),
    scoring: s.scoring,
    status: s.status,
    courtCount: Array.isArray(s.courtRefs) ? s.courtRefs.length : 0,
    rounds: s.rounds,
    closedAt: iso(s.closedAt)
  });

  const presentCounts = async (ids) => {
    const out = new Map(ids.map((id) => [id, 0]));
    if (!ids.length) return out;
    const rows = await PlaySessionPlayer.findAll({
      attributes: ['sessionId', [fn('COUNT', col('id')), 'n']],
      where: { sessionId: ids, status: 'present' },
      group: ['sessionId'],
      raw: true
    });
    for (const r of rows) out.set(r.sessionId, Number(r.n));
    return out;
  };

  // Số chỗ đăng ký online của một loạt buổi: chỗ = đã đăng ký giữ chỗ ∪ đang có mặt (như signupService.occupiedCount).
  const signupSummaries = async (sessions) => {
    const out = new Map();
    if (!sessions.length) return out;
    const ids = sessions.map((s) => s.id);
    const state = new Map(ids.map((id) => [id, { registered: 0, waitlisted: 0, occupied: new Set() }]));
    const signs = await SessionSignup.findAll({ attributes: ['sessionId', 'playerId', 'status'], where: { sessionId: ids, status: ['registered', 'waitlisted'] }, raw: true });
    for (const r of signs) {
      const e = state.get(r.sessionId);
      e[r.status] += 1;
      if (r.status === 'registered') e.occupied.add(r.playerId);
    }
    const present = await PlaySessionPlayer.findAll({ attributes: ['sessionId', 'playerId'], where: { sessionId: ids, status: 'present' }, raw: true });
    for (const r of present) state.get(r.sessionId).occupied.add(r.playerId);
    for (const s of sessions) {
      const e = state.get(s.id);
      out.set(s.id, {
        open: s.status === 'open',
        maxPlayers: s.maxPlayers ?? null,
        registered: e.registered,
        waitlisted: e.waitlisted,
        spotsLeft: s.maxPlayers ? Math.max(0, s.maxPlayers - e.occupied.size) : null
      });
    }
    return out;
  };

  // Đăng ký của chính người xem trong một buổi: giữ chỗ / đang chờ (kèm thứ tự) / đã đến (đã điểm danh, có đăng ký trước hay không).
  const meOf = async (auth, s) => {
    const me = auth.player ? await players.findByRef(auth.tenant, auth.player) : null;
    if (!me) return null;
    const row = await SessionSignup.findOne({ where: { sessionId: s.id, playerId: me.id, status: { [Op.ne]: 'cancelled' } } });
    const present = await PlaySessionPlayer.count({ where: { sessionId: s.id, playerId: me.id } });
    if (row && ['registered', 'waitlisted'].includes(row.status) && !present) {
      let position = null;
      if (row.status === 'waitlisted') {
        const ahead = await SessionSignup.count({
          where: { sessionId: s.id, status: 'waitlisted', [Op.or]: [{ signedUpAt: { [Op.lt]: row.signedUpAt } }, { signedUpAt: row.signedUpAt, id: { [Op.lt]: row.id } }] }
        });
        position = ahead + 1;
      }
      return { status: row.status, waitlistPosition: position, canCancel: s.status === 'open' };
    }
    if (row || present) return { status: 'attended', waitlistPosition: null, canCancel: false };
    return null;
  };

  const list = async ({ auth, status, organizerRef, order, page, limit, now = new Date() }) => {
    const wanted = (status ? String(status).split(',') : PUBLIC_STATUSES).filter((x) => PUBLIC_STATUSES.includes(x));
    const parts = [];
    if (wanted.includes('open')) parts.push({ status: 'open' });
    if (wanted.includes('closed')) parts.push({ status: 'closed', startsAt: { [Op.gte]: visibleSince(now) } });
    const where = { tenantId: auth.tenant, ...(parts.length ? { [Op.or]: parts } : { id: '__none__' }) };
    if (organizerRef) where.organizerRef = organizerRef;
    const dir = order === 'desc' ? 'DESC' : 'ASC';
    const { rows, count } = await PlaySession.findAndCountAll({ where, order: [['startsAt', dir], ['createdAt', dir]], offset: (page - 1) * limit, limit });
    const present = await presentCounts(rows.map((s) => s.id));
    const signup = await signupSummaries(rows);
    return { rows: rows.map((s) => ({ ...shapeSession(s), players: { present: present.get(s.id) }, signup: signup.get(s.id) })), count };
  };

  const detail = async ({ auth, id }) => {
    const s = await load(auth.tenant, id);
    const { players: counts, matches } = await queries.progress(s);
    const signup = (await signupSummaries([s])).get(s.id);
    const out = { ...shapeSession(s), players: { present: counts.present }, matches, signup };
    if (auth.player) out.me = await meOf(auth, s); // chỉ khách đăng nhập có hồ sơ người chơi
    return out;
  };

  // Ai đã đăng ký online (giữ chỗ / chờ / đã đến), tên theo quyền riêng tư; người đăng ký thấy tên đầy đủ của nhau.
  const signups = async ({ auth, id }) => {
    const s = await load(auth.tenant, id);
    const viewer = await viewerOf(auth, s);
    const rows = await SessionSignup.findAll({ where: { sessionId: s.id, status: { [Op.ne]: 'cancelled' } }, order: [['signedUpAt', 'ASC'], ['id', 'ASC']] });
    const label = await labeller(auth, viewer, rows.map((r) => r.playerId));
    let waiting = 0;
    return rows.map((r) => {
      if (r.status === 'waitlisted') waiting += 1;
      return {
        id: r.id,
        status: r.status,
        waitlistPosition: r.status === 'waitlisted' ? waiting : null,
        player: label(r.playerId),
        mine: Boolean(viewer.selfPlayerId && r.playerId === viewer.selfPlayerId)
      };
    });
  };

  // Buổi giao lưu đang mở mà người xem đã đăng ký (giữ chỗ / đang chờ) — cho trang "của tôi".
  const mine = async ({ auth }) => {
    const me = auth.player ? await players.findByRef(auth.tenant, auth.player) : null;
    if (!me) return [];
    const rows = await SessionSignup.findAll({ where: { tenantId: auth.tenant, playerId: me.id, status: ['registered', 'waitlisted'] } });
    if (!rows.length) return [];
    const sessions = await PlaySession.findAll({ where: { id: rows.map((r) => r.sessionId), status: 'open' }, order: [['startsAt', 'ASC'], ['createdAt', 'ASC']] });
    const present = await presentCounts(sessions.map((s) => s.id));
    const signup = await signupSummaries(sessions);
    const out = [];
    for (const s of sessions) {
      const state = await meOf(auth, s);
      if (!state || state.status === 'attended') continue;
      out.push({
        session: { ...shapeSession(s), players: { present: present.get(s.id) }, signup: signup.get(s.id) },
        signup: { status: state.status, waitlistPosition: state.waitlistPosition }
      });
    }
    return out;
  };

  const board = async ({ auth, id }) => {
    const s = await load(auth.tenant, id);
    const viewer = await viewerOf(auth, s);
    const b = await queries.board({ auth: internal(auth.tenant), id: s.id });
    const ids = [
      ...b.courts.flatMap((c) => (c.match ? playerIdsOf(c.match) : [])),
      ...b.upcoming.flatMap((a) => [...a.sideA, ...a.sideB].map((p) => p.id)),
      ...b.queue.map((q) => q.playerId),
      ...b.recent.flatMap(playerIdsOf)
    ];
    const label = await labeller(auth, viewer, ids);
    return {
      session: { id: b.session.id, name: b.session.name, status: b.session.status, format: b.session.format, mode: b.session.mode, rated: b.session.rated, rounds: b.session.rounds },
      serverTime: b.serverTime,
      courts: b.courts.map((c) => ({ courtRef: c.courtRef, status: c.status, match: c.match ? publicMatchView(c.match, label) : null })),
      upcoming: b.upcoming.map((a) => ({ courtRef: a.courtRef, sideA: a.sideA.map((p) => label(p.id)), sideB: a.sideB.map((p) => label(p.id)) })),
      queue: b.queue.map((q) => ({ position: q.position, player: label(q.playerId), gamesPlayed: q.gamesPlayed, waitingSince: q.waitingSince, next: q.next })),
      recent: b.recent.map((m) => publicMatchView(m, label)),
      counts: b.counts
    };
  };

  return { load, list, detail, board, signups, mine, viewerOf, labeller, shapeSession, presentCounts, signupSummaries, PUBLIC_STATUSES, service };
};

module.exports = { createSessionPublic, PUBLIC_STATUSES, CLOSED_VISIBLE_DAYS };
