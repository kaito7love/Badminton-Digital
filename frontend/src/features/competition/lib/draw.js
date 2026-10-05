// Bốc thăm / khoá sơ đồ: các phép đổi chỗ khi xem trước — hàm thuần, có test (07: "bấm hai đội để đổi chỗ", "bấm hai người để đổi đồng đội").

/** Trạng thái chỉnh sửa từ bản xem trước `POST /tournaments/:id/draw/preview`. */
export const initDraw = (p) => ({
  teams: p.teams.map((x) => ({ players: x.players.map((y) => ({ ...y })) })),
  groups: (p.groups || []).map((g) => ({ groupNo: g.groupNo, teams: [...g.teams] })),
  bracket: p.bracket ? [...p.bracket] : null,
  waiting: (p.waitlist || []).map((w) => ({ id: w.playerId, name: w.name, reason: w.reason })),
  moved: false
});

const swapIndex = (list, i, j) => list.map((x) => (x === i ? j : x === j ? i : x));

/** Đổi chỗ cả đội i ↔ j: ở mọi bảng và / hoặc mọi ô sơ đồ (không tách cặp). */
export const swapTeams = (st, i, j) => ({
  ...st,
  groups: st.groups.map((g) => ({ ...g, teams: swapIndex(g.teams, i, j) })),
  bracket: st.bracket ? swapIndex(st.bracket, i, j) : null,
  moved: true
});

const parseLoc = (loc) => {
  const [kind, a, b] = loc.split(':');
  return { kind, a: Number(a), b: Number(b) };
};
const normPlayer = (x, toWaiting) => (toWaiting ? { id: x.id, name: x.name } : { id: x.id, name: x.name, gender: x.gender, pairingRating: x.pairingRating ?? 0 });

/**
 * Đổi chỗ hai người (bốc thăm ghép cặp): loc = `t:<đội>:<vị trí>` hoặc `w:<thứ tự trong danh sách chờ>`.
 * Người vào danh sách chờ chỉ giữ id + tên; người vào đội mang đủ giới tính / điểm.
 */
export const swapPeople = (st, locA, locB) => {
  const A = parseLoc(locA);
  const B = parseLoc(locB);
  const teams = st.teams.map((t) => ({ players: [...t.players] }));
  const waiting = [...st.waiting];
  const get = (L) => (L.kind === 't' ? teams[L.a].players[L.b] : waiting[L.a]);
  const put = (L, value) => { if (L.kind === 't') teams[L.a].players[L.b] = normPlayer(value, false); else waiting[L.a] = normPlayer(value, true); };
  const a = get(A);
  const b = get(B);
  put(A, b);
  put(B, a);
  return { ...st, teams, waiting, moved: true };
};

export const avgRating = (players) => (players.length ? players.reduce((s, x) => s + (x.pairingRating || 0), 0) / players.length : 0);

/** Body POST /tournaments/:id/draw. */
export const buildDrawBody = (p, st) => ({
  seed: p.seed,
  teams: st.teams.map((x) => ({ players: x.players.map((y) => y.id) })),
  groups: st.groups,
  bracket: st.bracket
});

// ---- Khoá sơ đồ loại trực tiếp từ vòng bảng ----

/** Hai đội cùng bảng gặp nhau ngay vòng 1 (số thứ tự trận, từ 1). */
export const sameGroupPairs = (teamsById, positions) => {
  const out = [];
  for (let m = 0; m < positions.length / 2; m += 1) {
    const x = teamsById[positions[2 * m]];
    const y = teamsById[positions[2 * m + 1]];
    if (x && y && x.groupNo === y.groupNo) out.push(m + 1);
  }
  return out;
};

/** Vòng 1 dựng từ vị trí (id đội | null = miễn đấu) — đưa thẳng cho BracketView ở chế độ `pick`. */
export const knockoutRounds = (teamsById, positions) => {
  const team = (id) => {
    const x = id ? teamsById[id] : null;
    return x ? { players: x.players, tag: `${x.groupRank === 1 ? 'nhất' : 'nhì'} bảng ${x.groupNo}` } : null;
  };
  const matches = Array.from({ length: positions.length / 2 }, (_, m) => ({
    id: `p${m}`, roundNo: 1, bracketPos: m + 1, label: '', status: 'scheduled', games: [], teamA: team(positions[2 * m]), teamB: team(positions[2 * m + 1])
  }));
  return [{ roundNo: 1, matches }];
};

/** Đổi hai ô của sơ đồ (chỉ số ô vòng 1). */
export const swapCells = (positions, i, j) => {
  const next = [...positions];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};
