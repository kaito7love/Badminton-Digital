// Dữ liệu demo cho bản portfolio (docs/05-extra/02-remediation/18 bước 2–3, plan 19).
// Tạo bằng CHÍNH các service thật (chấm trình, bốc thăm, ghi kết quả, chốt, xếp sân, bấm
// điểm) — không chèn thẳng bảng — nên chạy seed cũng là một lần chạy đầu-cuối.
//   npm run seed:demo
// Kết quả: 39 người chơi, 2 giải đã chốt (có lịch sử điểm, BXH có dữ liệu), 1 giải đang
// mở đủ người để bấm "Bốc thăm", 1 buổi giao lưu đã đóng (tính điểm) và 1 buổi đang diễn
// ra (3 sân đang đánh, có sẵn tỉ số dở); hôm nay có 3 giải để thử vận hành (plan 20): đơn nữ
// vòng tròn đang đánh, đôi cặp sẵn vòng bảng + loại trực tiếp, đơn nam bốc thăm tại sân. bd:customer:1 (tài khoản khách demo của app chính) cố ý CHƯA có
// điểm để khách xem demo tự làm form tự chấm. Chạy lần nào cũng ra cùng dữ liệu (chỉ khác
// giờ tuyệt đối, vì mọi thứ lùi ngày tính từ lúc seed).
require('dotenv').config();
const { loadConfig } = require('../src/platform/config');
const { createLogger } = require('../src/platform/logging/logger');
const { createSequelize } = require('../src/platform/db/sequelize');
const { defineModels } = require('../src/db');
const { createApp } = require('../src/app');
const { createRng } = require('../src/modules/matchmaking').domain;
const { expectedScore } = require('../src/modules/rating').domain.ratingEngine;
const { getRubric } = require('../src/modules/rating/domain/rubric');

const TENANT = process.env.DEMO_TENANT || 'badminton-digital';
const DAY = 24 * 60 * 60 * 1000;

const PEOPLE = [
  // [mã ngoài, tên, giới, năm sinh, mức nền (1–5), chi nhánh, quyền riêng tư]
  ['bd:customer:2', 'Khách Vãng Lai VIP', 'male', 1988, 3, 'bd:branch:1', 'members'],
  ['demo:player:01', 'Trần Minh Tuấn', 'male', 1994, 4, 'bd:branch:1', 'public'],
  ['demo:player:02', 'Lê Hoàng Nam', 'male', 1990, 4, 'bd:branch:1', 'members'],
  ['demo:player:03', 'Phạm Quốc Huy', 'male', 1999, 3, 'bd:branch:2', 'public'],
  ['demo:player:04', 'Võ Thanh Long', 'male', 1985, 3, 'bd:branch:1', 'members'],
  ['demo:player:05', 'Đặng Văn Hùng', 'male', 1979, 3, 'bd:branch:2', 'members'],
  ['demo:player:06', 'Bùi Anh Khoa', 'male', 2001, 2, 'bd:branch:3', 'members'],
  ['demo:player:07', 'Ngô Đức Phúc', 'male', 1996, 2, 'bd:branch:1', 'members'],
  ['demo:player:08', 'Hồ Tấn Duy', 'male', 1992, 3, 'bd:branch:3', 'members'],
  ['demo:player:09', 'Dương Gia Bảo', 'male', 2003, 2, 'bd:branch:2', 'public'],
  ['demo:player:10', 'Lý Công Thành', 'male', 1983, 4, 'bd:branch:1', 'members'],
  ['demo:player:11', 'Mai Xuân Lộc', 'male', 1998, 2, 'bd:branch:3', 'hidden'],
  ['demo:player:12', 'Nguyễn Thị Mai', 'female', 1995, 4, 'bd:branch:1', 'public'],
  ['demo:player:13', 'Trần Ngọc Lan', 'female', 1992, 3, 'bd:branch:1', 'members'],
  ['demo:player:14', 'Phan Thu Hà', 'female', 1997, 3, 'bd:branch:2', 'members'],
  ['demo:player:15', 'Đỗ Minh Thư', 'female', 2000, 3, 'bd:branch:1', 'public'],
  ['demo:player:16', 'Vũ Hồng Nhung', 'female', 1989, 2, 'bd:branch:2', 'members'],
  ['demo:player:17', 'Hoàng Thảo Vy', 'female', 2002, 2, 'bd:branch:3', 'members'],
  ['demo:player:18', 'Cao Thị Trang', 'female', 1986, 3, 'bd:branch:1', 'members'],
  ['demo:player:19', 'Lâm Bích Ngọc', 'female', 1999, 2, 'bd:branch:3', 'members'],
  ['demo:player:20', 'Tạ Kim Anh', 'female', 1994, 4, 'bd:branch:2', 'members'],
  ['demo:player:21', 'Châu Mỹ Linh', 'female', 2001, 2, 'bd:branch:1', 'members'],
  ['demo:player:22', 'Kiều Diễm My', 'female', 1991, 3, 'bd:branch:2', 'members'],
  ['demo:player:23', 'Quách Tuệ Nhi', 'female', 1997, 2, 'bd:branch:3', 'members']
];

