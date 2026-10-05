// Nhập tỉ số tay (07: "Nhập tỉ số nhanh"): dựng body cho PUT /matches/:id/result từ các ô nhập.

/**
 * @param inputs { games: [[a,b] dạng chuỗi từ ô nhập], outcome: 'normal'|'retired'|'walkover', winner: 'A'|'B' }
 * @returns { body } hoặc { error } (lỗi người dùng nhập thiếu — service vẫn kiểm luật điểm)
 */
export const buildResultBody = ({ games = [], outcome = 'normal', winner = 'A' }) => {
  const parsed = [];
  if (outcome !== 'walkover') {
    for (const [a, b] of games) {
      const sa = String(a ?? '').trim();
      const sb = String(b ?? '').trim();
      if (sa === '' && sb === '') continue; // game bỏ trống (chưa đánh / đang dở)
      if (sa === '' || sb === '') return { error: 'Mỗi game phải nhập đủ điểm của cả hai đội.' };
      const na = Number(sa);
      const nb = Number(sb);
      if (!Number.isInteger(na) || !Number.isInteger(nb) || na < 0 || nb < 0 || na > 99 || nb > 99) return { error: 'Điểm phải là số nguyên từ 0 đến 99.' };
      parsed.push([na, nb]);
    }
  }
  if (outcome === 'normal') {
    if (!parsed.length) return { error: 'Nhập tỉ số ít nhất một game.' };
    return { body: { games: parsed } };
  }
  if (outcome === 'retired' && !parsed.length) return { error: 'Bỏ cuộc giữa trận: nhập các game ĐÃ xong (nếu chưa xong game nào thì chọn W.O.).' };
  return { body: { games: parsed, outcome, winnerSide: winner } };
};

export const OUTCOME_HINT = {
  normal: '',
  retired: 'Nhập các game ĐÃ XONG (game đang dở bỏ trống). Đội không đánh tiếp được thua; đang ở sơ đồ thì đối thủ đi tiếp.',
  walkover: 'Không có tỉ số. Đội vắng thua; vòng bảng tính thắng đủ game cho đối thủ.'
};

export const RESULT_TOAST = { normal: 'Đã ghi tỉ số', retired: 'Đã ghi: bỏ cuộc giữa trận', walkover: 'Đã ghi W.O.' };
