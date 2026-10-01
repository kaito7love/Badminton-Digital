const http = require('http');
const { createTestContext, STAFF, MANAGER } = require('./helpers');

// Bấm điểm trực tiếp + luồng SSE cho màn hình TV (plan 19, docs/06 mục 1.5) bằng API thật:
// nhân viên bấm hết trận rồi xác nhận, không cộng trùng, hoàn tác, chịu tải, người chơi trong
// trận bấm / xác nhận theo cờ "tính điểm", trận giải 3 game, luồng snapshot → score → board.
jest.setTimeout(180000);

const SESSION = 'session:read session:operate';
const TOUR = 'tournament:read tournament:operate tournament:manage';
let ctx;
let manager;
let op;
let other;
let reader;
let server;
let port;

beforeAll(async () => {
  ctx = await createTestContext({ env: { SSE_HEARTBEAT_MS: '300' } });
  manager = await ctx.as({ scope: `${MANAGER} ${SESSION} ${TOUR}`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  op = await ctx.as({ scope: `${STAFF} ${SESSION}`, sub: 'bd:user:op', org: ['bd:branch:1'] });
  other = await ctx.as({ scope: `${STAFF} ${SESSION}`, sub: 'bd:user:other', org: ['bd:branch:2'] });
  reader = await ctx.as({ scope: 'session:read', sub: 'bd:device:tv', org: ['bd:branch:1'] });
  server = ctx.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  ({ port } = server.address());
});
afterAll(async () => {
  ctx.built.sse.closeAll();
  await new Promise((resolve) => server.close(resolve));
  await ctx.close();
});

let seq = 0;
const newPlayer = async (rating, discipline = 'doubles', gender) => {
  seq += 1;
  const ref = `bd:customer:live${seq}`;
  const res = await manager.put(`/v1/players/by-ref/${ref}`).send({ displayName: `Người bấm ${seq}` });
  const id = res.body.data.id;
  if (gender) await manager.patch(`/v1/players/${id}`).send({ gender });
  await manager.post(`/v1/players/${id}/rating-adjustments`).send({ discipline, newRating: rating, reason: 'Dữ liệu test bấm điểm' });
  return { id, ref };
};
// Token "chỉ bấm điểm" của khách hàng (gateway cấp khi người chơi mở màn hình bấm điểm).
const asPlayer = (p) => ctx.as({ scope: 'match:score rating:self ranking:read', sub: `bd:user:${p.ref}`, org: [], player: p.ref, name: 'Khách' });

// Buổi giao lưu đang đánh: `players` người, `courts` sân, xếp sân luôn.
const liveSession = async ({ players = 8, courts = ['c1', 'c2'], rated = false } = {}) => {
  const s = (await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: `Bấm điểm ${seq}`, courtRefs: courts, rated })).body.data;
  const people = [];
  for (let i = 0; i < players; i += 1) {
    const p = await newPlayer(2.5 + (i % 5) * 0.3);
    people.push(p);
    expect((await op.post(`/v1/sessions/${s.id}/players`).send({ playerId: p.id })).status).toBe(201);
  }
  const fill = await op.post(`/v1/sessions/${s.id}/fill-courts`).send({});
  expect(fill.status).toBe(201);
  return { s, people, matches: fill.body.data.matches };
};
const rally = (client, matchId, side, revision) => client.post(`/v1/matches/${matchId}/live/rallies`).send({ side, revision });
const getLive = async (client, matchId) => (await client.get(`/v1/matches/${matchId}/live`)).body.data;
// Bấm lần lượt một chuỗi pha cầu; trả tỉ số cuối.
const play = async (client, matchId, rallies) => {
  let live = await getLive(client, matchId);
  for (const side of rallies) {
    const res = await rally(client, matchId, side, live.revision);
    expect(res.status).toBe(200);
    live = res.body.data;
  }
  return live;
};
const game = (a, b) => {
  const [w, l, W, L] = a > b ? [a, b, 'A', 'B'] : [b, a, 'B', 'A'];
  return (W + L).repeat(l) + W.repeat(w - l);
};
const sideOf = (m, p) => (m.teamA.players.some((x) => x.id === p.id) ? 'A' : m.teamB.players.some((x) => x.id === p.id) ? 'B' : null);

