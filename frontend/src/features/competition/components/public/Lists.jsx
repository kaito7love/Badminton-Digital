import React from 'react';
import { Badge } from '../../../../components/UIComponents';
import { Card, EmptyState, TeamNames } from '../ui';
import BracketView from '../BracketView';
import { courtName } from '../../lib/format';
import { groupSchedule, scoreText, winnerOf } from '../../lib/publicHub';
import { PlayersLine, YouTag } from './atoms';

// Danh sách của khu công khai: người đăng ký, lịch & kết quả, bảng, sơ đồ, thứ hạng, bảng sân (plan 27). Dữ liệu là hình dạng API công khai
// (tên theo quyền riêng tư: người bị che hiện "Thành viên A3F2").

/** Danh sách đăng ký giải: chính thức rồi danh sách chờ (mỗi dòng một người hoặc một cặp). */
export function EntriesList({ entries, needsPartner }) {
  const official = (entries || []).filter((e) => e.status === 'registered');
  const waiting = (entries || []).filter((e) => e.status === 'waitlisted');
  if (!entries || !entries.length) {
    return <EmptyState title="Chưa có ai đăng ký">Hãy là {needsPartner ? 'cặp' : 'người'} đầu tiên đăng ký giải này.</EmptyState>;
  }
  const row = (e, i, waitList) => (
    <li
      key={e.id}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-1 py-2 text-sm first:border-t-0 dark:border-slate-800 ${e.mine ? 'rounded-xl bg-emerald-500/10' : ''}`}
      data-testid="entry-row"
    >
      <span className="w-7 shrink-0 text-right text-xs font-black text-slate-400 tabular-nums">{waitList ? (e.waitlistPosition ? `#${e.waitlistPosition}` : '·') : i + 1}</span>
      <PlayersLine players={e.players} mine={e.mine} className="min-w-0 flex-1" />
      {e.mine && <YouTag />}
      {waitList && e.waitlistReason && e.waitlistReason !== 'capacity' && <Badge variant="slate">{e.waitlistReason === 'absent' ? 'vắng mặt' : 'chưa vào bốc thăm'}</Badge>}
    </li>
  );
  return (
    <div className="space-y-4">
      <Card title={`Danh sách chính thức (${official.reduce((n, e) => n + e.players.length, 0)} người)`}>
        {official.length ? <ul>{official.map((e, i) => row(e, i, false))}</ul> : <p className="text-sm text-slate-500">Chưa có ai trong danh sách chính thức.</p>}
      </Card>
      {waiting.length > 0 && (
        <Card title={`Danh sách chờ (${waiting.reduce((n, e) => n + e.players.length, 0)} người)`}>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Có người rút thì người đứng đầu danh sách chờ được vào danh sách chính thức.</p>
          <ul>{waiting.map((e, i) => row(e, i, true))}</ul>
        </Card>
      )}
    </div>
  );
}

function MatchRow({ m }) {
  const win = winnerOf(m);
  const live = m.status === 'in_play';
  const name = (team, side) => (
    <span className={`min-w-0 flex-1 ${win === side ? 'font-black text-emerald-700 dark:text-emerald-300' : ''}`}>
      {team ? <PlayersLine players={team.players} /> : <TeamNames team={null} />}
    </span>
  );
  const score = scoreText(m);
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-1 py-2.5 text-sm first:border-t-0 dark:border-slate-800 ${live ? 'rounded-xl bg-amber-500/10' : ''}`} data-testid="match-row" data-status={m.status}>
      <span className="w-12 shrink-0 text-xs font-bold text-slate-500 tabular-nums dark:text-slate-400">{m.expectedTime || ''}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        {name(m.teamA, 'A')}
        <span className="text-xs font-bold text-slate-400">vs</span>
        {name(m.teamB, 'B')}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {live && <Badge variant="amber">● Đang đánh{m.courtRef ? ` · ${courtName(m.courtRef)}` : ''}</Badge>}
        {!live && m.courtRef && m.status === 'scheduled' && <span className="text-xs text-slate-500">{courtName(m.courtRef)}</span>}
        {score && <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-black tabular-nums text-slate-800 dark:bg-slate-800 dark:text-slate-100">{score}</span>}
        {m.outcome === 'walkover' && <Badge variant="slate">W.O.</Badge>}
        {m.outcome === 'retired' && <Badge variant="slate">bỏ cuộc</Badge>}
      </div>
    </li>
  );
}

/** Lịch & kết quả: gom theo bảng / vòng; đang đánh lên trước. */
export function ScheduleList({ matches }) {
  const sections = groupSchedule(matches);
  if (!sections.length) return <EmptyState title="Chưa có lịch thi đấu">Lịch hiện ra sau khi ban tổ chức bốc thăm.</EmptyState>;
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <Card key={s.key} title={s.title}>
          <ul>{s.matches.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
        </Card>
      ))}
    </div>
  );
}

/** Bảng xếp hạng từng bảng của vòng bảng / vòng tròn. */
export function StandingsTables({ groups, roundRobin }) {
  if (!groups || !groups.length) return null;
  const many = groups.length > 1;
  return (
    <Card title={roundRobin ? 'Bảng xếp hạng' : 'Xếp hạng vòng bảng'}>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
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
                    <td className="py-1.5 pr-2 font-black">{r.rank}</td>
                    <td className="py-1.5 pr-2"><PlayersLine players={r.team.players} />{r.team.withdrawn && <Badge variant="slate"> đã rút</Badge>}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{r.played}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{r.wins}–{r.losses}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{r.gameDiff}</td>
                    <td className="py-1.5 tabular-nums">{r.pointDiff}</td>
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

/** Sơ đồ loại trực tiếp dạng hình (dùng lại BracketView của khu nhân viên — cùng hình dạng trận). */
export function BracketCard({ rounds, title }) {
  if (!rounds || !rounds.length) return null;
  return (
    <Card title="Sơ đồ loại trực tiếp">
      <BracketView rounds={rounds} title={title} />
    </Card>
  );
}

/** Thứ hạng chung cuộc sau khi chốt giải. */
export function PlacementsCard({ placements }) {
  if (!placements || !placements.length) return <EmptyState>Chưa có kết quả chung cuộc.</EmptyState>;
  return (
    <Card title="Thứ hạng chung cuộc">
      <table className="w-full text-left text-sm">
        <tbody>
          {placements.map((p) => (
            <tr key={`${p.from}-${p.teamId}`} className="border-t border-slate-100 first:border-t-0 dark:border-slate-800">
              <td className="py-2 pr-3 font-black text-slate-900 dark:text-white">{p.from === 1 ? '🏆 ' : ''}{p.label}</td>
              <td className="py-2 pr-3"><PlayersLine players={p.players} /></td>
              <td className="py-2 text-slate-500 dark:text-slate-400">{p.wins} trận thắng</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Ai đã đăng ký một buổi giao lưu (giữ chỗ / chờ / đã đến). */
export function SignupList({ signups, maxPlayers }) {
  if (!signups || !signups.length) return <EmptyState title="Chưa có ai đăng ký">Hãy là người đầu tiên báo trước cho buổi này.</EmptyState>;
  const label = { registered: 'Giữ chỗ', waitlisted: 'Đang chờ', attended: 'Đã đến' };
  const tone = { registered: 'emerald', waitlisted: 'amber', attended: 'sky' };
  return (
    <Card title={`Đã đăng ký (${signups.length}${maxPlayers ? `/${maxPlayers}` : ''})`}>
      <ul>
        {signups.map((s, i) => (
          <li key={s.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-1 py-2 text-sm first:border-t-0 dark:border-slate-800 ${s.mine ? 'rounded-xl bg-emerald-500/10' : ''}`} data-testid="signup-row">
            <span className="w-7 shrink-0 text-right text-xs font-black text-slate-400 tabular-nums">{i + 1}</span>
            <PlayersLine players={[s.player]} mine={s.mine} className="min-w-0 flex-1" />
            {s.mine && <YouTag />}
            <Badge variant={tone[s.status]}>{label[s.status]}{s.status === 'waitlisted' && s.waitlistPosition ? ` #${s.waitlistPosition}` : ''}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Bảng sân của buổi giao lưu: sân đang đánh, sắp vào sân, hàng chờ, kết quả gần đây. */
