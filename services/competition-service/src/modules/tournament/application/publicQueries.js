const { Op, fn, col } = require('sequelize');
const { notFound } = require('../../../platform/http/errors');
const profile = require('../../player').domain.profile;
const { publicMatchView, playerIdsOf } = require('../../match').domain.publicView;

// Đọc dữ liệu giải cho TRANG CÔNG KHAI (plan 27): người chưa đăng nhập và khách xem được giải, danh sách đăng ký, lịch,
// bảng, sơ đồ. Khác với route của nhân viên:
//  - không kiểm chi nhánh (`org`) — ai cũng xem được giải đã mở đăng ký trở đi, của mọi chi nhánh;
//  - chỉ giải `open / drawn / in_progress / finalized` (nháp và đã huỷ coi như không tồn tại);
//  - mọi kết quả đi qua `shape*` liệt kê TỪNG TRƯỜNG được lộ — thêm cột nội bộ sau này không tự rò ra ngoài
//    (courtRefs, createdByRef, điểm trình, cờ, …). Test hợp đồng bật `additionalProperties: false` để bắt sót;
//  - tên người chơi qua `profile.publicRef` (quyền riêng tư `visibility`).
// Tái dùng các câu truy vấn của nhân viên bằng một quyền đọc nội bộ rồi gọt lại, nên luật tính bảng / sơ đồ chỉ có một nơi.

const PUBLIC_STATUSES = ['open', 'drawn', 'in_progress', 'finalized'];

const iso = (d) => (d ? new Date(d).toISOString() : null);
const escapeLike = (text) => String(text).replace(/[\\%_]/g, '\\$&');

