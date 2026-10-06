import React, { useMemo, useRef, useState } from 'react';
import { Badge } from '../../../../components/UIComponents';
import { Button, Card, Notice } from '../../components/ui';
import PersonPicker from '../../components/PersonPicker';
import { tournamentsApi, playersApi } from '../../api/tournaments';
import { useAction } from '../../hooks/useAction';
import { useRegistrationPeople } from '../../hooks/useRegistrationPeople';
import { fmtNumber } from '../../lib/format';
import { QUICK_LEVELS } from '../../lib/labels';
import { phoneText } from '../../lib/registerFlow';
import { useCompetition } from '../../context/CompetitionContext';

// Tab Đăng ký & điểm danh (07 mục 2): ô gõ tìm tên (không cần dấu), người đang bận ở buổi / giải khác có ghi chú và xếp cuối;
// điểm danh = ô tích trên tên từng người (+ "☑ cả cặp"); lọc "chỉ hiện cặp chưa đến đủ"; đổi đồng đội, rút.

/** Dựng danh sách gợi ý đăng ký — hàm thuần: bỏ người đã đăng ký, gắn điểm theo nội dung, ghi chú bận. */
export const buildOptions = (people, takenIds, discipline, busy) =>
  people
    .filter((p) => !takenIds.has(p.id))
    .map((p) => {
      const r = p.ratings && p.ratings[discipline];
      const gender = p.gender === 'male' ? 'nam' : p.gender === 'female' ? 'nữ' : '';
      return {
        id: p.id,
        label: p.displayName,
        rated: Boolean(r),
        sub: `${gender}${r ? ` · ${fmtNumber(r.pairingRating)} ${r.level}` : ' · chưa có điểm'}`.replace(/^ · /, ''),
        note: (busy && busy.get(p.id)) || ''
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));

function RegisterForm({ t, model, onRegistered }) {
  const { toast } = useCompetition();
  const { pairsMode, active } = model;
  const { people, busy, loading } = useRegistrationPeople(t.id, true);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [quick, setQuick] = useState('');
  const [keyN, setKeyN] = useState(0);
  const [added, setAdded] = useState(() => new Set()); // vừa đăng ký xong, trang chưa kịp tải lại: không gợi ý lại người đó
  const [run, { busy: sending, error }] = useAction();
  const firstRef = useRef(null);

  const taken = useMemo(() => new Set([...active.map((e) => e.playerId), ...added]), [active, added]);
  const options = useMemo(() => buildOptions(people || [], taken, t.discipline, busy), [people, taken, t.discipline, busy]);

  const unrated = [a, b].filter(Boolean).some((x) => !x.rated);
  const sameTwice = a && b && a.id === b.id;
  const ready = a && (!pairsMode || (b && !sameTwice)) && (!unrated || quick);
  const notes = [a, b].filter((x) => x && x.note);
  const hint = sameTwice ? 'Chọn hai người khác nhau.'
    : unrated ? `Có người chưa có điểm ${t.discipline === 'doubles' ? 'Đôi' : 'Đơn'} — chọn một nhãn chấm nhanh rồi đăng ký.`
      : notes.length ? `Lưu ý: ${notes.map((x) => `${x.label} ${x.note}`).join('; ')}.`
        : pairsMode ? 'Gõ tên (không cần dấu) để tìm. Hai người đăng ký chung một đội — bốc thăm giữ nguyên cặp.' : 'Gõ tên (không cần dấu) để tìm.';

  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    const res = await run(async () => {
      for (const x of [a, b].filter(Boolean)) {
        if (!x.rated) await playersApi.quickAssessment(x.id, { level: quick, note: `Chấm nhanh khi đăng ký giải "${t.name}"` });
      }
      return tournamentsApi.register(t.id, { playerId: a.id, ...(b ? { partnerPlayerId: b.id } : {}) });
    });
    if (!res) return;
    setAdded(new Set(res.items.filter((x) => x.status !== 'withdrawn').map((x) => x.playerId)));
    const mine = res.items.find((x) => x.playerId === a.id);
    toast(mine && mine.status === 'waitlisted' ? 'Đã hết chỗ — vào danh sách chờ' : `Đã đăng ký ${a.label}${b ? ` + ${b.label}` : ''}`);
    setA(null); setB(null); setQuick('');
    setKeyN((n) => n + 1); // dựng lại ô tìm để xoá chữ; con trỏ về ô đầu để gõ cặp sau ngay
    onRegistered();
    setTimeout(() => firstRef.current && firstRef.current.focus(), 50);
  };

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Đăng ký">
      <b className="text-sm text-slate-900 dark:text-white">{pairsMode ? 'Đăng ký cặp' : 'Đăng ký'}</b>
      <div className="flex flex-wrap items-start gap-2">
        <PersonPicker key={`a${keyN}`} inputRef={firstRef} people={options} value={a} onChange={setA} placeholder={pairsMode ? 'Người thứ nhất — gõ tên…' : 'Gõ tên người chơi…'} disabled={loading || sending} autoFocus />
        {pairsMode && <><span className="pt-2 text-slate-400">+</span><PersonPicker key={`b${keyN}`} people={options} value={b} onChange={setB} placeholder="Đồng đội — gõ tên…" disabled={loading || sending} /></>}
        {unrated && (
          <select value={quick} onChange={(e) => setQuick(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" aria-label="Chấm nhanh">
            <option value="">Chấm nhanh một nhãn…</option>
            {QUICK_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        <Button type="submit" busy={sending} disabled={!ready}>{pairsMode ? 'Đăng ký cặp' : 'Đăng ký'}</Button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{loading ? 'Đang tải danh sách người chơi…' : hint}</p>
      {error && <Notice error={error} />}
    </form>
  );
}

const flagsOf = (u) => u.flatMap((x) => x.flags || []);

/** Dấu "đăng ký online" + liên hệ của đồng đội khách (chỉ nhân viên thấy SĐT) — plan 27. `unit` = một người hoặc một cặp. */
export function OnlineTags({ unit }) {
  return (
    <>
      {unit.some((x) => x.via === 'self') && <Badge variant="sky">đăng ký online</Badge>}
      {unit.filter((x) => x.source === 'online_guest' && x.contactPhone).map((x) => (
        <div key={`g${x.id}`} className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="guest-contact">
          <Badge variant="amber">đồng đội khách</Badge> {x.name} · SĐT {phoneText(x.contactPhone)} — xác nhận trình khi nhận số
        </div>
      ))}
    </>
  );
}

export default function TabRegistration({ t, model, perms, view, setView, reload, askConfirm, onChangePartner, setTouched }) {
  const { units, active, pairsMode, live } = model;
  const operate = perms.canOperate;
  const checkable = operate && ['open', 'drawn', 'in_progress'].includes(t.status);
  const [run, { error }] = useAction({ onReload: reload });
  const registered = active.filter((e) => e.status === 'registered');
  const arrived = active.filter((e) => e.checkedInAt).length;
  const online = active.filter((e) => e.via === 'self' && e.status !== 'withdrawn').length; // khách tự đăng ký trên trang công khai (plan 27)
  const shown = view.absentOnly ? units.filter((u) => u.some((x) => !x.checkedInAt && x.status !== 'withdrawn')) : units;

  const toggle = (entry, present) => run(async () => { await tournamentsApi.checkIn(t.id, entry.id, present); await reload({ silent: true }); });
  const checkAll = (u) => run(async () => {
    for (const e of u) if (!e.checkedInAt) await tournamentsApi.checkIn(t.id, e.id, true);
    await reload({ silent: true });
  });
  const statusBadge = (e) => (e.status === 'registered' ? null
    : e.status === 'waitlisted' ? <Badge variant="amber">chờ{e.waitlistReason === 'absent' ? ' — vắng lúc bốc' : e.waitlistReason === 'draw' ? ' — lẻ người' : ' — hết chỗ'}</Badge>
      : <Badge>đã rút</Badge>);

  const withdraw = (u) => {
    const e = u[0];
    const who = u.map((x) => x.name).join(' + ');
    askConfirm({
      title: `Rút ${who}`,
      text: t.status === 'open'
        ? 'Rút khỏi giải; người đầu danh sách chờ (nếu có) được lên.'
        : 'Đã bốc thăm: cả đội rút, các trận chưa đánh thành W.O. cho đối thủ (đang ở sơ đồ thì đối thủ đi tiếp). Trận đã đánh vẫn tính.',
      confirmLabel: 'Rút',
      danger: true,
      action: async () => { await tournamentsApi.withdraw(t.id, e.id); return `Đã rút ${who}`; }
    });
  };

  return (
    <Card>
      {operate && t.status === 'open' && <div className="mb-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800" onChangeCapture={() => setTouched(true)}><RegisterForm t={t} model={model} onRegistered={() => { setTouched(false); reload({ silent: true }); }} /></div>}
      {t.status === 'draft' && <Notice kind="info">Giải đang là nháp — bấm "Mở đăng ký" để nhận đăng ký.</Notice>}
      {error && <Notice error={error} />}

      <div className="mb-2 mt-3 flex flex-wrap items-center justify-between gap-2">
        <b className="text-sm text-slate-900 dark:text-white">
          {pairsMode ? `${units.filter((u) => u[0].status === 'registered').length} cặp đã đăng ký` : `${registered.length} người đã đăng ký`}
          {t.status !== 'draft' && <> · đã đến <Badge variant={arrived === active.length && active.length ? 'emerald' : 'amber'}>{arrived}/{active.length}</Badge></>}
          {online > 0 && <> · <Badge variant="sky">{online} đăng ký online</Badge></>}
        </b>
        {t.status !== 'draft' && (
          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input type="checkbox" className="accent-emerald-500" checked={view.absentOnly} onChange={(e) => setView({ ...view, absentOnly: e.target.checked })} />
            Chỉ hiện {pairsMode ? 'cặp' : 'người'} chưa đến đủ
          </label>
        )}
      </div>
      {t.status !== 'draft' && checkable && (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Điểm danh: tích ô tên khi người đó đến{pairsMode ? ' (hoặc "☑ cả cặp")' : ''}.{' '}
          {t.checkInRequired && t.status === 'open' ? 'Bốc thăm chỉ lấy người đã đến; cặp thiếu người sang danh sách chờ.' : live ? 'Đội chưa đánh trận nào mà chưa đến đủ → "Thêm ▾ → Xử W.O. đội vắng".' : ''}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-3 font-semibold">{pairsMode ? 'Cặp — tích tên khi đến' : 'Người chơi — tích tên khi đến'}</th>
              <th className="py-2 pr-3 font-semibold">Trình</th>
              <th className="py-2 pr-3" />
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const e = u[0];
              const rating = u.reduce((s, x) => s + (x.pairingRating || 0), 0) / u.length;
              const flags = flagsOf(u);
              const missing = u.filter((x) => !x.checkedInAt && x.status !== 'withdrawn');
              return (
                <tr key={e.id} className={`border-t border-slate-100 align-top dark:border-slate-800 ${e.status === 'withdrawn' ? 'opacity-50' : ''}`} data-arrived={missing.length ? undefined : '1'}>
                  <td className="py-2 pr-3">
                    {u.map((x) => (t.status === 'draft' || x.status === 'withdrawn'
                      ? <span key={x.id} className="mr-3">{x.name}</span>
                      : (
                        <label key={x.id} className={`mr-3 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 ${x.checkedInAt ? 'bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300' : ''}`}>
                          <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={Boolean(x.checkedInAt)} disabled={!checkable} onChange={(ev) => toggle(x, ev.target.checked)} aria-label={`Điểm danh ${x.name}`} />
                          {x.name}
                        </label>
                      )))}
                    {checkable && u.length > 1 && missing.length === u.length && <button type="button" className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => checkAll(u)}>☑ cả cặp</button>}
                    {flags.includes('quick') && <Badge variant="amber">chấm nhanh</Badge>}
                    {flags.includes('self_unverified') && <Badge variant="amber">tự chấm</Badge>}
                    <OnlineTags unit={u} />
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{fmtNumber(rating)}</td>
                  <td className="py-2 pr-3">{statusBadge(e)}</td>
                  <td className="py-2 text-right">
                    {operate && e.status !== 'withdrawn' && (
                      <div className="flex flex-wrap justify-end gap-1">
                        {pairsMode && t.status === 'open' && <Button variant="secondary" className="!px-2 !py-1 !text-xs" onClick={() => onChangePartner(e)}>Đổi đồng đội</Button>}
                        {['open', 'drawn', 'in_progress'].includes(t.status) && <Button variant="danger" className="!px-2 !py-1 !text-xs" onClick={() => withdraw(u)}>Rút</Button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={4} className="py-4 text-slate-500">{view.absentOnly ? 'Mọi người đã đến đủ.' : 'Chưa ai đăng ký.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
