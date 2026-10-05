import React from 'react';
import { Badge } from '../../../../components/UIComponents';
import { Button, Card, TeamNames } from '../../components/ui';
import ScoreForm from '../../components/ScoreForm';
import { courtName, gamesText } from '../../lib/format';
import { OUTCOME } from '../../lib/labels';
import { matchTitle } from '../../lib/tournamentModel';
import { pickNewest, serveText } from '../../lib/live';

// Tab Lịch & kết quả (07 mục 2): lọc Sắp tới / Đang đánh / Đã xong / Tất cả (kèm số trận); mỗi trận một hàng gọn với trạng thái rõ nghĩa.

export const FILTERS = {
  sap: ['Sắp tới', (m) => m.status === 'scheduled'],
  dang: ['Đang đánh', (m) => m.status === 'in_play'],
  xong: ['Đã xong', (m) => m.status === 'completed' || m.status === 'cancelled'],
  all: ['Tất cả', () => true]
};

/** Mặc định: còn trận chưa xong → "Sắp tới", không thì "Tất cả". */
export const defaultFilter = (ms) => (ms.some((m) => m.status === 'scheduled' || m.status === 'in_play') ? 'sap' : 'all');

/** Sắp theo lượt rồi theo bảng — hàm thuần để test. */
export const sortMatches = (list) => [...list].sort((a, b) => (a.slotNo ?? 999) - (b.slotNo ?? 999) || (a.groupNo ?? 0) - (b.groupNo ?? 0));

function Result({ m }) {
  if (m.status === 'ended') return <Badge>xong, không tỉ số</Badge>;
  if (m.status === 'cancelled') return <Badge variant="rose">huỷ</Badge>;
  return (
    <span>
      <b className="tabular-nums">{gamesText(m.games)}</b>
      {m.outcome && m.outcome !== 'normal' && <Badge> {OUTCOME[m.outcome] || m.outcome}</Badge>}
    </span>
  );
}

export default function TabSchedule({ model, perms, view, setView, liveScores, onCall, onScore, onLiveScore, scoreOpen, setScoreOpen, scoreProps, highlight }) {
  const { ms, blocked, blockedText, live } = model;
  const operate = perms.canOperate && live;
  const list = sortMatches(ms.filter(FILTERS[view.lich][1]));

  const state = (m) => {
    if (m.status === 'scheduled') {
      if (!m.teamA || !m.teamB) return <span className="text-slate-400">chờ đội thắng trận trước</span>;
      if (blocked.has(m.id)) return <Badge variant="amber">chờ: {blockedText(m)}</Badge>;
      return <span className="text-slate-400">chưa đánh</span>;
    }
    if (m.status === 'in_play') {
      const lv = pickNewest(m.live, liveScores.get(m.id));
      return (
        <span>
          <Badge variant="amber">đang đánh · {courtName(m.courtRef)}</Badge>
          {lv && <span className="ml-2 text-xs tabular-nums text-slate-600 dark:text-slate-300">{lv.decided ? `${gamesText(lv.games)} — chờ xác nhận` : `${lv.current[0]}–${lv.current[1]}${lv.games.length ? ` (${gamesText(lv.games)})` : ''} · ${serveText(lv)}`}</span>}
        </span>
      );
    }
    return <Result m={m} />;
  };

  const actions = (m) => {
    if (!operate) return null;
    if (m.status === 'scheduled' && m.teamA && m.teamB) {
      return (
        <>
          <Button variant={blocked.has(m.id) ? 'secondary' : 'primary'} className="!px-3 !py-1 !text-xs" onClick={() => onCall(m)}>Gọi ra sân…</Button>
          <Button variant="link" className="!px-2 !py-1 !text-xs" onClick={() => setScoreOpen(m.id)}>Nhập tỉ số</Button>
        </>
      );
    }
    if (m.status === 'in_play') {
      return (
        <>
          {onLiveScore && <Button className="!px-3 !py-1 !text-xs" onClick={() => onLiveScore(m)}>Bấm điểm</Button>}
          <Button variant="link" className="!px-2 !py-1 !text-xs" onClick={() => setScoreOpen(m.id)}>Nhập tỉ số</Button>
        </>
      );
    }
    if (m.status === 'completed') return <Button variant="link" className="!px-2 !py-1 !text-xs" onClick={() => setScoreOpen(m.id)}>Sửa</Button>;
    return null;
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([k, [label, fn]]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView({ ...view, lich: k })}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${view.lich === k ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
          >
            {label} ({ms.filter(fn).length})
          </button>
        ))}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((m) => (
          <div key={m.id} data-match={m.id} className={`grid gap-2 py-3 text-sm sm:grid-cols-[9rem_1fr_auto] sm:items-center ${highlight === m.id ? 'rounded-xl outline outline-2 outline-amber-400' : ''}`}>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <b className="text-slate-800 dark:text-slate-200">{m.slotNo ? `Lượt ${m.slotNo}` : 'Thêm'}</b>{m.expectedTime ? ` · ${m.expectedTime}` : ''}
              <br />{m.stage === 'group' ? `Bảng ${m.groupNo}` : m.label || matchTitle(m)}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 dark:text-white"><TeamNames team={m.teamA} /> <span className="font-normal text-slate-400">vs</span> <TeamNames team={m.teamB} /></div>
              <div className="mt-1 text-xs">{state(m)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1 sm:justify-end">{actions(m)}</div>
            {scoreOpen === m.id && (
              <div className="sm:col-span-3">
                <ScoreForm match={m} outcomes {...scoreProps} onSubmit={(body, outcome) => onScore(m, body, outcome)} onCancel={() => setScoreOpen(null)} />
              </div>
            )}
          </div>
        ))}
        {!list.length && <p className="py-4 text-slate-500">Không có trận nào.</p>}
      </div>
    </Card>
  );
}