// Đọc luồng SSE qua HTTP thật.
const openStream = (path, token) =>
  new Promise((resolve, reject) => {
    const headers = { Accept: 'text/event-stream' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      const s = { status: res.statusCode, headers: res.headers, events: [], body: '', ended: false };
      const waiters = new Set();
      const wake = () => waiters.forEach((w) => w());
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (res.statusCode !== 200) {
          s.body += chunk;
          return;
        }
        buf += chunk;
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = { event: null, data: null, at: Date.now() };
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) ev.event = line.slice(7);
            else if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
          }
          if (ev.event) s.events.push(ev);
        }
        wake();
      });
      res.on('end', () => {
        s.ended = true;
        wake();
      });
      s.waitFor = (pred, timeoutMs = 5000) =>
        new Promise((ok, fail) => {
          const check = () => {
            const hit = s.events.find(pred);
            if (hit) {
              waiters.delete(check);
              clearTimeout(timer);
              ok(hit);
            }
          };
          const timer = setTimeout(() => {
            waiters.delete(check);
            fail(new Error(`Không thấy sự kiện mong đợi trong ${timeoutMs} ms; đã nhận: ${s.events.map((e) => e.event).join(', ')}`));
          }, timeoutMs);
          waiters.add(check);
          check();
        });
      s.waitEnd = (timeoutMs = 8000) =>
        new Promise((ok, fail) => {
          if (s.ended) return ok();
          const timer = setTimeout(() => fail(new Error('Luồng chưa đóng')), timeoutMs);
          res.on('end', () => {
            clearTimeout(timer);
            ok();
          });
          return undefined;
        });
      s.close = () => req.destroy();
      resolve(s);
    });
    req.on('error', reject);
  });

