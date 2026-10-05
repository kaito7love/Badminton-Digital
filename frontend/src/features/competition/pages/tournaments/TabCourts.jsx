import React, { useState } from 'react';
import { Badge } from '../../../../components/UIComponents';
import { Button, Card, TeamNames } from '../../components/ui';
import ScoreBoard from '../../components/ScoreBoard';
import ScoreForm from '../../components/ScoreForm';
import Elapsed from '../../components/Elapsed';
import { courtName, fmtNumber } from '../../lib/format';
import { matchTitle } from '../../lib/tournamentModel';
import { pickNewest } from '../../lib/live';

// Tab Sân (07 mục 2): mỗi sân của giải — đang đánh (bảng điểm, đổi theo luồng SSE) / trống (trận gợi ý + "Gọi trận này") / bận việc khác.

function BusyCourt({ court, match, live, operate, skew, onScore, onLiveScore, scoreOpen, setScoreOpen, scoreProps }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4" data-court={court}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <b className="text-base text-slate-900 dark:text-white">
          {courtName(court)}
          {match.scoring.bestOf > 1 && <Badge variant="violet"> {match.scoring.bestOf} game</Badge>}
        </b>
        <Badge variant="amber">Đang đánh · <Elapsed since={match.calledAt} skew={skew} /></Badge>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{matchTitle(match)}</p>
      {live ? (
        <ScoreBoard match={match} live={live} label={match.label || ''} />
      ) : (
        <div className="space-y-1 text-sm font-semibold text-slate-900 dark:text-white">
          <div><TeamNames team={match.teamA} /></div>
          <div className="text-xs font-normal text-slate-400">vs{match.label ? ` · ${match.label}` : ''}</div>
          <div><TeamNames team={match.teamB} /></div>
        </div>
      )}
      {operate && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onLiveScore && <Button onClick={() => onLiveScore(match)}>Bấm điểm</Button>}
          <Button variant="secondary" onClick={() => setScoreOpen(!scoreOpen)}>Nhập tỉ số</Button>
        </div>
      )}
      {scoreOpen && <div className="mt-3"><ScoreForm match={match} outcomes {...scoreProps} onSubmit={(body, outcome) => onScore(match, body, outcome)} onCancel={() => setScoreOpen(false)} /></div>}
    </div>
  );
}

function FreeCourt({ court, suggestion, blockedHint, operate, live, onCall, onPick }) {
  const m = suggestion && suggestion.match;
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4" data-court={court}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <b className="text-base text-slate-900 dark:text-white">{courtName(court)}</b>
        <Badge variant="emerald">Trống</Badge>
      </div>
      {m ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gợi ý · {matchTitle(m)}{m.expectedTime ? ` · dự kiến ${m.expectedTime}` : ''}
            {suggestion.rested === false && <Badge variant="amber"> vừa đánh {suggestion.restMinutes} phút trước</Badge>}
          </p>
          <div className="mt-2 space-y-1 text-sm font-semibold text-slate-900 dark:text-white">
            <div><TeamNames team={m.teamA} /></div>
            <div className="text-xs font-normal text-slate-400">vs</div>
            <div><TeamNames team={m.teamB} /></div>
          </div>
          {operate && live && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => onCall(m, court)}>Gọi trận này ra {courtName(court)}</Button>
              <Button variant="secondary" onClick={() => onPick(court)}>Chọn trận khác…</Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">{blockedHint}</p>
      )}
    </div>
  );
}

export default function TabCourts({ model, perms, liveScores, skew, onCall, onPick, onScore, onLiveScore, scoreOpen, setScoreOpen, scoreProps }) {
  const { courts, onCourt, busyElsewhere, suggestion, candidates, blocked, ms, blockedText, live } = model;
  const operate = perms.canOperate;
  const [showAll, setShowAll] = useState(false);

  const hint = (court) => {
    if (blocked.size) return `Chưa có trận gọi được — ${[...blocked.keys()].slice(0, 2).map((mid) => blockedText(ms.find((x) => x.id === mid))).join('; ')}.`;
    if (ms.some((m) => m.status === 'scheduled')) return 'Chưa có trận gọi được: các trận còn lại chờ đội thắng của trận trước.';
    return court ? 'Không còn trận nào chờ.' : '';
  };
  const used = new Set([...suggestion.values()].map((s) => s.match.id));
  const upcoming = candidates.filter((it) => !used.has(it.match.id));
  const blockedMatches = [...blocked.keys()].map((mid) => ms.find((x) => x.id === mid)).filter(Boolean);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          {courts.map((c) => {
            const m = onCourt.get(c);
            if (m) {
              return (
                <BusyCourt
                  key={c}
                  court={c}
                  match={m}
                  live={pickNewest(m.live, liveScores.get(m.id))}
                  operate={operate}
                  skew={skew}
                  onScore={onScore}
                  onLiveScore={onLiveScore}
                  scoreOpen={scoreOpen === m.id}
                  setScoreOpen={(open) => setScoreOpen(open ? m.id : null)}
                  scoreProps={scoreProps}
                />
              );
            }
            if (busyElsewhere.includes(c)) {
              return (
                <div key={c} className="rounded-2xl border border-slate-300 p-4 dark:border-slate-700" data-court={c}>
                  <div className="mb-2 flex items-center justify-between"><b className="text-slate-900 dark:text-white">{courtName(c)}</b><Badge>Bận việc khác</Badge></div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Sân đang có trận của buổi giao lưu / giải khác. Bỏ sân này hoặc thêm sân ở "Thêm ▾ → Sân của giải".</p>
                </div>
              );
            }
            return <FreeCourt key={c} court={c} suggestion={suggestion.get(c)} blockedHint={hint(c)} operate={operate} live={live} onCall={onCall} onPick={onPick} />;
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Gợi ý: lượt sớm nhất mà mọi người đều rảnh, đội nghỉ lâu hơn trước; ai vừa đánh chưa đủ 5 phút thì xếp sau. Một người không ở hai sân, một sân không hai trận.</p>
      </Card>

      {(upcoming.length > 0 || blockedMatches.length > 0) && (
        <Card title="Kế tiếp">
          <ul className="space-y-2 text-sm">
            {(showAll ? upcoming : upcoming.slice(0, 4)).map((it) => (
              <li key={it.match.id}>
                <small className="text-slate-500">{matchTitle(it.match)}{it.match.expectedTime ? ` · ${it.match.expectedTime}` : ''}</small>{' '}
                <TeamNames team={it.match.teamA} /> <span className="text-slate-400">vs</span> <TeamNames team={it.match.teamB} />
                {it.restMinutes != null && it.restMinutes < 5 && <small className="ml-2 text-amber-600">nghỉ {fmtNumber(it.restMinutes, 0)} phút</small>}
              </li>
            ))}
            {blockedMatches.slice(0, 4).map((m) => (
              <li key={m.id}>
                <small className="text-slate-500">{matchTitle(m)}</small> <TeamNames team={m.teamA} /> <span className="text-slate-400">vs</span> <TeamNames team={m.teamB} />{' '}
                <Badge variant="amber">chờ: {blockedText(m)}</Badge>
              </li>
            ))}
          </ul>
          {upcoming.length > 4 && <button type="button" className="mt-2 text-xs font-bold text-emerald-600 hover:underline" onClick={() => setShowAll(!showAll)}>{showAll ? 'Thu gọn' : `Xem thêm ${upcoming.length - 4} trận`}</button>}
        </Card>
      )}
    </div>
  );
}
