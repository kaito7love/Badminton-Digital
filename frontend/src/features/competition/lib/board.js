import { gamesText, teamText } from './format';

// Màn hình lớn (TV) — hàm thuần: kết quả gần đây, dòng kết quả, đồng hồ.

const ms = (iso) => (iso ? Date.parse(iso) : 0);

/** Các trận xong gần nhất (mới → cũ). */
export const recentResults = (matches, limit = 6) =>
  matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => ms(b.completedAt) - ms(a.completedAt))
    .slice(0, limit);

/** "A thắng B 21–10" · W.O. / bỏ cuộc giữa trận ghi rõ (06 mục 1.4). */
export const resultLine = (m) => {
  const winner = m.winnerSide === 'A' ? m.teamA : m.teamB;
  const loser = m.winnerSide === 'A' ? m.teamB : m.teamA;
  const head = `${teamText(winner) || '—'} thắng ${teamText(loser) || '—'}`;
  if (m.outcome === 'walkover') return `${head} · W.O. (đội kia vắng)`;
  if (m.outcome === 'retired') return `${head} · ${gamesText(m.games)} · đối thủ không đánh tiếp được`;
  return `${head} · ${gamesText(m.games)}`;
};

/** Nhãn ngắn của trận cho TV: "Bảng 2 · lượt 3", "Bán kết". */
export const boardLabel = (m) => {
  if (m.stage === 'group') return `Bảng ${m.groupNo} · lượt ${m.slotNo}`;
  return m.label || (m.roundNo ? `Vòng ${m.roundNo}` : '');
};

/** Giờ hiện trên TV: "14:05". */
export const clockText = (date = new Date()) => date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