export function SessionBoardView({ board }) {
  if (!board) return <EmptyState>Chưa tải được bảng sân.</EmptyState>;
  const open = board.session.status === 'open';
  return (
    <div className="space-y-4">
      <Card title="Các sân">
        <div className="grid gap-3 sm:grid-cols-2">
          {board.courts.map((c) => (
            <div key={c.courtRef} className={`rounded-2xl border p-3 ${c.status === 'busy' ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-200 dark:border-slate-800'}`} data-testid="court-card" data-status={c.status}>
              <div className="mb-1 flex items-center justify-between text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-200">{courtName(c.courtRef)}</span>
                <Badge variant={c.status === 'busy' ? 'amber' : 'emerald'}>{c.status === 'busy' ? '● Đang đánh' : 'Trống'}</Badge>
              </div>
              {c.match ? (
                <div className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2"><PlayersLine players={c.match.teamA ? c.match.teamA.players : []} /> <span className="text-xs text-slate-400">vs</span> <PlayersLine players={c.match.teamB ? c.match.teamB.players : []} /></div>
                  {scoreText(c.match) && <div className="text-lg font-black tabular-nums text-slate-900 dark:text-white">{scoreText(c.match)}</div>}
                </div>
              ) : <p className="text-sm text-slate-500">{open ? 'Sân đang trống.' : '—'}</p>}
            </div>
          ))}
        </div>
      </Card>
      {open && board.upcoming.length > 0 && (
        <Card title="Sắp vào sân">
          <ul className="space-y-1.5 text-sm">
            {board.upcoming.map((u) => (
              <li key={u.courtRef} className="flex flex-wrap items-center gap-x-2">
                <b className="text-xs text-slate-500">{courtName(u.courtRef)}</b>
                <PlayersLine players={u.sideA} /> <span className="text-xs text-slate-400">vs</span> <PlayersLine players={u.sideB} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {open && (
        <Card title={`Hàng chờ (${board.queue.length})`}>
          {board.queue.length ? (
            <ol className="grid gap-x-6 sm:grid-cols-2">
              {board.queue.map((q) => (
                <li key={q.position} className="flex items-center gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0 dark:border-slate-800">
                  <span className="w-6 text-right text-xs font-black text-slate-400 tabular-nums">{q.position}</span>
                  <PlayersLine players={[q.player]} />
                  <span className="ml-auto text-xs text-slate-500">{q.gamesPlayed} trận</span>
                  {q.next && <Badge variant="emerald">sắp vào</Badge>}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-slate-500">Không ai đang chờ.</p>}
        </Card>
      )}
      {board.recent.length > 0 && (
        <Card title="Kết quả gần đây">
          <ul>
            {board.recent.map((m) => <MatchRow key={m.id} m={m} />)}
          </ul>
        </Card>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">{board.counts.present} người có mặt · {board.counts.onCourt} đang trên sân · {board.counts.waiting} đang chờ.</p>
    </div>
  );
}
