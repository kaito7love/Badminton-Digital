import React, { useState } from 'react';
import { Badge } from '../../../components/UIComponents';
import { calcRows, changeText, DISCIPLINE_LABEL } from '../lib/rating';
import { fmtDate, fmtNumber } from '../lib/format';
import { EmptyState } from './ui';

// Sổ điểm của một người chơi (nhân viên + khách): mỗi dòng nói được vì sao điểm đổi; dòng sau thi đấu có "Chi tiết từng trận" (E, K, kết quả).

function HistoryRow({ c }) {
  const [open, setOpen] = useState(false);
  const rows = calcRows(c);
  return (
    <li className="border-t border-slate-100 py-2 text-sm dark:border-slate-800" data-change={c.id}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <small className="w-24 text-slate-500">{fmtDate(c.createdAt)}</small>
        <Badge>{DISCIPLINE_LABEL[c.discipline]}</Badge>
        <span className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-white">{changeText(c)}</span>
        {rows.length > 0 && <button type="button" className="text-xs font-bold text-emerald-600 hover:underline" onClick={() => setOpen(!open)}>{open ? 'Ẩn chi tiết' : 'Chi tiết từng trận'}</button>}
      </div>
      {c.note && <p className="mt-0.5 text-xs text-slate-500">Lý do: {c.note}</p>}
      {open && (
        <table className="mt-2 w-full text-left text-xs">
          <thead><tr className="text-slate-500"><th className="pr-3">Kết quả</th><th className="pr-3">Kỳ vọng (E)</th><th className="pr-3">Hệ số K</th><th className="pr-3">Hệ số trận</th><th>Điểm</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.matchId} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-3">{m.S >= 1 ? 'Thắng' : m.S <= 0 ? 'Thua' : fmtNumber(m.S)}</td>
                <td className="pr-3 tabular-nums">{fmtNumber(m.E)}</td>
                <td className="pr-3 tabular-nums">{fmtNumber(m.K)}</td>
                <td className="pr-3 tabular-nums">{fmtNumber(m.m)} × {fmtNumber(m.w)}</td>
                <td className="tabular-nums font-bold">{m.delta > 0 ? '+' : ''}{fmtNumber(m.delta, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}

/** Danh sách sổ điểm, mới nhất trước. `items` = `GET /players/:id/rating-history`. */
export default function RatingHistoryList({ items }) {
  if (!items.length) return <EmptyState>Chưa có thay đổi điểm nào.</EmptyState>;
  return <ul data-testid="history">{[...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((c) => <HistoryRow key={c.id} c={c} />)}</ul>;
}