const createTournamentPublic = ({ models, players, queries }) => {
  const { Tournament, TournamentEntry } = models;

  const internal = (tenant) => ({ tenant, scopes: new Set(['tournament:read']), org: ['*'], allOrgs: true, sub: 'public', player: null });

  const load = async (tenant, id) => {
    const t = await Tournament.findOne({ where: { id, tenantId: tenant } });
    if (!t || !PUBLIC_STATUSES.includes(t.status)) throw notFound('Không tìm thấy giải');
    return t;
  };

  // Người xem là ai và có nằm trong giải này không (đang đăng ký, chưa rút) — người trong giải thấy tên nhau.
  const viewerOf = async (auth, t) => {
    const kind = profile.viewerKind(auth);
    const viewer = { kind, selfRef: auth.player || null, selfPlayerId: null, participant: false };
    if (kind === 'staff' || !auth.player) return viewer;
    const me = await players.findByRef(auth.tenant, auth.player);
    if (!me) return viewer;
    viewer.selfPlayerId = me.id;
    viewer.participant = (await TournamentEntry.count({ where: { tournamentId: t.id, playerId: me.id, status: { [Op.ne]: 'withdrawn' } } })) > 0;
    return viewer;
  };

  // Hàm đổi id người chơi → { id, name, masked } cho đúng người xem. Tra DB một lần cho cả danh sách id.
  const labeller = async (auth, viewer, ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    const found = unique.length ? await players.findByIds(auth.tenant, unique) : [];
    const byId = new Map(found.map((p) => [p.id, p]));
    return (id) => {
      const p = byId.get(id);
      return profile.publicRef(p, { viewer: viewer.kind, mine: viewer.participant || Boolean(p && viewer.selfRef && p.externalRef === viewer.selfRef) });
    };
  };

  const shapeTournament = (t) => ({
    id: t.id,
    organizerRef: t.organizerRef,
    name: t.name,
    description: t.description ?? null,
    startsOn: t.startsOn,
    startTime: t.startTime ?? null,
    tier: t.tier,
    discipline: t.discipline,
    genderRule: t.genderRule,
    pairingMode: t.pairingMode,
    maxEntries: t.maxEntries ?? null,
    ratingRule: t.ratingRule ?? null,
    format: t.format,
    groupCount: t.groupCount ?? null,
    advancePerGroup: t.advancePerGroup ?? null,
    thirdPlaceMatch: Boolean(t.thirdPlaceMatch),
    scoring: t.scoring,
    courtCount: t.courtCount,
    matchMinutes: t.matchMinutes,
    rated: Boolean(t.rated),
    ranked: Boolean(t.ranked),
    status: t.status,
    stage: t.stage ?? null,
    finalizedAt: iso(t.finalizedAt)
  });

  // Số NGƯỜI (không phải đội) đã đăng ký / đang chờ — `maxEntries` cũng tính theo người, như lúc đăng ký.
  const entryCounts = async (ids) => {
    const out = new Map(ids.map((id) => [id, { registered: 0, waitlisted: 0 }]));
    if (!ids.length) return out;
    const rows = await TournamentEntry.findAll({
      attributes: ['tournamentId', 'status', [fn('COUNT', col('id')), 'n']],
      where: { tournamentId: ids, status: { [Op.ne]: 'withdrawn' } },
      group: ['tournamentId', 'status'],
      raw: true
    });
    for (const r of rows) out.get(r.tournamentId)[r.status] = Number(r.n);
    return out;
  };

  const registrationOf = (t, counts) => ({
    open: t.status === 'open',
    needsPartner: t.discipline === 'doubles' && t.pairingMode === 'fixed',
    registered: counts.registered,
    waitlisted: counts.waitlisted,
    maxEntries: t.maxEntries ?? null,
    spotsLeft: t.maxEntries ? Math.max(0, t.maxEntries - counts.registered) : null
  });

  const list = async ({ auth, status, organizerRef, q, order, page, limit }) => {
    const wanted = (status ? String(status).split(',') : PUBLIC_STATUSES).filter((s) => PUBLIC_STATUSES.includes(s));
    const where = { tenantId: auth.tenant, status: wanted.length ? wanted : '__none__' };
    if (organizerRef) where.organizerRef = organizerRef;
    if (q) where.name = { [Op.like]: `%${escapeLike(q)}%` };
    const dir = order === 'desc' ? 'DESC' : 'ASC';
    const { rows, count } = await Tournament.findAndCountAll({
      where,
      order: [['startsOn', dir], ['startTime', dir], ['createdAt', dir]],
      offset: (page - 1) * limit,
      limit
    });
    const counts = await entryCounts(rows.map((t) => t.id));
    return { rows: rows.map((t) => ({ ...shapeTournament(t), registration: registrationOf(t, counts.get(t.id)) })), count };
  };

  // Chi tiết giải. Người đăng nhập có hồ sơ người chơi (khách) được thêm `me`: đăng ký của chính mình trong giải (null nếu chưa).
  const detail = async ({ auth, id }) => {
    const t = await load(auth.tenant, id);
    const counts = (await entryCounts([t.id])).get(t.id);
    const { matches } = await queries.progress(t);
    const out = { ...shapeTournament(t), registration: registrationOf(t, counts), matches };
    if (auth.player) {
      const mine = (await entries({ auth, id: t.id })).find((unit) => unit.mine);
      out.me = mine ? { entry: mine, canWithdraw: t.status === 'open' } : null;
    }
    return out;
  };

  const entries = async ({ auth, id }) => {
    const t = await load(auth.tenant, id);
    const viewer = await viewerOf(auth, t);
    const rows = await TournamentEntry.findAll({
      where: { tournamentId: t.id, status: { [Op.ne]: 'withdrawn' } },
      order: [['registeredAt', 'ASC'], ['id', 'ASC']]
    });
    const label = await labeller(auth, viewer, rows.flatMap((e) => [e.playerId, e.partnerPlayerId]));
    // Một cặp cố định có hai dòng đăng ký trỏ vào nhau → gom thành một đơn vị.
    const seen = new Set();
    const units = [];
    for (const e of rows) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const mate = e.partnerPlayerId ? rows.find((x) => !seen.has(x.id) && x.playerId === e.partnerPlayerId && x.partnerPlayerId === e.playerId) : null;
      if (mate) seen.add(mate.id);
      units.push({ e, ids: [e.playerId, ...(e.partnerPlayerId ? [e.partnerPlayerId] : [])] });
    }
    let waitPos = 0;
    return units.map(({ e, ids }) => {
      const waiting = e.status === 'waitlisted' && e.waitlistReason === 'capacity';
      if (waiting) waitPos += 1;
      return {
        id: e.id,
        status: e.status,
        waitlistReason: e.waitlistReason ?? null,
        waitlistPosition: waiting ? waitPos : null,
        registeredAt: iso(e.registeredAt),
        players: ids.map(label),
        mine: Boolean(viewer.selfPlayerId && ids.includes(viewer.selfPlayerId))
      };
    });
  };

  const matchList = async ({ auth, id }) => {
    const t = await load(auth.tenant, id);
    const viewer = await viewerOf(auth, t);
    const list = await queries.matchList({ auth: internal(auth.tenant), id: t.id });
    const label = await labeller(auth, viewer, list.flatMap(playerIdsOf));
    return list.map((m) => publicMatchView(m, label));
  };

  const bracket = async ({ auth, id }) => {
    const t = await load(auth.tenant, id);
    const viewer = await viewerOf(auth, t);
    const rounds = await queries.bracket({ auth: internal(auth.tenant), id: t.id });
    const label = await labeller(auth, viewer, rounds.flatMap((r) => r.matches.flatMap(playerIdsOf)));
    return rounds.map((r) => ({ roundNo: r.roundNo, matches: r.matches.map((m) => publicMatchView(m, label)) }));
  };

  const standings = async ({ auth, id }) => {
    const t = await load(auth.tenant, id);
    const viewer = await viewerOf(auth, t);
    const groups = await queries.standings({ auth: internal(auth.tenant), id: t.id });
    const label = await labeller(auth, viewer, groups.flatMap((g) => g.rows.flatMap((r) => r.team.players.map((p) => p.id))));
    return groups.map((g) => ({
      groupNo: g.groupNo,
      rows: g.rows.map((r) => ({
        teamId: r.teamId,
        rank: r.rank,
        played: r.played,
        wins: r.wins,
        losses: r.losses,
        gamesWon: r.gamesWon,
        gamesLost: r.gamesLost,
        gameDiff: r.gameDiff,
        pointsWon: r.pointsWon,
        pointsLost: r.pointsLost,
        pointDiff: r.pointDiff,
        team: { id: r.team.id, players: r.team.players.map((p) => label(p.id)), groupNo: r.team.groupNo, seed: r.team.seed, withdrawn: r.team.withdrawn }
      }))
    }));
  };

  const placements = async ({ auth, id }) => {
    const t = await load(auth.tenant, id);
    const viewer = await viewerOf(auth, t);
    const rows = await queries.placements({ auth: internal(auth.tenant), id: t.id });
    const label = await labeller(auth, viewer, rows.flatMap((r) => r.players.map((p) => p.id)));
    return rows.map((r) => ({
      teamId: r.teamId,
      from: r.from,
      to: r.to,
      label: r.label,
      reachedKnockout: r.reachedKnockout,
      wins: r.wins,
      players: r.players.map((p) => label(p.id))
    }));
  };

  return { load, list, detail, entries, matchList, bracket, standings, placements, viewerOf, labeller, entryCounts, registrationOf, PUBLIC_STATUSES };
};

module.exports = { createTournamentPublic, PUBLIC_STATUSES };
