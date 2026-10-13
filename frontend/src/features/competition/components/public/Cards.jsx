import React from 'react';
import { Link } from 'react-router-dom';
import { orgName } from '../../lib/format';
import { FORMAT } from '../../lib/labels';
import {
  disciplineLabel, fillRatio, hubPaths, ratingRuleText, registrationState, sessionFillRatio, sessionPhase, sessionSpotsText, sessionWhen, spotsText,
  SESSION_PHASE, tournamentWhen
} from '../../lib/publicHub';
import { FeeChip, Meter, Pill } from './atoms';

// Thẻ giải / buổi giao lưu ở trang chủ khu công khai (plan 27). Cả thẻ là một liên kết tới trang chi tiết (bấm ở đâu cũng vào).

const cardCls = 'group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/80';

export function TournamentCard({ t, now }) {
  const state = registrationState(t);
  const reg = t.registration;
  const cta = state.key === 'open' ? 'Xem & đăng ký' : state.key === 'full' ? 'Xem & vào danh sách chờ' : state.key === 'done' ? 'Xem kết quả' : 'Xem diễn biến';
  return (
    <Link to={hubPaths.tournament(t.id)} className={cardCls} data-testid="tournament-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone={state.tone}>{state.label}</Pill>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{disciplineLabel(t)}</span>
      </div>
      <h3 className="text-lg font-black leading-snug text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">{t.name}</h3>
      <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">📅 {tournamentWhen(t, now)}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">📍 {orgName(t.organizerRef)} · {FORMAT[t.format] || t.format}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">🎯 {ratingRuleText(t.ratingRule)}</p>
      {t.status === 'open' && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>{spotsText(reg)}</span>
            {reg && reg.maxEntries ? <span>{reg.registered}/{reg.maxEntries}</span> : null}
          </div>
          <Meter ratio={fillRatio(reg)} />
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <FeeChip />
        <span className="text-sm font-black text-emerald-600 group-hover:underline dark:text-emerald-400">{cta} →</span>
      </div>
    </Link>
  );
}

export function SessionCard({ s, now }) {
  const phase = sessionPhase(s, now);
  const [label, tone] = SESSION_PHASE[phase];
  const open = s.status === 'open';
  return (
    <Link to={hubPaths.session(s.id)} className={cardCls} data-testid="session-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone={tone}>{label}</Pill>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{s.format === 'singles' ? 'Đánh đơn' : 'Đánh đôi'}</span>
      </div>
      <h3 className="text-lg font-black leading-snug text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">{s.name}</h3>
      <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">🕒 {sessionWhen(s.startsAt, now)}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">📍 {orgName(s.organizerRef)} · {s.courtCount} sân</p>
      {open && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>{sessionSpotsText(s.signup)}</span>
            <span>{s.players.present} người đang có mặt</span>
          </div>
          <Meter ratio={sessionFillRatio(s.signup)} tone="sky" />
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <FeeChip />
        <span className="text-sm font-black text-emerald-600 group-hover:underline dark:text-emerald-400">{open ? 'Xem & tham gia' : 'Xem lại'} →</span>
      </div>
    </Link>
  );
}