const main = async () => {
  const config = loadConfig();
  if (config.isProduction && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Không seed dữ liệu demo ở production (đặt ALLOW_DEMO_SEED=true nếu thật sự là bản demo)');
  }
  const logger = createLogger({ ...config, log: { level: 'warn' } });
  const sequelize = createSequelize(config.db, logger);
  const models = defineModels(sequelize);
  const { modules } = createApp({ config: { ...config, events: { ...config.events, validatePayloads: true } }, sequelize, models, logger });
  if (await models.Player.count({ where: { tenantId: TENANT } })) {
    throw new Error(`Tenant ${TENANT} đã có dữ liệu — seed demo chỉ chạy trên DB trống (demo-reset: drop → migrate → seed)`);
  }
  const auth = {
    tenant: TENANT, sub: 'system:demo-seed', clientId: 'seed', allOrgs: true, org: ['*'], player: null, playerName: null,
    scopes: new Set(['rating:read', 'rating:assess', 'rating:assess:any', 'rating:adjust', 'player:write', 'tournament:read', 'tournament:operate', 'tournament:manage', 'session:read', 'session:operate'])
  };
  const rng = createRng('badminton-digital-demo');
  const rubric = getRubric();
  const { player, rating, tournament, match, session } = modules;

  // --- Người chơi + chấm trình (nhân viên chấm đủ form, mức lệch ngẫu nhiên quanh mức nền) ---
  const ids = {};
  for (const [ref, name, gender, birthYear, base, home, visibility] of PEOPLE) {
    const { player: p } = await player.service.upsertByRef({ tenant: TENANT, externalRef: ref, displayName: name, actorRef: auth.sub });
    await player.service.updateProfile({
      tenant: TENANT, playerId: p.id, isStaff: true, actorRef: auth.sub,
      patch: { gender, birthYear, homeOrganizerRef: home, visibility, dominantHand: rng.next() < 0.15 ? 'left' : 'right', doublesPosition: ['front', 'back', 'both'][rng.int(3)], preferredPlay: 'both' }
    });
    const answers = Object.fromEntries(rubric.criteria.map((c) => [c.code, Math.max(1, Math.min(5, base + [-1, 0, 0, 1][rng.int(4)]))]));
    await rating.service.submitStaff({ auth, playerId: p.id, body: { rubricVersion: rubric.version, answers, note: 'Dữ liệu demo' } });
    ids[ref] = p.id;
  }
  // Tài khoản khách demo: có hồ sơ nhưng chưa chấm trình — để tự làm form.
  await player.service.upsertByRef({ tenant: TENANT, externalRef: 'bd:customer:1', displayName: 'Nguyễn Văn Khách', actorRef: auth.sub });

  // Bài chấm ban đầu lùi về 60 ngày trước — trước giải đầu tiên — để sổ điểm đúng thứ tự thời
  // gian (plan 18 mục 9: trước đây bài chấm mang ngày seed, nằm sau các giải đã lùi ngày).
  const assessedAt = Date.now() - 60 * DAY;
  for (const [i, pid] of Object.values(ids).entries()) {
    const at = new Date(assessedAt + i * 5 * 60 * 1000);
    await models.Assessment.update({ createdAt: at, updatedAt: at }, { where: { playerId: pid }, silent: true });
    await models.RatingChange.update({ createdAt: at }, { where: { playerId: pid, reason: 'assessment' } });
    await models.PlayerRating.update({ verifiedAt: at }, { where: { playerId: pid }, silent: true });
    await models.Player.update({ createdAt: at }, { where: { id: pid }, silent: true });
  }

  const ratingOf = async (discipline, pid) => (await rating.queries.disciplineRatings(TENANT, [pid], discipline)).get(pid).rating;

  // Tỉ số thực tế cho một trận: bên thắng bốc theo xác suất Elo.
  const playMatch = async (m, discipline, bestOf) => {
    const parts = (await match.service.participantsOf([m.id])).get(m.id);
    const side = async (s) => {
      const r = await Promise.all(parts.filter((p) => p.side === s).map((p) => ratingOf(discipline, p.playerId)));
      return r.reduce((a, b) => a + b, 0) / r.length;
    };
    const aWins = rng.next() < expectedScore(await side('A'), await side('B'));
    const games = [];
    const needed = Math.ceil(bestOf / 2);
    let wa = 0;
    let wb = 0;
    while (wa < needed && wb < needed) {
      const aTakes = games.length === 0 || rng.next() < 0.75 ? aWins : !aWins;
      const lose = 9 + rng.int(11);
      games.push(aTakes ? [21, lose] : [lose, 21]);
      if (aTakes) wa += 1;
      else wb += 1;
    }
    await match.service.recordResult({ auth, matchId: m.id, body: { games }, ifMatch: String(m.version) });
  };

  // Ghi kết quả mọi trận đang chờ của một giải.
  const playAll = async (t) => {
    for (;;) {
      const list = (await match.service.listForContext(TENANT, 'tournament', t.id)).filter((m) => m.status === 'scheduled' && m.teamAId && m.teamBId);
      if (!list.length) return;
      for (const m of list) await playMatch(m, t.discipline, t.scoring.bestOf);
    }
  };

  const backdate = async (t, days) => {
    const at = new Date(Date.now() - days * DAY);
    await models.Tournament.update({ finalizedAt: at }, { where: { id: t.id } });
    await models.Match.update({ completedAt: at }, { where: { contextId: t.id } });
    await models.RatingChange.update({ createdAt: at }, { where: { contextId: t.id } });
    await models.RankingResult.update({ awardedAt: at, expiresAt: new Date(at.getTime() + 364 * DAY) }, { where: { tournamentId: t.id } });
  };

  const runTournament = async (body, entrants, { daysAgo }) => {
    let t = await tournament.service.create({ auth, body });
    t = await tournament.service.open({ auth, id: t.id });
    for (const pid of entrants) await tournament.service.register({ auth, id: t.id, playerId: pid });
    const { proposal } = await tournament.service.previewDraw({ auth, id: t.id, seed: `demo-${t.name}` });
    await tournament.service.confirmDraw({
      auth, id: t.id,
      body: { seed: proposal.seed, teams: proposal.teams.map((x) => ({ players: x.players.map((p) => p.id) })), groups: proposal.groups, bracket: proposal.bracket }
    });
    t = await models.Tournament.findByPk(t.id);
    await playAll(t);
    if (t.format === 'groups_knockout') {
      await tournament.service.confirmKnockout({ auth, id: t.id });
      await playAll(t);
    }
    const { result } = await tournament.finalizer.finalize({ auth, id: t.id });
    await backdate(t, daysAgo);
    return { t, result };
  };

  const men = PEOPLE.filter((p) => p[2] === 'male').map((p) => ids[p[0]]);
  const women = PEOPLE.filter((p) => p[2] === 'female').map((p) => ids[p[0]]);

  const t1 = await runTournament(
    {
      organizerRef: 'bd:branch:1', name: 'Mở rộng đôi nam nữ tháng 8 — Chi nhánh 1', startsOn: new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10),
      tier: 'open', discipline: 'doubles', genderRule: 'mixed', pairingMode: 'random_balanced', format: 'groups_knockout',
      groupCount: 3, advancePerGroup: 2, scoring: '1x21', courtCount: 4, matchMinutes: 15
    },
    [...men, ...women],
    { daysAgo: 40 }
  );
  await modules.ranking.service.dailySnapshot(new Date(Date.now() - 7 * DAY));
  const t2 = await runTournament(
    {
      organizerRef: 'bd:branch:2', name: 'Đơn nam CLB tháng 9 — Chi nhánh 2', startsOn: new Date(Date.now() - 12 * DAY).toISOString().slice(0, 10),
      tier: 'club', discipline: 'singles', genderRule: 'men', format: 'knockout', thirdPlaceMatch: true, scoring: '3x21', courtCount: 2, matchMinutes: 35
    },
    men.slice(0, 8),
    { daysAgo: 12 }
  );

  // Buổi giao lưu chạy theo ĐỒNG HỒ GIẢ LẬP (plan 18 mục 9): gọi đúng các service thật (điểm
  // danh, "Xếp sân trống", nhập tỉ số, rời buổi, đóng buổi), rồi đặt lại giờ điểm danh / vào
  // sân / xong theo đồng hồ giả lập. Hàng chờ xếp theo các giờ này nên không phụ thuộc giờ thật
  // lúc seed → seed lần nào cũng ra giống hệt; mỗi trận 12–18 phút như thật.
  const MIN = 60 * 1000;
  const simulateSession = async ({ body, arrivals, leaves = {}, start, until, finishAll = false }) => {
    const s = await session.service.create({ auth, body: { ...body, startsAt: new Date(start).toISOString() } });
    const courtIndex = new Map(s.courtRefs.map((c, i) => [c, i]));
    const setRows = (playerIds, values) => models.PlaySessionPlayer.update(values, { where: { sessionId: s.id, playerId: playerIds } });
    const playing = new Map(); // courtRef → { matchId, players, end }
    const queue = [...arrivals];
    const leaving = { ...leaves };
    let finished = 0;
    let lastEnd = start;
    const byEnd = () => [...playing].sort((a, b) => a[1].end - b[1].end || courtIndex.get(a[0]) - courtIndex.get(b[0]));
    const finish = async (courtRef, x) => {
      finished += 1;
      const m = await models.Match.findByPk(x.matchId);
      // Cứ 7 trận có 1 trận "xong, không nhập tỉ số" cho giống thực tế.
      if (finished % 7 === 0) await match.service.endMatch({ auth, matchId: m.id });
      else await playMatch(m, 'doubles', s.scoring.bestOf);
      await models.Match.update({ completedAt: new Date(x.end) }, { where: { id: m.id } });
      await setRows(x.players, { waitingSince: new Date(x.end) });
      playing.delete(courtRef);
      lastEnd = Math.max(lastEnd, x.end);
    };
    for (let t = start; t <= until; t += MIN) {
      for (const [courtRef, x] of byEnd()) if (x.end <= t) await finish(courtRef, x);
      while (queue.length && queue[0].at <= t) {
        const { playerId, at } = queue.shift();
        await session.service.checkIn({ auth, id: s.id, playerId });
        await setRows([playerId], { joinedAt: new Date(at), waitingSince: new Date(at) });
      }
      for (const [playerId, at] of Object.entries(leaving)) {
        if (at > t || [...playing.values()].some((x) => x.players.includes(playerId))) continue;
        await session.service.leave({ auth, id: s.id, playerId });
        await setRows([playerId], { leftAt: new Date(t) });
        delete leaving[playerId];
      }
      if (playing.size === s.courtRefs.length) continue;
      try {
        const { matchIds } = await session.service.confirmFill({ auth, id: s.id, body: {} });
        await models.Match.update({ calledAt: new Date(t) }, { where: { id: matchIds } });
        const created = await models.Match.findAll({ where: { id: matchIds } });
        const parts = await match.service.participantsOf(matchIds);
        for (const m of created.sort((a, b) => courtIndex.get(a.courtRef) - courtIndex.get(b.courtRef))) {
          playing.set(m.courtRef, { matchId: m.id, players: parts.get(m.id).map((p) => p.playerId), end: t + (12 + rng.int(7)) * MIN });
        }
      } catch (err) {
        if (err.code !== 'NOTHING_TO_FILL') throw err; // chưa đủ người rảnh cho một sân
      }
    }
    if (finishAll) for (const [courtRef, x] of byEnd()) await finish(courtRef, x);
    return { s, lastEnd, playing };
  };
  const arriving = (playerIds, from, gapSeconds) => playerIds.map((playerId, i) => ({ playerId, at: from + i * gapSeconds * 1000 }));

  // Buổi đã đóng (có tính điểm, hệ số 0.5): tối thứ Sáu gần nhất (ít nhất 2 ngày trước), 19:00
  // giờ Việt Nam, 3 sân, 14 người đến đúng giờ, 2 người đến muộn 40 phút, 1 người về sớm.
  const mixed = [...men.slice(0, 8), ...women.slice(0, 6)];
  const friday = new Date(Date.now() - 2 * DAY);
  while (friday.getUTCDay() !== 5) friday.setTime(friday.getTime() - DAY);
  friday.setUTCHours(12, 0, 0, 0);
  const pastStart = friday.getTime();
  const past = await simulateSession({
    body: { organizerRef: 'bd:branch:1', name: 'Giao lưu tối thứ Sáu — Chi nhánh 1', courtRefs: ['bd:court:1', 'bd:court:2', 'bd:court:3'], rated: true, seed: 'demo-giao-luu-thu-sau' },
    arrivals: [...arriving(mixed, pastStart, 40), ...arriving([men[8], women[6]], pastStart + 40 * MIN, 20)],
    leaves: { [women[0]]: pastStart + 90 * MIN },
    start: pastStart,
    until: pastStart + 120 * MIN,
    finishAll: true
  });
  const closed = await session.service.close({ auth, id: past.s.id });
  const closedAt = new Date(past.lastEnd + 2 * MIN);
  await models.PlaySession.update({ closedAt }, { where: { id: past.s.id } });
  await models.RatingChange.update({ createdAt: closedAt }, { where: { contextId: past.s.id } });
  await modules.ranking.service.dailySnapshot(new Date());

  // Buổi đang diễn ra: bắt đầu 26 phút trước lúc seed, 14 người đến lần lượt — sân đang đánh,
  // có người chờ, có kết quả gần đây. Khách xem demo nhập tỉ số rồi bấm "Xếp sân trống".
  const liveStart = Math.floor((Date.now() - 26 * MIN) / MIN) * MIN;
  // Đúng 26 phút sau liveStart (không đọc lại giờ thật): seed qua ranh giới phút vẫn ra giống hệt.
  const liveUntil = liveStart + 26 * MIN;
  const live = await simulateSession({
    body: { organizerRef: 'bd:branch:1', name: 'Giao lưu tối nay — Chi nhánh 1 (demo)', courtRefs: ['bd:court:1', 'bd:court:2', 'bd:court:3'], seed: 'demo-giao-luu-toi-nay' },
    arrivals: arriving(mixed, liveStart, 30),
    start: liveStart,
    until: liveUntil
  });

  // Tỉ số dở ở các sân đang đánh (plan 19): bấm từng pha qua CHÍNH API bấm điểm, mỗi phút đã
  // đánh ≈ 2.5 pha, đội thắng pha bốc theo xác suất Elo (kéo về 0.5 cho có giằng co). Dừng trước
  // khi xong game để trận vẫn đang đánh — mở màn hình TV là thấy số ngay.
  const liveScores = [];
  for (const courtRef of [...live.playing.keys()].sort()) {
    const m = await models.Match.findByPk(live.playing.get(courtRef).matchId);
    const parts = (await match.service.participantsOf([m.id])).get(m.id);
    const mean = async (side) => {
      const r = await Promise.all(parts.filter((p) => p.side === side).map((p) => ratingOf('doubles', p.playerId)));
      return r.reduce((a, b) => a + b, 0) / r.length;
    };
    const pA = 0.5 + (expectedScore(await mean('A'), await mean('B')) - 0.5) * 0.6;
    const rallies = Math.round((2.5 * (liveUntil - new Date(m.calledAt).getTime())) / MIN);
    let state = { revision: 0, current: [0, 0] };
    for (let i = 0; i < rallies && Math.max(...state.current) < m.scoring.points - 2; i += 1) {
      state = await match.live.rally({ auth, matchId: m.id, side: rng.next() < pA ? 'A' : 'B', revision: state.revision });
    }
    liveScores.push(`${courtRef.replace('bd:court:', 'Sân ')} ${state.current.join('–')}`);
  }

  // Giải đang mở, đủ người để khách xem demo bấm "Bốc thăm".
  const open = await tournament.service.create({
    auth,
    body: {
      organizerRef: 'bd:branch:1', name: 'Đôi nam nữ ghép cặp — trình ≤ 4.0 (demo)', startsOn: new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10),
      tier: 'open', discipline: 'doubles', genderRule: 'mixed', pairingMode: 'random_balanced', format: 'groups_knockout', groupCount: 2,
      advancePerGroup: 2, scoring: '1x21', courtCount: 4, matchMinutes: 15, ratingRule: { scope: 'player', max: 4.0 }
    }
  });
  await tournament.service.open({ auth, id: open.id });
  let registered = 0;
  for (const pid of [...men, ...women]) {
    try {
      await tournament.service.register({ auth, id: open.id, playerId: pid });
      registered += 1;
    } catch (err) {
      if (err.code !== 'NOT_ELIGIBLE') throw err; // người trên 4.0 không được đăng ký — đúng luật
    }
  }

  // Giải đang diễn ra hôm nay (plan 20) — để thử vận hành: sân của giải, giờ dự kiến, gọi trận kế
  // tiếp, điểm danh. Thêm SAU mọi phần trên để không đổi dữ liệu cũ (cùng một chuỗi ngẫu nhiên).
  // Sân 4–8: không đụng 3 sân của buổi giao lưu đang diễn ra.
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // ngày theo giờ Việt Nam
  // Người chơi riêng cho các giải hôm nay: không ai vừa ở buổi giao lưu đang diễn ra vừa ở giải
  // (hệ thống không cho một người ở hai sân — gọi trận có người đang đánh bên giao lưu sẽ bị chặn).
  const EXTRA = [
    ['demo:player:24', 'Tô Minh Khang', 'male', 1993, 3], ['demo:player:25', 'Lạc Quang Vinh', 'male', 1990, 4],
    ['demo:player:26', 'Ông Thế Hiển', 'male', 1997, 2], ['demo:player:27', 'Huỳnh Nhật Minh', 'male', 2000, 3],
    ['demo:player:28', 'Triệu Gia Huy', 'male', 1988, 3], ['demo:player:29', 'La Văn Toàn', 'male', 1995, 2],
    ['demo:player:30', 'Từ Đức Anh', 'male', 1999, 3], ['demo:player:31', 'Âu Thành Nhân', 'male', 1986, 4],
    ['demo:player:32', 'Đoàn Thị Hạnh', 'female', 1994, 3], ['demo:player:33', 'Lưu Bảo Châu', 'female', 1998, 2],
    ['demo:player:34', 'Mạc Thanh Tâm', 'female', 1991, 3], ['demo:player:35', 'Văn Thu Thảo', 'female', 2001, 2],
    ['demo:player:36', 'Giang Ngọc Hân', 'female', 1996, 4], ['demo:player:37', 'Khúc Mai Phương', 'female', 1989, 3]
  ];
  const extra = { male: [], female: [] };
  for (const [ref, name, gender, birthYear, base] of EXTRA) {
    const { player: p } = await player.service.upsertByRef({ tenant: TENANT, externalRef: ref, displayName: name, actorRef: auth.sub });
    await player.service.updateProfile({
      tenant: TENANT, playerId: p.id, isStaff: true, actorRef: auth.sub,
      patch: { gender, birthYear, homeOrganizerRef: 'bd:branch:1', visibility: 'members', dominantHand: 'right', doublesPosition: ['front', 'back', 'both'][rng.int(3)], preferredPlay: 'both' }
    });
    const answers = Object.fromEntries(rubric.criteria.map((c) => [c.code, Math.max(1, Math.min(5, base + [-1, 0, 0, 1][rng.int(4)]))]));
    await rating.service.submitStaff({ auth, playerId: p.id, body: { rubricVersion: rubric.version, answers, note: 'Dữ liệu demo' } });
    extra[gender].push(p.id);
  }
  const drawNow = async (t, seed) => {
    const { proposal } = await tournament.service.previewDraw({ auth, id: t.id, seed });
    await tournament.service.confirmDraw({
      auth, id: t.id,
      body: { seed: proposal.seed, teams: proposal.teams.map((x) => ({ players: x.players.map((p) => p.id) })), groups: proposal.groups, bracket: proposal.bracket }
    });
    return models.Tournament.findByPk(t.id);
  };
  const scheduled = async (t, slotMax) =>
    (await match.service.listForContext(TENANT, 'tournament', t.id)).filter((m) => m.status === 'scheduled' && m.teamAId && m.teamBId && m.slotNo <= slotMax);

  // Đơn nữ vòng tròn 5 người, 1 sân: 3 lượt đầu đã đánh, lượt 4 đang đánh có tỉ số dở.
  let rr = await tournament.service.create({
    auth,
    body: {
      organizerRef: 'bd:branch:1', name: 'Đơn nữ vòng tròn — Chi nhánh 1 (đang đánh)', startsOn: today, startTime: '18:00', tier: 'club', discipline: 'singles',
      genderRule: 'women', format: 'round_robin', scoring: '1x21', courtRefs: ['bd:court:4'], matchMinutes: 15
    }
  });
  await tournament.service.open({ auth, id: rr.id });
  for (const pid of women.slice(6, 11)) await tournament.service.register({ auth, id: rr.id, playerId: pid });
  rr = await drawNow(rr, 'demo-don-nu-vong-tron');
  for (const m of await scheduled(rr, 3)) await playMatch(m, 'singles', 1);
  const [rrLive] = await scheduled(rr, 4);
  await match.service.callMatch({ auth, matchId: rrLive.id, courtRef: 'bd:court:4' });
  let rrState = { revision: 0, current: [0, 0] };
  for (let i = 0; i < 23; i += 1) rrState = await match.live.rally({ auth, matchId: rrLive.id, side: rng.next() < 0.55 ? 'A' : 'B', revision: rrState.revision });

  // Đôi cặp đăng ký sẵn, vòng bảng + loại trực tiếp, 6 cặp / 2 bảng / 2 sân: lượt 1 đã đánh.
  let fixed = await tournament.service.create({
    auth,
    body: {
      organizerRef: 'bd:branch:1', name: 'Đôi cặp đăng ký sẵn — vòng bảng + loại trực tiếp (đang đánh)', startsOn: today, startTime: '18:30', tier: 'club',
      discipline: 'doubles', genderRule: 'open', pairingMode: 'fixed', format: 'groups_knockout', groupCount: 2, advancePerGroup: 2, thirdPlaceMatch: true,
      scoring: '1x21', courtRefs: ['bd:court:5', 'bd:court:6'], matchMinutes: 15
    }
  });
  await tournament.service.open({ auth, id: fixed.id });
  for (let i = 0; i < 6; i += 1) await tournament.service.register({ auth, id: fixed.id, playerId: extra.male[i], partnerPlayerId: extra.female[i] });
  fixed = await drawNow(fixed, 'demo-doi-cap-san');
  for (const m of await scheduled(fixed, 1)) await playMatch(m, 'doubles', 1);

  // Đơn nam loại trực tiếp, bốc thăm tại sân: 6 người đăng ký, 4 người đã điểm danh.
  const onsite = await tournament.service.create({
    auth,
    body: {
      organizerRef: 'bd:branch:1', name: 'Đơn nam loại trực tiếp — bốc thăm tại sân', startsOn: today, startTime: '19:00', tier: 'club', discipline: 'singles',
      genderRule: 'men', format: 'knockout', thirdPlaceMatch: true, checkInRequired: true, scoring: '1x21', courtRefs: ['bd:court:7', 'bd:court:8'], matchMinutes: 15
    }
  });
  await tournament.service.open({ auth, id: onsite.id });
  for (const pid of [...men.slice(8, 12), ...extra.male.slice(6, 8)]) await tournament.service.register({ auth, id: onsite.id, playerId: pid });
  const onsiteEntries = await models.TournamentEntry.findAll({ where: { tournamentId: onsite.id }, order: [['registeredAt', 'ASC'], ['id', 'ASC']] });
  for (const e of onsiteEntries.slice(0, 4)) await tournament.service.checkIn({ auth, id: onsite.id, entryId: e.id, present: true });

  // --- Trang công khai /thi-dau (plan 27, p5) — thêm SAU mọi phần trên để không đổi dữ liệu cũ (cùng một chuỗi ngẫu nhiên) ---
  // 1) Đa số hồ sơ hiện tên với khách CHƯA đăng nhập (public) để trang portfolio có gì để xem; vẫn giữ vài hồ sơ members / hidden để thấy cách che tên
  //    ("Thành viên A3F2"). Hồ sơ hidden (demo:player:11) giữ nguyên.
  const keepMembers = new Set([ids['demo:player:02'], ids['demo:player:05'], ids['demo:player:13'], ids['demo:player:16'], extra.male[2], extra.female[3]]);
  const everyone = [...Object.values(ids), ...extra.male, ...extra.female];
  for (const pid of everyone) {
    if (keepMembers.has(pid) || pid === ids['demo:player:11']) continue;
    await player.service.updateProfile({ tenant: TENANT, playerId: pid, isStaff: true, actorRef: auth.sub, patch: { visibility: 'public' } });
  }
  const refOf = new Map([...Object.entries(ids)].map(([ref, id]) => [id, ref]));
  const nameOf = new Map(PEOPLE.map((p) => [p[0], p[1]]));
  // "Khách đăng nhập" giả để gọi đúng cửa vào của khách (đăng ký online): cùng luật, cùng hàng chờ như khách thật bấm trên trang công khai.
  const asCustomer = (ref) => ({ ...auth, sub: `bd:user:${ref}`, player: ref, playerName: nameOf.get(ref) || ref, scopes: new Set(['rating:self', 'entry:self']) });
  const inDays = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

  // 2) Giải đôi cặp cố định đang MỞ ĐĂNG KÝ ONLINE: 10 chỗ (tính theo người), 4 cặp đã vào (còn 2 chỗ) — khách thử đăng ký cả cặp; hai cặp đăng ký "online"
  //    (một cặp có đồng đội chưa có tài khoản) để nhân viên thấy huy hiệu "đăng ký online" + SĐT.
  const onlineFixed = await tournament.service.create({
    auth,
    body: {
      organizerRef: 'bd:branch:1', name: 'Đôi cặp cố định — mở đăng ký online (demo)', startsOn: inDays(9), startTime: '08:30', tier: 'club',
      description: 'Giải đôi giao hữu cuối tuần. Đăng ký cả cặp trong một lần ngay trên trang Thi đấu; hết chỗ thì vào danh sách chờ. Lệ phí thanh toán tại quầy.',
      discipline: 'doubles', genderRule: 'open', pairingMode: 'fixed', format: 'groups_knockout', groupCount: 2, advancePerGroup: 2, thirdPlaceMatch: true,
      scoring: '1x21', courtCount: 4, matchMinutes: 15, maxEntries: 10, ratingRule: { scope: 'player', max: 4.5 }
    }
  });
  await tournament.service.open({ auth, id: onlineFixed.id });
  await tournament.service.register({ auth, id: onlineFixed.id, playerId: men[1], partnerPlayerId: women[1] });
  await tournament.service.register({ auth, id: onlineFixed.id, playerId: men[2], partnerPlayerId: women[2] });
  await tournament.selfRegistration.register({ auth: asCustomer('demo:player:03'), id: onlineFixed.id, partner: { playerId: ids['demo:player:15'] } });
  await tournament.selfRegistration.register({
    auth: asCustomer('demo:player:09'), id: onlineFixed.id,
    partner: { guest: { name: 'Nguyễn Hữu Phước', phone: '0900 000 001', gender: 'male', level: 'tb' } }
  });

  // 3) Giải đơn mở đăng ký online: 8 chỗ, 5 người đã vào.
  const onlineSingles = await tournament.service.create({
    auth,
    body: {
      organizerRef: 'bd:branch:1', name: 'Đơn mở rộng — mở đăng ký online (demo)', startsOn: inDays(16), startTime: '09:00', tier: 'club',
      description: 'Giải đơn vòng tròn, ai cũng đăng ký được. Đăng ký xong theo dõi lịch và kết quả ở trang giải.',
      discipline: 'singles', genderRule: 'open', format: 'round_robin', scoring: '1x21', courtCount: 2, matchMinutes: 15, maxEntries: 8
    }
  });
  await tournament.service.open({ auth, id: onlineSingles.id });
  for (const pid of [men[4], men[5], women[3], women[4]]) await tournament.service.register({ auth, id: onlineSingles.id, playerId: pid });
  await tournament.selfRegistration.register({ auth: asCustomer('demo:player:12'), id: onlineSingles.id });

  // 4) Buổi giao lưu sắp tới có sức chứa 12: 8 người đã đăng ký giữ chỗ (còn 4 chỗ) — khách thử "Tham gia buổi này".
  const soonStart = new Date(Date.now() + 2 * DAY);
  soonStart.setUTCHours(11, 30, 0, 0); // 18:30 giờ Việt Nam
  const soon = await session.service.create({
    auth,
    body: {
      organizerRef: 'bd:branch:1', name: 'Giao lưu cuối tuần — Chi nhánh 1 (đăng ký online)', startsAt: soonStart.toISOString(),
      courtRefs: ['bd:court:1', 'bd:court:2', 'bd:court:3'], format: 'doubles', mode: 'balanced', scoring: '1x21', maxPlayers: 12, seed: 'demo-giao-luu-cuoi-tuan'
    }
  });
  const signedUp = ['demo:player:01', 'demo:player:03', 'demo:player:09', 'demo:player:12', 'demo:player:15', 'demo:player:18', 'demo:player:20', 'demo:player:22'];
  for (const ref of signedUp) await session.signups.signUp({ auth: asCustomer(ref), id: soon.id });

  const champion = t1.result.placements.find((p) => p.from === 1);
  console.log(`Seed demo xong (tenant ${TENANT}):`);
  console.log(`  ${PEOPLE.length + EXTRA.length + 1} người chơi (bd:customer:1 chưa chấm trình — để tự làm form)`);
  console.log(`  Giải 1 "${t1.t.name}": ${t1.result.placements.length} đội, vô địch ${champion.players.map((p) => p.name).join(' + ')}, ${t1.result.ratingChanges.length} người đổi điểm`);
  console.log(`  Giải 2 "${t2.t.name}": ${t2.result.placements.length} người, ${t2.result.rankingPoints.length} kết quả điểm BXH`);
  console.log(`  Giải 3 "${open.name}": đang mở, ${registered} người đủ điều kiện đã đăng ký — sẵn sàng bốc thăm`);
  console.log(`  Giải "${rr.name}": 3 lượt đã đánh, lượt 4 đang đánh ở Sân 4 (${rrState.current.join('–')})`);
  console.log(`  Giải "${fixed.name}": 6 cặp / 2 bảng, lượt 1 đã đánh — thử "Gọi trận kế tiếp"`);
  console.log(`  Giải "${onsite.name}": 6 người đăng ký, 4 người đã điểm danh — thử điểm danh rồi bốc thăm`);
  console.log(`  Buổi giao lưu "${past.s.name}": đã đóng, ${closed.result.completedMatches} trận có tỉ số, ${closed.result.unscoredMatches} trận không tỉ số, ${closed.result.ratingChanges.length} người đổi điểm (hệ số 0.5)`);
  console.log(`  Buổi giao lưu "${live.s.name}": đang diễn ra, ${live.playing.size} sân đang đánh (tỉ số dở: ${liveScores.join(', ')}) — xem /v1/sessions/${live.s.id}/board`);
  console.log(`  Trang công khai: "${onlineFixed.name}" (còn 2/10 chỗ, 2 cặp đăng ký online), "${onlineSingles.name}" (còn 3/8 chỗ), buổi "${soon.name}" (${signedUp.length}/12 đã đăng ký)`);
  await sequelize.close();
};

main().catch((err) => {
  console.error(`[seed-demo] ${err.message}`);
  process.exit(1);
});
