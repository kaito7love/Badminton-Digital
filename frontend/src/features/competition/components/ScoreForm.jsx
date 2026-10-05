import React, { useState } from 'react';
import { Button, Notice } from './ui';
import { buildResultBody, OUTCOME_HINT } from '../lib/score';
import { teamText } from '../lib/format';

// Ô nhập tỉ số tay (trận giải / giao lưu). Trận giải (`outcomes`) có thêm:
//  - "Bỏ cuộc giữa trận" (không đánh tiếp được): nhập các game ĐÃ xong, chọn đội thắng;
//  - "W.O." (đội vắng / không thi đấu): không có tỉ số, chọn đội thắng.
// Phát hiện lỗi luật điểm là việc của service (trả mã SCORE_INVALID kèm câu giải thích) — form chỉ chặn nhập thiếu.

export default function ScoreForm({ match, outcomes = false, busy = false, error = null, onSubmit, onCancel, submitLabel = 'Lưu kết quả' }) {
  const n = match.scoring?.bestOf || 1;
  const [games, setGames] = useState(() => Array.from({ length: n }, () => ['', '']));
  const [outcome, setOutcome] = useState('normal');
  const [winner, setWinner] = useState('A');
  const [localError, setLocalError] = useState('');

  const setCell = (i, j, value) => setGames((g) => g.map((row, k) => (k === i ? (j === 0 ? [value, row[1]] : [row[0], value]) : row)));

  const submit = (e) => {
    e.preventDefault();
    const result = buildResultBody({ games, outcome, winner });
    if (result.error) { setLocalError(result.error); return; }
    setLocalError('');
    onSubmit(result.body, outcome);
  };

  const cell = 'w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-base font-bold tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-white';

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60" aria-label="Nhập tỉ số">
      {outcomes && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Kết quả
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="normal">Đánh hết trận</option>
              <option value="retired">Bỏ cuộc giữa trận — không đánh tiếp được</option>
              <option value="walkover">W.O. — vắng / không thi đấu</option>
            </select>
          </label>
          {outcome !== 'normal' && (
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Đội thắng
              <select value={winner} onChange={(e) => setWinner(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="A">{teamText(match.teamA) || 'Đội A'}</option>
                <option value="B">{teamText(match.teamB) || 'Đội B'}</option>
              </select>
            </label>
          )}
        </div>
      )}
      {OUTCOME_HINT[outcome] && <p className="text-xs text-slate-500 dark:text-slate-400">{OUTCOME_HINT[outcome]}</p>}

      {outcome !== 'walkover' && (
        <div className="space-y-2">
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span />
            <span className="truncate">{teamText(match.teamA) || 'Đội A'}</span>
            <span className="truncate">{teamText(match.teamB) || 'Đội B'}</span>
          </div>
          {games.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-8 text-xs font-bold text-slate-500">G{i + 1}</span>
              <input type="number" inputMode="numeric" min="0" max="99" className={cell} value={row[0]} onChange={(e) => setCell(i, 0, e.target.value)} aria-label={`Game ${i + 1} đội A`} autoFocus={i === 0} />
              <span className="font-bold text-slate-400">–</span>
              <input type="number" inputMode="numeric" min="0" max="99" className={cell} value={row[1]} onChange={(e) => setCell(i, 1, e.target.value)} aria-label={`Game ${i + 1} đội B`} />
            </div>
          ))}
          <p className="text-xs text-slate-500 dark:text-slate-400">{match.scoring?.points} điểm / game, {n} game{match.scoring?.cap ? `, trần ${match.scoring.cap}` : ''}</p>
        </div>
      )}

      {(localError || error) && <Notice error={localError ? null : error} kind="error">{localError}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>{submitLabel}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Thôi</Button>}
      </div>
    </form>
  );
}