describe('nhân viên bấm điểm một trận giao lưu', () => {
  test('bấm hết trận → xác nhận → kết quả đúng tỉ số đã bấm; sân được nhả; màn hình lớn có tỉ số', async () => {
    const { s, matches } = await liveSession({ players: 10 });
    const m = matches.find((x) => x.courtRef === 'c1');
    let board = (await reader.get(`/v1/sessions/${s.id}/board`)).body.data;
    expect(board.courts.find((c) => c.courtRef === 'c1').match.live).toBeNull();
    expect(await getLive(op, m.id)).toMatchObject({ revision: 0, rallies: '', current: [0, 0], server: 'A', serveFrom: 'right', decided: false });

    const served = (await op.put(`/v1/matches/${m.id}/live/server`).send({ firstServer: 'B', revision: 0 })).body.data;
    expect(served).toMatchObject({ revision: 1, firstServer: 'B', server: 'B' });
    let live = await play(op, m.id, 'BBA');
    expect(live).toMatchObject({ revision: 4, rallies: 'BBA', current: [1, 2], server: 'A', serveFrom: 'left' });
    board = (await reader.get(`/v1/sessions/${s.id}/board`)).body.data;
    expect(board.courts.find((c) => c.courtRef === 'c1').match.live).toMatchObject({ current: [1, 2], revision: 4 });

    // Từ 1–2 bấm tiếp tới 21–17 (16–17 rồi A ghi 5 điểm liền).
    live = await play(op, m.id, 'AB'.repeat(15) + 'A'.repeat(5));
    expect(live).toMatchObject({ decided: true, winnerSide: 'A', games: [[21, 17]], current: null, server: null });
    const extra = await rally(op, m.id, 'B', live.revision);
    expect([extra.status, extra.body.code]).toEqual([409, 'MATCH_DECIDED']);

    const stale = await op.post(`/v1/matches/${m.id}/live/confirm`).send({ revision: live.revision - 1 });
    expect([stale.status, stale.body.code]).toEqual([409, 'LIVE_CONFLICT']);
    const done = await op.post(`/v1/matches/${m.id}/live/confirm`).send({ revision: live.revision });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'completed', games: [[21, 17]], outcome: 'normal', winnerSide: 'A' });
    expect(done.body.data.live).toMatchObject({ decided: true, games: [[21, 17]] });

    board = (await reader.get(`/v1/sessions/${s.id}/board`)).body.data;
    expect(board.courts.find((c) => c.courtRef === 'c1')).toMatchObject({ status: 'free', match: null });
    expect(board.upcoming.map((u) => u.courtRef)).toEqual(['c1']);
    expect(board.recent[0]).toMatchObject({ id: m.id, games: [[21, 17]] });

    const event = await ctx.models.OutboxEvent.findOne({ where: { type: 'competition.match.completed', aggregateId: s.id } });
    expect(event.payload.data).toMatchObject({ matchId: m.id, games: [[21, 17]], winnerSide: 'A' });
    const audit = await ctx.models.AuditLog.findOne({ where: { targetId: m.id, action: 'match.result_recorded' } });
    expect(audit.after).toMatchObject({ via: 'live', games: [[21, 17]] });
    const again = await op.post(`/v1/matches/${m.id}/live/confirm`).send({ revision: live.revision });
    expect([again.status, again.body.code]).toEqual([409, 'INVALID_STATE']);
  });

  test('hai lần bấm cùng phiên bản (bấm đúp / hai máy) → một lần 409 LIVE_CONFLICT, tỉ số chỉ cộng 1', async () => {
    const { matches } = await liveSession();
    const m = matches[0];
    await play(op, m.id, 'AB');
    const [r1, r2] = await Promise.all([rally(op, m.id, 'A', 2), rally(manager, m.id, 'A', 2)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect([r1, r2].find((r) => r.status === 409).body.code).toBe('LIVE_CONFLICT');
    expect(await getLive(op, m.id)).toMatchObject({ revision: 3, rallies: 'ABA' });
  });

  test('hoàn tác; chưa có điểm → 409 NOTHING_TO_UNDO; đổi đội giao sau điểm đầu → 409 RALLIES_STARTED', async () => {
    const { matches } = await liveSession();
    const m = matches[0];
    const empty = await op.post(`/v1/matches/${m.id}/live/undo`).send({ revision: 0 });
    expect([empty.status, empty.body.code]).toEqual([409, 'NOTHING_TO_UNDO']);
    let live = await play(op, m.id, 'AAB');
    const late = await op.put(`/v1/matches/${m.id}/live/server`).send({ firstServer: 'B', revision: live.revision });
    expect([late.status, late.body.code]).toEqual([409, 'RALLIES_STARTED']);
    live = (await op.post(`/v1/matches/${m.id}/live/undo`).send({ revision: live.revision })).body.data;
    expect(live).toMatchObject({ rallies: 'AA', current: [2, 0], revision: 4, server: 'A' });
    const early = await op.post(`/v1/matches/${m.id}/live/confirm`).send({ revision: live.revision });
    expect([early.status, early.body.code]).toEqual([409, 'MATCH_NOT_DECIDED']);
  });

  test('nhập tỉ số tay giữa chừng → bấm tiếp bị chặn; trận đã có kết quả không xác nhận lại', async () => {
    const { matches } = await liveSession();
    const m = matches[0];
    const live = await play(op, m.id, 'ABAB');
    const fresh = (await op.get(`/v1/matches/${m.id}`)).body.data;
    expect((await op.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${fresh.version}"`).send({ games: [[21, 9]] })).status).toBe(200);
    const after = await rally(op, m.id, 'A', live.revision);
    expect([after.status, after.body.code]).toEqual([409, 'INVALID_STATE']);
  });
});

describe('chịu tải: 3 sân bấm dồn dập song song, cùng lúc xếp sân và điểm danh', () => {
  test('không lỗi 5xx, không deadlock; tỉ số cuối đúng bằng số lần bấm thành công', async () => {
    const { s, matches } = await liveSession({ players: 12, courts: ['c1', 'c2', 'c3'] });
    expect(matches).toHaveLength(3);
    const statuses = [];
    const success = new Map(matches.map((m) => [m.id, 0]));
    // 3 "máy" cùng bấm mỗi trận, mỗi máy 6 điểm thành công; gặp 409 thì đọc lại rồi bấm tiếp.
    const device = async (client, m, n) => {
      for (let done = 0; done < n; ) {
        const { revision } = await getLive(client, m.id);
        const res = await rally(client, m.id, Math.random() < 0.5 ? 'A' : 'B', revision);
        statuses.push(res.status);
        if (res.status === 200) {
          done += 1;
          success.set(m.id, success.get(m.id) + 1);
        } else expect(res.body.code).toBe('LIVE_CONFLICT');
      }
    };
    const extra = [];
    for (let i = 0; i < 4; i += 1) extra.push(await newPlayer(3));
    const noise = async () => {
      for (const p of extra) {
        statuses.push((await op.post(`/v1/sessions/${s.id}/players`).send({ playerId: p.id })).status);
        statuses.push((await op.post(`/v1/sessions/${s.id}/fill-courts`).send({})).status); // không có sân trống → 422
        statuses.push((await reader.get(`/v1/sessions/${s.id}/board`)).status);
      }
    };
    await Promise.all([...matches.flatMap((m) => [device(op, m, 6), device(manager, m, 6), device(op, m, 6)]), noise()]);
    expect(statuses.filter((x) => x >= 500)).toEqual([]);
    for (const m of matches) {
      const live = await getLive(op, m.id);
      expect(success.get(m.id)).toBe(18);
      expect(live.rallies).toHaveLength(18);
      expect(live.current[0] + live.current[1]).toBe(18);
    }
    expect(statuses.filter((x) => x === 409).length).toBeGreaterThan(0); // có tranh chấp thật
  });
});

describe('người chơi trong trận bấm điểm trên điện thoại (match:score)', () => {
  test('bấm được trận mình; người ngoài trận → 403; chi nhánh khác → 404; TV chỉ đọc → 403', async () => {
    const { s, people, matches } = await liveSession();
    const m = matches[0];
    const inMatch = people.find((p) => sideOf(m, p));
    const outsider = people.find((p) => !sideOf(m, p) && !sideOf(matches[1], p)) || (await newPlayer(3));
    const me = await asPlayer(inMatch);
    const res = await rally(me, m.id, sideOf(m, inMatch), 0);
    expect(res.status).toBe(200);
    expect((await me.get(`/v1/matches/${m.id}`)).body.data).toMatchObject({ id: m.id, live: { revision: 1 } });
    expect((await me.get(`/v1/matches/${m.id}/live`)).status).toBe(200);
    expect((await me.get(`/v1/sessions/${s.id}/board`)).status).toBe(403); // không có quyền xem buổi

    const stranger = await asPlayer(outsider);
    const denied = await rally(stranger, m.id, 'A', 1);
    expect([denied.status, denied.body.code]).toEqual([403, 'NOT_A_PARTICIPANT']);
    expect((await stranger.get(`/v1/matches/${m.id}`)).status).toBe(403);
    expect((await rally(other, m.id, 'A', 1)).status).toBe(404);
    const tv = await rally(reader, m.id, 'A', 1);
    expect([tv.status, tv.body.code]).toEqual([403, 'FORBIDDEN_SCOPE']);
  });

  test('trận KHÔNG tính điểm: người chơi tự xác nhận được', async () => {
    const { people, matches } = await liveSession({ rated: false });
    const m = matches[0];
    const me = await asPlayer(people.find((p) => sideOf(m, p)));
    const live = await play(me, m.id, game(15, 21));
    const done = await me.post(`/v1/matches/${m.id}/live/confirm`).send({ revision: live.revision });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'completed', games: [[15, 21]], winnerSide: 'B' });
  });

  test('trận TÍNH điểm: người chơi bấm được nhưng xác nhận → 403 CONFIRM_REQUIRES_STAFF; nhân viên xác nhận được', async () => {
    const { people, matches } = await liveSession({ rated: true });
    const m = matches[0];
    const me = await asPlayer(people.find((p) => sideOf(m, p)));
    const live = await play(me, m.id, game(21, 18));
    const mine = await me.post(`/v1/matches/${m.id}/live/confirm`).send({ revision: live.revision });
    expect([mine.status, mine.body.code]).toEqual([403, 'CONFIRM_REQUIRES_STAFF']);
    const staff = await op.post(`/v1/matches/${m.id}/live/confirm`).send({ revision: live.revision });
    expect(staff.status).toBe(200);
    expect(staff.body.data).toMatchObject({ status: 'completed', games: [[21, 18]] });
  });
});

