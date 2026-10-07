import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Check, chip, Field, inputClass } from '../../components/form';
import { Notice, Spinner } from '../../components/ui';
import { sessionsApi } from '../../api/tournaments';
import { useAction } from '../../hooks/useAction';
import { useLoad } from '../../hooks/useLoad';
import { courtName, fmtDelta, fmtNumber } from '../../lib/format';
import { MODE, presetOf, QUICK_LEVELS, SCORING_PRESETS } from '../../lib/labels';
import { buildFillBody, initFill, parseMaxPlayers, personLabel, repeatWarning, swapFill, SESSION_FORMAT } from '../../lib/sessionModel';

// Các hộp thoại của trang buổi giao lưu. Cùng quy ước với TournamentDialogs: tự tải dữ liệu xem trước, khoá nút khi gửi, `onDone(thôngBáo)`.

const nowLocal = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
const toLocalInput = (iso) => {
  const d = new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

/** Body tạo / sửa buổi từ ô nhập — hàm thuần để test. */
export const buildSessionBody = (f, { organizerRef, creating }) => {
  const name = f.name.trim();
  if (name.length < 3) return { error: 'Tên buổi tối thiểu 3 ký tự.' };
  if (!f.courts.length) return { error: 'Chọn ít nhất một sân.' };
  const max = parseMaxPlayers(f.maxPlayers);
  if (max.error) return { error: max.error };
  const body = {
    name,
    startsAt: new Date(f.startsAt).toISOString(),
    courtRefs: f.courts,
    format: f.format,
    mode: f.mode,
    scoring: f.scoring,
    rated: Boolean(f.rated),
    maxPlayers: max.value
  };
  if (creating) body.organizerRef = organizerRef;
  return { body };
};

// ---------------------------------------------------------------------------------------------------------------- tạo / sửa buổi

export function SessionFormDialog({ session = null, organizerRef, branchCourts, usage = new Map(), formatLocked = false, onClose, onDone }) {
  const editing = Boolean(session);
  const [run, { busy, error }] = useAction();
  const [localError, setLocalError] = useState('');
  const [f, setF] = useState(() => (editing
    ? { name: session.name, startsAt: toLocalInput(session.startsAt), courts: [...session.courtRefs], format: session.format, mode: session.mode, scoring: presetOf(session.scoring), rated: session.rated, maxPlayers: session.maxPlayers ? String(session.maxPlayers) : '' }
    : { name: '', startsAt: nowLocal(), courts: [], format: 'doubles', mode: 'balanced', scoring: '1x21', rated: false, maxPlayers: '' }));
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const toggle = (ref) => set({ courts: f.courts.includes(ref) ? f.courts.filter((c) => c !== ref) : [...f.courts, ref] });

  const refs = useMemo(() => {
    const known = branchCourts.map((c) => ({ ref: c.ref, name: c.name }));
    for (const ref of f.courts) if (!known.some((k) => k.ref === ref)) known.push({ ref, name: courtName(ref) });
    return known;
  }, [branchCourts, f.courts]);

  const submit = async (e) => {
    e.preventDefault();
    const built = buildSessionBody(f, { organizerRef, creating: !editing });
    if (built.error) { setLocalError(built.error); return; }
    setLocalError('');
    const done = await run(() => (editing ? sessionsApi.update(session.id, built.body, session.version) : sessionsApi.create(built.body)));
    if (done) onDone(editing ? 'Đã cập nhật buổi giao lưu' : 'Đã tạo buổi giao lưu — điểm danh người chơi rồi bấm "Xếp sân trống"', done);
  };

  return (
    <Dialog
      title={editing ? 'Sửa buổi giao lưu' : 'Tạo buổi giao lưu'}
      onClose={onClose}
      error={error}
      actions={[{ label: editing ? 'Lưu' : 'Tạo buổi', variant: 'primary', busy, onClick: submit }]}
    >
      <form className="space-y-3" onSubmit={submit} aria-label="Buổi giao lưu">
        {!editing && !organizerRef && <Notice kind="warn">Không xác định được chi nhánh của tài khoản — chọn chi nhánh ở thanh trên rồi thử lại.</Notice>}
        <Field label="Tên buổi"><input className={inputClass} required minLength={3} maxLength={120} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Giao lưu tối thứ Tư" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bắt đầu lúc"><input type="datetime-local" className={inputClass} required value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field>
          <Field label="Hình thức" hint={formatLocked ? 'Buổi đã có trận — không đổi được Đơn / Đôi.' : ''}>
            <select className={inputClass} value={f.format} disabled={formatLocked} onChange={(e) => set({ format: e.target.value })}>
              {Object.entries(SESSION_FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Cách xếp sân" hint="Cân bằng: ghép cặp đều trình. Cùng trình: người cùng trình đánh với nhau. Ngẫu nhiên: không xét trình.">
            <select className={inputClass} value={f.mode} onChange={(e) => set({ mode: e.target.value })}>
              {Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Luật điểm" hint={editing ? 'Áp cho trận xếp SAU — trận đang đánh giữ luật cũ.' : ''}>
            <select className={inputClass} value={f.scoring} onChange={(e) => set({ scoring: e.target.value })}>
              {SCORING_PRESETS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Sức chứa đăng ký online" hint="Để trống = không giới hạn. Hết chỗ thì khách vào danh sách chờ; tăng sức chứa thì người chờ được lên.">
            <input type="number" min={2} max={200} inputMode="numeric" className={inputClass} value={f.maxPlayers} onChange={(e) => set({ maxPlayers: e.target.value })} placeholder="Không giới hạn" aria-label="Sức chứa đăng ký online" />
          </Field>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Sân của buổi</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {refs.map((c) => {
              const u = usage.get(c.ref);
              const on = f.courts.includes(c.ref);
              return (
                <label key={c.ref} title={u ? u.label : ''} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${on ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700'}`}>
                  <input type="checkbox" className="accent-emerald-500" checked={on} onChange={() => toggle(c.ref)} />
                  {c.name}
                  {u && <small className={u.live ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-slate-500'}>{u.live ? '(đang dùng)' : '(giải khác cũng chọn)'}</small>}
                </label>
              );
            })}
            {!refs.length && <small className="text-slate-500">Chưa tải được danh sách sân của chi nhánh.</small>}
          </div>
        </div>
        <Check checked={f.rated} onChange={(rated) => set({ rated })}>
          Tính điểm trình khi đóng buổi <small className="text-slate-500">(trận giao lưu tính hệ số 0.5; trận chưa có tỉ số bị huỷ khi đóng buổi)</small>
        </Check>
        {localError && <Notice kind="error">{localError}</Notice>}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- xếp sân trống

export function FillDialog({ session, onClose, onDone }) {
  const [seed, setSeed] = useState(null);
  const preview = useLoad(() => sessionsApi.fillPreview(session.id, seed), [session.id, seed]);
  const [run, { busy, error }] = useAction();
  const p = preview.data;
  const [st, setSt] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (p) { setSt(initFill(p)); setSelected(null); } }, [p]);

  const click = (loc) => {
    if (!selected) { setSelected(loc); return; }
    if (selected === loc) { setSelected(null); return; }
    setSt(swapFill(st, selected, loc));
    setSelected(null);
  };

  const confirm = async () => {
    const done = await run(() => sessionsApi.fill(session.id, buildFillBody(p, st)));
    if (done) onDone(`Đã xếp lượt ${done.round} — ${done.matches.length} sân ra đánh`);
  };

  const person = (id, loc) => (
    <button key={id} type="button" className={chip(selected === loc)} onClick={() => click(loc)} data-loc={loc}>{personLabel(p, id)}</button>
  );

  const nothing = p && p.assignments.length === 0;

  return (
    <Dialog
      title={p ? `Xếp sân trống — lượt ${p.round}` : 'Xếp sân trống'}
      size="lg"
      onClose={onClose}
      error={error || preview.error}
      actions={[
        { label: 'Xếp lại (seed khác)', onClick: () => setSeed(Math.random().toString(16).slice(2, 10)), disabled: preview.loading },
        { label: 'Xác nhận — ra sân', variant: 'primary', busy, disabled: !st || nothing, onClick: confirm }
      ]}
    >
      {(preview.loading || !st) && !preview.error && <Spinner label="Đang xếp sân…" />}
      {st && p && (
        <div className="space-y-3">
          <p className="text-slate-500">Bấm hai người để đổi chỗ (giữa hai đội, hai sân hoặc với người đang chờ). Máy kiểm lại sân / người còn rảnh khi xác nhận.</p>
          {nothing && <Notice kind="warn">{p.freeCourts.length ? `Chưa đủ ${session.format === 'singles' ? 2 : 4} người rảnh để xếp một sân.` : 'Không có sân trống.'}</Notice>}
          {st.moved && <Notice kind="info">Đã đổi tay — bản này sẽ được gửi nguyên văn; cảnh báo đồng đội trùng lượt trước không tính lại.</Notice>}
          {st.assignments.map((a, i) => (
            <div key={a.court} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800" data-assign={a.court}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <b className="text-slate-900 dark:text-white">{courtName(a.court)}</b>
                {repeatWarning(st, a) && <small className="font-bold text-amber-600 dark:text-amber-400">⚠ {repeatWarning(st, a)}</small>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {a.sideA.map((id, j) => person(id, `a:${i}:A:${j}`))}
                <span className="text-xs text-slate-400">vs</span>
                {a.sideB.map((id, j) => person(id, `a:${i}:B:${j}`))}
              </div>
            </div>
          ))}
          {st.waiting.length > 0 && (
            <div>
              <h4 className="mb-1 font-bold text-slate-900 dark:text-white">Còn chờ ({st.waiting.length})</h4>
              <div className="flex flex-wrap gap-2">{st.waiting.map((id, k) => person(id, `w:${k}`))}</div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- đóng buổi

export function CloseDialog({ session, onClose, onDone }) {
  const preview = useLoad(() => sessionsApi.closePreview(session.id), [session.id]);
  const [run, { busy, error }] = useAction();
  const p = preview.data;
  const confirm = async () => {
    const done = await run(() => sessionsApi.close(session.id));
    if (done) onDone('Đã đóng buổi giao lưu');
  };
  return (
    <Dialog
      title="Đóng buổi giao lưu"
      onClose={onClose}
      error={error || preview.error}
      actions={[{ label: 'Đóng buổi', variant: 'primary', busy, disabled: !p, onClick: confirm }]}
    >
      {preview.loading && <Spinner label="Đang tính…" />}
      {p && (
        <div className="space-y-3">
          <p>{p.completedMatches} trận đã có tỉ số{p.unscoredMatches ? `, ${p.unscoredMatches} trận chưa có tỉ số` : ''}.</p>
          {p.unscoredMatches > 0 && <Notice kind="warn">Trận đang đánh / xong không tỉ số sẽ bị <b>huỷ</b> khi đóng buổi — không tính điểm, không vào thống kê. Nhập tỉ số cho các trận đó trước nếu muốn giữ.</Notice>}
          {!p.rated && <p className="text-slate-500">Buổi này không tính điểm trình — đóng buổi chỉ cộng thống kê giao lưu.</p>}
          {p.rated && p.ratingChanges.length === 0 && <p className="text-slate-500">Chưa có trận nào để tính điểm trình.</p>}
          {p.rated && p.ratingChanges.length > 0 && (
            <div>
              <h4 className="mb-1 font-bold text-slate-900 dark:text-white">Điểm trình trước → sau</h4>
              <table className="w-full text-left text-sm">
                <tbody>
                  {p.ratingChanges.map((c) => (
                    <tr key={c.playerId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-3 font-semibold">{c.name}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{fmtNumber(c.before)} → {fmtNumber(c.after)}</td>
                      <td className={`py-1.5 pr-3 tabular-nums font-bold ${c.delta > 0 ? 'text-emerald-600' : c.delta < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{fmtDelta(c.delta)}</td>
                      <td className="py-1.5 text-xs text-slate-500">{c.matches} trận</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- chấm nhanh khi điểm danh

export function QuickLevelDialog({ person, discipline, onClose, onPick, busy, error }) {
  const [level, setLevel] = useState('tb');
  return (
    <Dialog
      title={`${person.label} chưa có điểm ${discipline === 'singles' ? 'Đơn' : 'Đôi'}`}
      onClose={onClose}
      error={error}
      actions={[{ label: 'Chấm nhanh và điểm danh', variant: 'primary', busy, onClick: () => onPick(level) }]}
    >
      <p>Chọn nhãn trình để chấm nhanh (có thể chấm đầy đủ sau ở trang Người chơi). Điểm chấm nhanh được ghi là "chưa xác nhận".</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_LEVELS.map(([key, label]) => (
          <button key={key} type="button" className={chip(level === key)} aria-pressed={level === key} onClick={() => setLevel(key)} data-level={key}>{label}</button>
        ))}
      </div>
    </Dialog>
  );
}
