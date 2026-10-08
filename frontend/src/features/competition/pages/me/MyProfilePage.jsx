import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { meApi, playersApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useAction } from '../../hooks/useAction';
import { useBranches } from '../../hooks/useBranches';
import { useCompetition } from '../../context/CompetitionContext';
import { buildProfilePatch, nicknameError, profileForm, VISIBILITY } from '../../lib/customer';
import { DISCIPLINE_LABEL, ratingOf } from '../../lib/rating';
import { fmtDate, gamesText, orgName, teamText } from '../../lib/format';
import { Badge } from '../../../../components/UIComponents';
import { Button, Card, Notice, Spinner } from '../../components/ui';
import { Field, inputClass } from '../../components/form';
import CustomerShell from '../../components/CustomerShell';

// Hồ sơ thi đấu của tôi (07 mục 1.1): tên thi đấu, quyền riêng tư, chi nhánh thường chơi, lối chơi; thống kê, thành tích, đồng đội hay đánh, trận gần đây.
// Giới tính chỉ sửa được trước trận tính điểm đầu tiên (sau đó nhờ nhân viên — có nhật ký).

const OPTIONS = {
  dominantHand: [['', '—'], ['right', 'Tay phải'], ['left', 'Tay trái']],
  preferredPlay: [['', '—'], ['singles', 'Đơn'], ['doubles', 'Đôi'], ['both', 'Cả hai']],
  doublesPosition: [['', '—'], ['front', 'Gần lưới'], ['back', 'Cuối sân'], ['both', 'Linh hoạt']]
};
const CONTEXT = { tournament: 'Giải đấu', session: 'Giao lưu' };

const loadAll = async () => {
  const me = await meApi.get();
  const opt = (p) => p.catch(() => null);
  const [stats, matches, partners] = await Promise.all([opt(playersApi.stats(me.id)), opt(meApi.matches({ limit: 8 })), opt(playersApi.partners(me.id))]);
  return { me, stats: stats ? stats.items : [], matches: matches ? matches.items : [], partners: partners ? partners.items : [] };
};