describe('trận giải', () => {
  test('bấm 3 game (2–1) → xác nhận → người thắng vào chung kết; phát competition.match.completed', async () => {
    const t = (await manager.post('/v1/tournaments').send({
      organizerRef: 'bd:branch:1', name: `Giải bấm điểm ${seq}`, startsOn: '2026-11-20', tier: 'club', discipline: 'singles',
      genderRule: 'men', format: 'knockout', scoring: '3x21'
    })).body.data;
    await manager.post(`/v1/tournaments/${t.id}/open`).send();
    for (const r of [3.9, 3.6, 3.3, 3.0]) {
      const p = await newPlayer(r, 'singles', 'male');
      expect((await manager.post(`/v1/tournaments/${t.id}/entries`).send({ playerId: p.id })).status).toBe(201);
    }
    const preview = (await manager.post(`/v1/tournaments/${t.id}/draw/preview`, { key: false }).send({ seed: 'live' })).body.data;
    expect((await manager.post(`/v1/tournaments/${t.id}/draw`).send({ seed: preview.seed, teams: preview.teams.map((x) => ({ players: x.players.map((y) => y.id) })), groups: preview.groups, bracket: preview.bracket })).status).toBe(200);
    const list = (await manager.get(`/v1/tournaments/${t.id}/matches`)).body.data.items;
    const semi = list.find((m) => m.status === 'scheduled' && m.teamA && m.teamB);
    const scheduled = await rally(manager, semi.id, 'A', 0);
    expect([scheduled.status, scheduled.body.code]).toEqual([409, 'INVALID_STATE']); // chưa gọi ra sân
    expect((await manager.post(`/v1/matches/${semi.id}/call`).send({ courtRef: 'c1' })).status).toBe(200);

    const stream = await openStream(`/v1/tournaments/${t.id}/stream`, await ctx.token({ scope: 'tournament:read', org: ['bd:branch:1'], ttl: 60 }));
    expect(stream.status).toBe(200);
    await stream.waitFor((e) => e.event === 'snapshot');
    const live = await play(manager, semi.id, game(21, 15) + game(18, 21) + game(21, 19));
    expect(live).toMatchObject({ decided: true, winnerSide: 'A', gamesWon: [2, 1], gameNo: 3 });
    await stream.waitFor((e) => e.event === 'score' && e.data.matchId === semi.id && e.data.live.revision === live.revision);
    const done = await manager.post(`/v1/matches/${semi.id}/live/confirm`).send({ revision: live.revision });
    expect(done.body.data).toMatchObject({ status: 'completed', games: [[21, 15], [18, 21], [21, 19]], winnerSide: 'A' });
    await stream.waitFor((e) => e.event === 'board');
    stream.close();
    const final = (await manager.get(`/v1/matches/${semi.nextMatchId}`)).body.data;
    const winner = semi.teamA.players[0].id;
    expect([...(final.teamA ? final.teamA.players : []), ...(final.teamB ? final.teamB.players : [])].map((p) => p.id)).toContain(winner);
    const event = await ctx.models.OutboxEvent.findOne({ where: { type: 'competition.match.completed', aggregateId: t.id } });
    expect(event.payload.data).toMatchObject({ matchId: semi.id, games: [[21, 15], [18, 21], [21, 19]] });
  });
});

