import React from 'react';
import { Badge } from '../../../../components/UIComponents';
import { Card, EmptyState, TeamNames } from '../../components/ui';
import BracketView from '../../components/BracketView';

// Tab Bảng đấu & sơ đồ: bảng xếp hạng từng bảng + sơ đồ loại trực tiếp dạng hình (plan 21). Bấm một ô của sơ đồ: trận đang đánh → bấm
// điểm; trận khác → nhảy sang tab Lịch & kết quả, lọc đúng nhóm, viền sáng hàng của trận đó.

function Standings({ standings, roundRobin }) {
  if (!standings || !standings.groups.length) return null;
  const many = standings.groups.length > 1;
  return (
    <Card title={roundRobin ? 'Bảng xếp hạng' : 'Xếp hạng vòng bảng'}>
      <div className="grid gap-4 lg:grid-cols-2">
        {standings.groups.map((g) => (
          <div key={g.groupNo} className="overflow-x-auto">
            {many && <b className="mb-1 block text-sm text-slate-900 dark:text-white">Bảng {g.groupNo}</b>}
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-1 pr-2">#</th><th className="py-1 pr-2">Đội</th><th className="py-1 pr-2">Tr</th><th className="py-1 pr-2">T–B</th><th className="py-1 pr-2">HS game</th><th className="py-1">HS điểm</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.team.id || r.rank} className={`border-t border-slate-100 dark:border-slate-800 ${r.team.withdrawn ? 'opacity-50' : ''}`}>
                    <td className="py-1 pr-2 font-bold">{r.rank}</td>
                    <td className="py-1 pr-2"><TeamNames team={r.team} />{r.team.withdrawn && <Badge> đã rút</Badge>}</td>
                    <td className="py-1 pr-2">{r.played}</td>
                    <td className="py-1 pr-2 tabular-nums">{r.wins}–{r.losses}</td>
                    <td className="py-1 pr-2 tabular-nums">{r.gameDiff}</td>
                    <td className="py-1 tabular-nums">{r.pointDiff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function TabBracket({ model, t, onBracketMatch }) {
  const { standings, bracket } = model;
  const rounds = bracket && bracket.rounds ? bracket.rounds : [];
  const hasBracket = rounds.length > 0;
  return (
    <div className="space-y-4">
      {t.format !== 'knockout' && <Standings standings={standings} roundRobin={t.format === 'round_robin'} />}
      {hasBracket && (
        <Card title="Sơ đồ loại trực tiếp">
          <BracketView rounds={rounds} title={t.name} onMatch={onBracketMatch} />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Bấm vào một đội để mở trận đó (đang đánh → bấm điểm; còn lại → mở trong tab Lịch &amp; kết quả).</p>
        </Card>
      )}
      {!hasBracket && t.format === 'groups_knockout' && (
        <EmptyState>Sơ đồ loại trực tiếp có sau khi vòng bảng xong và bấm "Sơ đồ loại trực tiếp…".</EmptyState>
      )}
      {!hasBracket && t.format === 'knockout' && <EmptyState>Chưa có sơ đồ.</EmptyState>}
    </div>
  );
}