function ProfileForm({ me, onSaved }) {
  const { toast } = useCompetition();
  const branches = useBranches();
  const [form, setForm] = useState(() => profileForm(me));
  const [run, { busy, error }] = useAction();
  const [localError, setLocalError] = useState('');
  useEffect(() => { setForm(profileForm(me)); }, [me]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const hasMatches = ['singles', 'doubles'].some((d) => (ratingOf(me, d) || {}).ratedMatches > 0);
  const patch = buildProfilePatch(form, me, { genderLocked: hasMatches });

  const save = async (e) => {
    e.preventDefault();
    const problem = nicknameError(form.nickname);
    if (problem) { setLocalError(problem); return; }
    setLocalError('');
    const res = await run(() => meApi.patch(patch));
    if (res === undefined) return;
    toast('Đã cập nhật hồ sơ');
    onSaved();
  };

  return (
    <form onSubmit={save} className="space-y-4" aria-label="Hồ sơ thi đấu">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên thi đấu" hint="2–30 ký tự, không trùng người khác. Trống = dùng họ tên."><input className={inputClass} value={form.nickname} maxLength={30} onChange={(e) => set({ nickname: e.target.value })} aria-label="Tên thi đấu" /></Field>
        <Field label="Chi nhánh thường chơi">
          <select className={inputClass} value={form.homeOrganizerRef} onChange={(e) => set({ homeOrganizerRef: e.target.value })}>
            <option value="">—</option>
            {branches.map((b) => <option key={b.id} value={`bd:branch:${b.id}`}>{b.name}</option>)}
          </select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Quyền riêng tư</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {VISIBILITY.map(([value, label, hint]) => (
            <button key={value} type="button" data-visibility={value} aria-pressed={form.visibility === value} onClick={() => set({ visibility: value })}
              className={`rounded-2xl border p-3 text-left text-sm transition ${form.visibility === value ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500/50'}`}>
              <b className="block text-slate-900 dark:text-white">{label}</b>
              <small className="text-slate-600 dark:text-slate-400">{hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Giới tính" hint={hasMatches ? 'Đã có trận tính điểm — nhờ nhân viên nếu cần đổi.' : ''}>
          <select className={inputClass} value={form.gender} disabled={hasMatches} onChange={(e) => set({ gender: e.target.value })}>
            <option value="">—</option><option value="male">Nam</option><option value="female">Nữ</option>
          </select>
        </Field>
        <Field label="Năm sinh" hint="Chỉ hiện nhóm tuổi."><input type="number" inputMode="numeric" className={inputClass} value={form.birthYear} onChange={(e) => set({ birthYear: e.target.value })} /></Field>
        <Field label="Năm bắt đầu chơi"><input type="number" inputMode="numeric" className={inputClass} value={form.playingSinceYear} onChange={(e) => set({ playingSinceYear: e.target.value })} /></Field>
        <Field label="Số buổi mỗi tuần"><input type="number" inputMode="numeric" min="0" max="14" className={inputClass} value={form.sessionsPerWeek} onChange={(e) => set({ sessionsPerWeek: e.target.value })} /></Field>
        {[['dominantHand', 'Tay thuận'], ['preferredPlay', 'Thường đánh'], ['doublesPosition', 'Vị trí đánh đôi']].map(([key, label]) => (
          <Field key={key} label={label}>
            <select className={inputClass} value={form[key]} onChange={(e) => set({ [key]: e.target.value })}>{OPTIONS[key].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </Field>
        ))}
      </div>

      {(localError || error) && <Notice error={localError ? null : error} kind="error">{localError}</Notice>}
      <Button type="submit" busy={busy} disabled={Object.keys(patch).length === 0}>Lưu hồ sơ</Button>
    </form>
  );
}

export default function MyProfilePage() {
  const load = useCallback(() => loadAll(), []);
  const { data, loading, error, reload } = useLiveResource({ load });

  return (
    <CustomerShell title="Hồ sơ thi đấu của tôi" subtitle="Thông tin hiển thị với người chơi khác và dùng để ghép cặp.">
      <Link to="/my-rating" className="mb-4 inline-block text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline">← Trình độ của tôi</Link>
      {loading && !data && <Spinner label="Đang tải hồ sơ…" />}
      {error && !data && <Notice error={error} onRetry={() => reload()} />}
      {data && (
        <div className="space-y-5">
          <Card title={`${data.me.displayName}${data.me.nickname ? ` · “${data.me.nickname}”` : ''}`}>
            <ProfileForm me={data.me} onSaved={() => reload({ silent: true })} />
          </Card>

          {data.stats.length > 0 && (
            <Card title="Thống kê & thành tích">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm" data-testid="my-stats">
                  <thead><tr className="text-xs text-slate-600 dark:text-slate-400"><th className="py-1 pr-3">Nội dung</th><th className="py-1 pr-3">Trận</th><th className="py-1 pr-3">T–B</th><th className="py-1 pr-3">Thắng</th><th className="py-1">Giải</th></tr></thead>
                  <tbody>
                    {data.stats.map((s) => (
                      <tr key={`${s.discipline}-${s.context}`} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-1.5 pr-3 font-semibold">{DISCIPLINE_LABEL[s.discipline]} · {CONTEXT[s.context] || s.context}</td>
                        <td className="pr-3 tabular-nums">{s.matches}</td>
                        <td className="pr-3 tabular-nums">{s.wins}–{s.losses}</td>
                        <td className="pr-3 tabular-nums">{Math.round(s.winRate * 100)}%</td>
                        <td>{s.tournaments ? `${s.tournaments} giải · ${s.titles} vô địch · ${s.runnerUps} á quân` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {data.matches.length > 0 && (
            <Card title="Trận gần đây">
              <ul className="space-y-1 text-sm">
                {data.matches.map((m) => {
                  const side = (m.teamA.players || []).some((p) => p.id === data.me.id) ? 'A' : 'B';
                  const won = m.winnerSide === side;
                  return (
                    <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                      <Badge variant={won ? 'emerald' : 'rose'}>{won ? 'Thắng' : 'Thua'}</Badge>
                      <span>{teamText(side === 'A' ? m.teamA : m.teamB)} <span className="text-slate-600 dark:text-slate-500">vs</span> {teamText(side === 'A' ? m.teamB : m.teamA)}</span>
                      <b className="tabular-nums">{gamesText(m.games.map((g) => (side === 'A' ? g : [g[1], g[0]])))}</b>
                      <small className="text-slate-600 dark:text-slate-500">{CONTEXT[m.contextType] || ''} · {fmtDate(m.completedAt)}</small>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {data.partners.length > 0 && (
            <Card title="Đồng đội hay đánh">
              <ul className="grid gap-1 text-sm sm:grid-cols-2">{data.partners.map((p) => <li key={p.playerId}><b>{p.name}</b> · {p.matches} trận · thắng {Math.round(p.winRate * 100)}%</li>)}</ul>
            </Card>
          )}
          {data.me.homeOrganizerRef && <p className="text-xs text-slate-600 dark:text-slate-500">Chi nhánh thường chơi: {orgName(data.me.homeOrganizerRef)}</p>}
        </div>
      )}
    </CustomerShell>
  );
}
