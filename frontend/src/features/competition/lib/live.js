// Tỉ số trực tiếp (plan 19): hàm thuần dùng cho thẻ sân, bảng điểm TV, màn hình bấm điểm.

/**
 * Luồng SSE và dữ liệu tải về có thể đến lệch nhau → luôn giữ bản có `revision` mới nhất.
 * Trả về bản nên hiển thị (có thể chính là `known`).
 */
export const pickNewest = (known, incoming) => {
  if (!incoming) return known || null;
  if (known && known.revision >= incoming.revision) return known;
  return incoming;
};

export const serveText = (live) => (live && live.server ? `Đội ${live.server} giao · ô ${live.serveFrom === 'right' ? 'phải' : 'trái'}` : '');

/** Dữ liệu để vẽ bảng điểm của một trận: mỗi đội một hàng, mỗi game đã xong một cột, game đang đánh là ô to. */
export const boardRows = (match, live) => {
  const multi = (match.scoring?.bestOf || 1) > 1;
  const prev = live.decided ? live.games.slice(0, -1) : live.games;
  const cur = live.decided ? live.games[live.games.length - 1] : live.current;
  const curNo = live.decided ? live.games.length : live.gameNo;
  const rows = ['A', 'B'].map((side, i) => ({
    side,
    team: i ? match.teamB : match.teamA,
    games: prev.map((g) => ({ points: g[i], won: g[i] > g[1 - i] })),
    current: cur[i],
    serving: !live.decided && live.server === side,
    winner: Boolean(live.decided && live.winnerSide === side)
  }));
  const sets = multi ? `Ván ${live.gamesWon[0]}–${live.gamesWon[1]} · ` : '';
  const meta = live.decided
    ? `${sets}Xong trận — chờ xác nhận`
    : `${sets}Game ${live.gameNo}${multi ? `/${match.scoring.bestOf}` : ''} · giao ô ${live.serveFrom === 'right' ? 'phải' : 'trái'}`;
  return { multi, rows, previous: prev.length, currentNo: curNo, meta };
};

/** Gom các thay đổi `score` / `snapshot` vào một Map matchId → live, giữ bản mới nhất. */
export const mergeLive = (map, matchId, live) => {
  const next = new Map(map);
  const picked = pickNewest(map.get(matchId), live);
  if (picked) next.set(matchId, picked);
  return next;
};