describe('luồng SSE cho màn hình TV', () => {
  test('snapshot khi kết nối → score ngay khi bấm → board khi xác nhận; ping định kỳ', async () => {
    const { s, matches } = await liveSession();
    const [m1, m2] = matches;
    await play(op, m1.id, 'AAB');
    const tv = await openStream(`/v1/sessions/${s.id}/stream`, await ctx.token({ scope: 'session:read', org: ['bd:branch:1'], ttl: 120 }));
    expect(tv.status).toBe(200);
    expect(tv.headers['content-type']).toMatch(/^text\/event-stream/);
    const snap = await tv.waitFor((e) => e.event === 'snapshot');
    expect(snap.data.matches).toEqual([{ matchId: m1.id, courtRef: m1.courtRef, live: expect.objectContaining({ rallies: 'AAB', current: [2, 1] }) }]);

    const sentAt = Date.now();
    const res = await rally(op, m2.id, 'B', 0);
    expect(res.status).toBe(200);
    const ev = await tv.waitFor((e) => e.event === 'score' && e.data.matchId === m2.id);
    expect(ev.data).toMatchObject({ courtRef: m2.courtRef, live: { revision: 1, current: [0, 1], server: 'B' } });
    const latencyMs = ev.at - sentAt;
    expect(latencyMs).toBeLessThan(1000);

    const live = await play(op, m1.id, game(21, 10).slice(3));
    await op.post(`/v1/matches/${m1.id}/live/confirm`).send({ revision: live.revision });
    const board = await tv.waitFor((e) => e.event === 'board');
    expect(board.data).toEqual({ reason: 'result' });
    // Một thao tác đi qua nhiều hook (ghi kết quả → nhả sân → trả người về hàng chờ) chỉ phát MỘT `board`.
    await new Promise((r) => setTimeout(r, 300));
    expect(tv.events.filter((e) => e.event === 'board')).toHaveLength(1);
    await tv.waitFor((e) => e.event === 'ping', 2000);
    // Điểm danh / xếp sân cũng báo màn hình lớn tải lại.
    const p = await newPlayer(3);
    await op.post(`/v1/sessions/${s.id}/players`).send({ playerId: p.id });
    await tv.waitFor((e) => e.event === 'board' && e.data.reason === 'checked_in');
    tv.close();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ sseLatencyMs: latencyMs }));
  });

  test('token hết hạn → service đóng luồng (client tự nối lại bằng token mới); tắt service đóng mọi luồng', async () => {
    const { s } = await liveSession();
    const short = await openStream(`/v1/sessions/${s.id}/stream`, await ctx.token({ scope: 'session:read', org: ['bd:branch:1'], ttl: 2 }));
    expect(short.status).toBe(200);
    const opened = Date.now();
    await short.waitEnd(6000);
    expect(Date.now() - opened).toBeLessThan(4000);

    const long = await openStream(`/v1/sessions/${s.id}/stream`, await ctx.token({ scope: 'session:read', org: ['bd:branch:1'], ttl: 120 }));
    await long.waitFor((e) => e.event === 'snapshot');
    expect(ctx.built.sse.size()).toBe(1);
    ctx.built.sse.closeAll();
    await long.waitEnd(2000);
    expect(ctx.built.sse.size()).toBe(0);
    expect(ctx.built.platform.realtime.listenerCount()).toBe(0);
  });

  test('thiếu token → 401; thiếu scope → 403; chi nhánh khác → 404 (trả JSON, không mở luồng)', async () => {
    const { s } = await liveSession();
    const none = await openStream(`/v1/sessions/${s.id}/stream`, null);
    expect(none.status).toBe(401);
    const noScope = await openStream(`/v1/sessions/${s.id}/stream`, await ctx.token({ scope: 'ranking:read', org: ['bd:branch:1'] }));
    expect([noScope.status, JSON.parse(noScope.body).code]).toEqual([403, 'FORBIDDEN_SCOPE']);
    const otherOrg = await openStream(`/v1/sessions/${s.id}/stream`, await ctx.token({ scope: 'session:read', org: ['bd:branch:2'] }));
    expect(otherOrg.status).toBe(404);
    expect(ctx.built.platform.realtime.listenerCount()).toBe(0);
  });
});
