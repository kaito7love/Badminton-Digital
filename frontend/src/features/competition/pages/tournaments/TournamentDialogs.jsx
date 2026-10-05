import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../../../components/UIComponents';
import { Dialog } from '../../components/Dialog';
import { Button, Notice, Spinner, TeamNames } from '../../components/ui';
import BracketView from '../../components/BracketView';
import { Field, inputClass } from '../../components/form';
import { playersApi, tournamentsApi } from '../../api/tournaments';
import { useAction } from '../../hooks/useAction';
import { addMinutes, courtName, fmtDelta, fmtNumber } from '../../lib/format';
import { PAIRING } from '../../lib/labels';
import { avgRating, buildDrawBody, initDraw, knockoutRounds, sameGroupPairs, swapCells, swapPeople, swapTeams } from '../../lib/draw';
import { matchTitle, tourCourts } from '../../lib/tournamentModel';

// Các hộp thoại của trang giải. Mỗi hộp tự tải dữ liệu xem trước (nếu cần), tự khoá nút khi gửi (useAction) và gọi
// `onDone(thôngBáo)` khi xong để trang tải lại + hiện toast. `onClose` đóng không làm gì.

const chip = (selected) => `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer ${selected ? 'border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-200' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'}`;

function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null, loading: true });
    loader().then((data) => { if (alive) setState({ data, error: null, loading: false }); }).catch((error) => { if (alive) setState({ data: null, error, loading: false }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// ---------------------------------------------------------------------------------------------------------------- bốc thăm

export function DrawDialog({ t, onClose, onDone, initialSeed }) {
  const [seed, setSeed] = useState(initialSeed);
  const preview = useLoad(() => tournamentsApi.drawPreview(t.id, seed ? { seed } : {}), [t.id, seed]);
  const [run, { busy, error }] = useAction();
  const p = preview.data;
  const [st, setSt] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (p) { setSt(initDraw(p)); setSelected(null); } }, [p]);

  const teamLevel = t.discipline === 'singles' || t.pairingMode === 'fixed';
  const title = `Bốc thăm — xem trước (${t.discipline === 'doubles' && PAIRING[t.pairingMode] ? PAIRING[t.pairingMode] : 'đơn'})`;

  const click = (loc) => {
    if (!selected) { setSelected(loc); return; }
    if (selected === loc) { setSelected(null); return; }
    const [ka] = selected.split(':');
    const [kb] = loc.split(':');
    if (ka === 'T' && kb === 'T') setSt(swapTeams(st, Number(selected.split(':')[1]), Number(loc.split(':')[1])));
    else if (ka !== 'T' && kb !== 'T') setSt(swapPeople(st, selected, loc));
    setSelected(null);
  };

  const confirm = async () => {
    const done = await run(() => tournamentsApi.draw(t.id, buildDrawBody(p, st)));
    if (done) onDone('Đã xác nhận bốc thăm — lịch thi đấu đã sinh', { tab: 'san' });
  };

  const teamName = (i) => st.teams[i].players.map((x) => x.name).join(' + ');
  const TeamItem = ({ i }) => (teamLevel
    ? <button type="button" className={chip(selected === `T:${i}`)} onClick={() => click(`T:${i}`)}>{teamName(i)} <small>{fmtNumber(avgRating(st.teams[i].players))}</small></button>
    : (
      <div className="flex flex-wrap items-center gap-2 py-1">
        <button type="button" className={chip(selected === `T:${i}`)} onClick={() => click(`T:${i}`)} title="Đổi chỗ cả đội">⇄</button>
        {st.teams[i].players.map((x, j) => (
          <button key={x.id} type="button" className={chip(selected === `t:${i}:${j}`)} onClick={() => click(`t:${i}:${j}`)}>
            {x.name} <small>{x.gender === 'female' ? 'nữ' : x.gender === 'male' ? 'nam' : ''} · {fmtNumber(x.pairingRating)}</small>
          </button>
        ))}
        <small className="text-slate-500">đội <b>{fmtNumber(avgRating(st.teams[i].players))}</b></small>
      </div>
    ));

  const schedule = () => {
    if (st.moved) return <p className="text-slate-500">Đã đổi chỗ — lịch theo lượt sẽ sinh lại theo bảng / sơ đồ mới khi xác nhận.</p>;
    const slots = [...new Set(p.matches.map((m) => m.slotNo))].filter((x) => x !== null).sort((a, b) => a - b);
    if (!slots.length) return null;
    const show = slots.slice(0, 6);
    return (
      <div>
        <h4 className="mb-1 font-bold text-slate-900 dark:text-white">Lịch theo lượt{t.startTime ? ` (bắt đầu ${t.startTime}, ${t.matchMinutes} phút / lượt)` : ''}</h4>
        {show.map((s) => (
          <div key={s} className="text-xs">
            <b>Lượt {s}{t.startTime ? ` · ${addMinutes(t.startTime, (s - 1) * t.matchMinutes)}` : ''}:</b>{' '}
            {p.matches.filter((m) => m.slotNo === s).map((m) => `${m.groupNo && st.groups.length > 1 ? `[B${m.groupNo}] ` : ''}${teamName(m.teams[0])} – ${teamName(m.teams[1])}`).join(' · ')}
          </div>
        ))}
        {slots.length > show.length && <small className="text-slate-500">… và {slots.length - show.length} lượt nữa</small>}
      </div>
    );
  };

  return (
    <Dialog
      title={title}
      size="lg"
      onClose={onClose}
      error={error || preview.error}
      actions={[
        { label: 'Bốc lại (seed khác)', onClick: () => setSeed(Math.random().toString(16).slice(2, 10)), disabled: preview.loading },
        { label: 'Xác nhận bốc thăm', variant: 'primary', busy, disabled: !st, onClick: confirm }
      ]}
    >
      {(preview.loading || !st) && !preview.error && <Spinner label="Đang bốc thăm…" />}
      {st && p && (
        <div className="space-y-3">
          <p className="text-slate-500">
            seed <code>{p.seed}</code> · {st.teams.length} đội · {p.estimate ? `${p.estimate.matches} trận, ${p.estimate.slots} lượt, khoảng ${p.estimate.minutes} phút${t.startTime ? ` (xong khoảng ${addMinutes(t.startTime, p.estimate.minutes)})` : ''}` : ''}
            {p.stats ? ` · độ lệch chuẩn điểm đội ${fmtNumber(p.stats.teamRatingStdDev, 3)}${p.stats.baselineRandomStdDev !== null ? ` (nếu bốc thuần ngẫu nhiên ≈ ${fmtNumber(p.stats.baselineRandomStdDev, 3)})` : ''}` : ''}
          </p>
          <p className="text-slate-500">{teamLevel ? 'Bấm hai đội để đổi chỗ (giữa hai bảng / hai ô sơ đồ). Cặp đã đăng ký giữ nguyên.' : 'Bấm hai người để đổi đồng đội; bấm ⇄ ở hai đội để đổi chỗ cả đội. Máy kiểm lại luật khi xác nhận (nam nữ 1+1…).'}</p>
          {p.absent.length > 0 && <Notice kind="warn"><b>Vắng — không vào bốc thăm ({p.absent.length}):</b> {p.absent.map((a) => a.name).join(', ')}. Xác nhận thì sang danh sách chờ; mở lại đăng ký thì trở lại.</Notice>}
          {st.groups.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {st.groups.map((g) => (
                <div key={g.groupNo} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <h4 className="mb-1 font-bold text-slate-900 dark:text-white">{st.groups.length > 1 ? `Bảng ${g.groupNo}` : 'Vòng tròn'}</h4>
                  <div className={teamLevel ? 'flex flex-wrap gap-2' : ''}>{g.teams.map((i) => <TeamItem key={i} i={i} />)}</div>
                </div>
              ))}
            </div>
          )}
          {st.bracket && (
            <div>
              <h4 className="mb-1 font-bold text-slate-900 dark:text-white">Sơ đồ vòng 1 ({st.bracket.length} ô)</h4>
              <div className="space-y-1">
                {Array.from({ length: st.bracket.length / 2 }, (_, k) => (
                  <div key={k} className="grid grid-cols-[4rem_1fr_1.5rem_1fr] items-center gap-2 border-b border-slate-100 py-1 dark:border-slate-800">
                    <b>Trận {k + 1}</b>
                    <div>{st.bracket[2 * k] === null ? <span className="text-slate-400">miễn đấu</span> : <TeamItem i={st.bracket[2 * k]} />}</div>
                    <span className="text-slate-400">vs</span>
                    <div>{st.bracket[2 * k + 1] === null ? <span className="text-slate-400">miễn đấu — đi thẳng vòng 2</span> : <TeamItem i={st.bracket[2 * k + 1]} />}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {schedule()}
          {st.waiting.length > 0 && (
            <div>
              <h4 className="mb-1 font-bold text-slate-900 dark:text-white">Danh sách chờ (lẻ người / lệch nam–nữ)</h4>
              <div className="flex flex-wrap gap-2">{st.waiting.map((w, k) => <button key={w.id} type="button" className={chip(selected === `w:${k}`)} onClick={() => click(`w:${k}`)}>{w.name}</button>)}</div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- khoá sơ đồ

export function KnockoutDialog({ t, onClose, onDone }) {
  const preview = useLoad(() => tournamentsApi.knockoutPreview(t.id), [t.id]);
  const [run, { busy, error }] = useAction();
  const p = preview.data;
  const [positions, setPositions] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (p) setPositions([...p.positions]); }, [p]);

  const rounds = useMemo(() => (p && positions ? knockoutRounds(p.teams, positions) : []), [p, positions]);
  const same = p && positions ? sameGroupPairs(p.teams, positions) : [];
  const onCell = (k) => {
    if (selected === null) setSelected(k);
    else if (selected === k) setSelected(null);
    else { setPositions(swapCells(positions, selected, k)); setSelected(null); }
  };
  const lock = async () => {
    const changed = positions.some((x, k) => x !== p.positions[k]);
    const done = await run(() => tournamentsApi.lockKnockout(t.id, changed ? positions : null));
    if (done) onDone('Đã khoá sơ đồ loại trực tiếp', { tab: 'san' });
  };

  return (
    <Dialog title="Sơ đồ loại trực tiếp — xem trước" size="xl" onClose={onClose} error={error || preview.error} actions={[{ label: 'Khoá sơ đồ', variant: 'primary', busy, disabled: !positions, onClick: lock }]}>
      {preview.loading && <Spinner />}
      {p && positions && (
        <>
          <p className="text-slate-500">
            Sơ đồ {p.size} ô · nhất gặp nhì, nhất – nhì cùng bảng ở hai nửa (chỉ gặp lại ở chung kết); hạt giống cao nhận lượt miễn đấu. Bấm hai ô để đổi chỗ.
          </p>
          {same.length > 0 && <Notice kind="warn"><Badge variant="amber">cùng bảng</Badge> trận {same.join(', ')} đang gặp đội cùng bảng ngay vòng 1</Notice>}
          <BracketView rounds={rounds} roundCount={Math.log2(positions.length)} pick selected={selected} onCell={onCell} title={t.name} />
        </>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- chốt giải

export function FinalizeDialog({ t, onClose, onDone }) {
  const preview = useLoad(() => tournamentsApi.finalizePreview(t.id), [t.id]);
  const [run, { busy, error }] = useAction();
  const p = preview.data;
  const confirm = async () => {
    const done = await run(() => tournamentsApi.action(t.id, 'finalize'));
    if (done) onDone('Đã chốt giải — điểm trình, BXH, thống kê đã cập nhật', { tab: 'ketqua' });
  };
  if (p && !p.ready) {
    return (
      <Dialog title="Chưa chốt được" onClose={onClose}>
        <p>{p.needsKnockout ? 'Vòng bảng xong rồi thì bấm "Sơ đồ loại trực tiếp…" (khoá sơ đồ) trước.' : `Còn ${p.pendingMatches} trận chưa có kết quả.`}</p>
      </Dialog>
    );
  }
  return (
    <Dialog title={`Chốt giải "${t.name}"`} size="lg" onClose={onClose} error={error || preview.error} actions={[{ label: 'Chốt giải', variant: 'primary', busy, disabled: !p, onClick: confirm }]}>
      {preview.loading && <Spinner />}
      {p && (
        <div className="space-y-4">
          <section>
            <h4 className="mb-1 font-bold text-slate-900 dark:text-white">Thứ hạng</h4>
            <table className="w-full text-left"><tbody>
              {p.placements.map((x) => <tr key={`${x.from}-${x.teamId}`} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1 pr-3 font-bold">{x.label}</td><td className="py-1">{x.players.map((y) => y.name).join(' + ')}</td></tr>)}
            </tbody></table>
          </section>
          <section>
            <h4 className="mb-1 font-bold text-slate-900 dark:text-white">Điểm trình trước → sau</h4>
            {p.ratingChanges.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-xs text-slate-500"><th className="py-1 pr-3">Người chơi</th><th className="py-1 pr-3">Điểm</th><th className="py-1 pr-3">Thay đổi</th><th className="py-1">Trận</th></tr></thead>
                  <tbody>
                    {p.ratingChanges.map((c) => (
                      <tr key={`${c.playerId}-${c.discipline}`} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1 pr-3">{c.name}</td>
                        <td className="py-1 pr-3 tabular-nums">{fmtNumber(c.before)} → <b>{fmtNumber(c.after)}</b></td>
                        <td className={`py-1 pr-3 font-bold tabular-nums ${c.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtDelta(c.delta)}</td>
                        <td className="py-1 text-xs text-slate-500">{c.matches != null ? `${c.matches} trận` : ''}{c.capped ? ' · bị trần' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-slate-500">Giải không tính điểm trình.</p>}
          </section>
          <section>
            <h4 className="mb-1 font-bold text-slate-900 dark:text-white">Điểm BXH thành tích</h4>
            {p.rankingEligible ? (
              <table className="w-full text-left"><tbody>
                {[...p.rankingPoints].sort((a, b) => b.points - a.points).map((x) => <tr key={`${x.playerId}-${x.category}`} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1 pr-3">{x.name}</td><td className="py-1 pr-3">{x.category}</td><td className="py-1 pr-3">{x.placement}</td><td className="py-1 font-bold">{x.points}</td></tr>)}
              </tbody></table>
            ) : <p className="text-slate-500">{p.rankingReason || 'Không trao điểm BXH'}</p>}
          </section>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- đội vắng

export function NoShowDialog({ t, onClose, onDone }) {
  const list = useLoad(() => tournamentsApi.noShows(t.id), [t.id]);
  const [run, { busy, error }] = useAction();
  const [picked, setPicked] = useState(null);
  const items = list.data ? list.data.items : [];
  useEffect(() => { if (list.data) setPicked(new Set(list.data.items.map((x) => x.id))); }, [list.data]);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = async () => {
    const res = await run(() => tournamentsApi.resolveNoShows(t.id, [...picked]));
    if (res) onDone(`Đã xử W.O. ${res.teamIds.length} đội vắng`);
  };
  return (
    <Dialog title="Xử W.O. đội vắng" onClose={onClose} error={error || list.error} actions={items.length ? [{ label: 'Xử W.O. các đội đã chọn', variant: 'danger', busy, disabled: !picked || !picked.size, onClick: submit }] : []}>
      {list.loading && <Spinner />}
      {list.data && (items.length ? (
        <>
          <p>Đội <b>chưa đánh trận nào</b> và <b>chưa đủ người điểm danh</b>. Xử W.O.: cả đội rút, trận chưa đánh thành W.O. cho đối thủ; hai đội cùng vắng gặp nhau thì trận bị huỷ (sơ đồ: đối thủ vòng sau thắng W.O.).</p>
          {items.map((x) => (
            <label key={x.id} className="flex items-center gap-2">
              <input type="checkbox" className="accent-emerald-500" checked={picked ? picked.has(x.id) : false} onChange={() => toggle(x.id)} />
              {x.players.map((p) => p.name).join(' + ')}{x.groupNo ? <small className="text-slate-500"> · bảng {x.groupNo}</small> : null}
            </label>
          ))}
        </>
      ) : <p>Không có đội nào vắng — mọi đội đã điểm danh đủ hoặc đã đánh.</p>)}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- thêm trận tay

export function AddMatchDialog({ t, onClose, onDone }) {
  const teams = useLoad(() => tournamentsApi.teams(t.id), [t.id]);
  const [run, { busy, error }] = useAction();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [label, setLabel] = useState('Trận thêm');
  const list = teams.data ? teams.data.items.filter((x) => !x.withdrawn) : [];
  useEffect(() => { if (list.length >= 2 && !a) { setA(list[0].id); setB(list[1].id); } }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (x) => x.players.map((p) => p.name).join(' + ');
  const submit = async () => {
    if (a === b) return;
    const done = await run(() => tournamentsApi.addMatch(t.id, { teamAId: a, teamBId: b, label: label.trim() || 'Trận thêm' }));
    if (done) onDone('Đã thêm trận');
  };
  return (
    <Dialog title="Thêm trận tay" onClose={onClose} error={error || teams.error} actions={[{ label: 'Thêm trận', variant: 'primary', busy, disabled: !a || a === b, onClick: submit }]}>
      <p className="text-slate-500">Trận thêm (vd đánh lại, giao hữu trong giải) — không thuộc bảng / sơ đồ.</p>
      {teams.loading && <Spinner />}
      {teams.data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inputClass} flex-1`} value={a} onChange={(e) => setA(e.target.value)} aria-label="Đội A">{list.map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}</select>
            <span>vs</span>
            <select className={`${inputClass} flex-1`} value={b} onChange={(e) => setB(e.target.value)} aria-label="Đội B">{list.map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}</select>
          </div>
          {a && a === b && <Notice kind="warn">Chọn hai đội khác nhau.</Notice>}
          <Field label="Tên trận"><input className={inputClass} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- sân của giải

export function CourtsDialog({ t, branchCourts, onClose, onDone }) {
  const [run, { busy, error }] = useAction();
  const [picked, setPicked] = useState(() => new Set(tourCourts(t)));
  const refs = useMemo(() => {
    const known = branchCourts.map((c) => ({ ref: c.ref, name: c.name }));
    for (const ref of picked) if (!known.some((k) => k.ref === ref)) known.push({ ref, name: courtName(ref) });
    return known;
  }, [branchCourts, picked]);
  const toggle = (ref) => setPicked((s) => { const n = new Set(s); if (n.has(ref)) n.delete(ref); else n.add(ref); return n; });
  const save = async () => {
    const done = await run(() => tournamentsApi.setCourts(t.id, [...picked]));
    if (done) onDone('Đã cập nhật sân của giải');
  };
  return (
    <Dialog title="Sân của giải" onClose={onClose} error={error} actions={[{ label: 'Lưu', variant: 'primary', busy, disabled: !picked.size, onClick: save }]}>
      <p className="text-slate-500">"Gọi ra sân" chỉ vào các sân này. Sân đang có trận không bỏ ra được.</p>
      <div className="flex flex-wrap gap-2">
        {refs.map((c) => (
          <label key={c.ref} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 ${picked.has(c.ref) ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700'}`}>
            <input type="checkbox" className="accent-emerald-500" checked={picked.has(c.ref)} onChange={() => toggle(c.ref)} /> {c.name}
          </label>
        ))}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- đổi đồng đội

export function PartnerDialog({ t, entry, entries, onClose, onDone }) {
  const players = useLoad(() => playersApi.list(), [t.id]);
  const [run, { busy, error }] = useAction();
  const [pick, setPick] = useState('');
  const taken = new Set(entries.filter((e) => e.status !== 'withdrawn').map((e) => e.playerId));
  const old = entries.find((e) => e.playerId === entry.partnerPlayerId);
  const options = players.data ? players.data.items.filter((p) => !taken.has(p.id)).sort((x, y) => x.displayName.localeCompare(y.displayName, 'vi')) : [];
  const submit = async () => {
    const done = await run(() => tournamentsApi.changePartner(t.id, entry.id, pick));
    if (done) onDone('Đã đổi đồng đội');
  };
  return (
    <Dialog title={`Đổi đồng đội của ${entry.name}`} onClose={onClose} error={error || players.error} actions={[{ label: 'Đổi đồng đội', variant: 'primary', busy, disabled: !pick, onClick: submit }]}>
      <p>Đồng đội hiện tại: <b>{old ? old.name : '—'}</b> — sẽ rời giải. Người mới vào đúng chỗ của cặp (giữ thứ tự đăng ký), kiểm lại điều kiện như lúc đăng ký.</p>
      {players.loading ? <Spinner /> : (
        <select className={inputClass} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Đồng đội mới">
          <option value="">— Đồng đội mới —</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------- gọi ra sân

/** Gọi một trận cụ thể ra sân: chọn sân trống của giải. */
export function ChooseCourtDialog({ match, freeCourts, blockedBy, onClose, onCall }) {
  return (
    <Dialog title="Gọi ra sân" onClose={onClose}>
      <p>{matchTitle(match)}: <b><TeamNames team={match.teamA} /></b> vs <b><TeamNames team={match.teamB} /></b></p>
      {blockedBy
        ? <Notice kind="warn">Chưa gọi được: {blockedBy}. Một người không thể ở hai sân — chờ trận đó xong.</Notice>
        : freeCourts.length
          ? <div className="flex flex-wrap gap-2">{freeCourts.map((c) => <Button key={c} onClick={() => onCall(match, c)}>{courtName(c)}</Button>)}</div>
          : <Notice kind="warn">Không còn sân trống của giải — chờ một sân xong hoặc thêm sân ở "Thêm ▾ → Sân của giải".</Notice>}
    </Dialog>
  );
}

/** Sân trống: chọn trận khác với gợi ý. Danh sách lấy MỚI lúc mở hộp (không dùng bản cũ trong trang). */
export function PickMatchDialog({ t, court, onClose, onCall }) {
  const next = useLoad(() => tournamentsApi.nextMatches(t.id, 20), [t.id]);
  const items = next.data ? next.data.items : [];
  return (
    <Dialog title={`Chọn trận cho ${courtName(court)}`} size="lg" onClose={onClose} error={next.error}>
      {next.loading && <Spinner />}
      {next.data && (items.length ? (
        <>
          <p className="text-slate-500">Các trận gọi được (mọi người đều rảnh), theo thứ tự ưu tiên.</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((it) => (
              <div key={it.match.id} className="grid gap-2 py-2 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
                <div className="text-xs text-slate-500">{matchTitle(it.match)}{it.match.expectedTime ? <><br />dự kiến {it.match.expectedTime}</> : null}</div>
                <div><TeamNames team={it.match.teamA} /> <span className="text-slate-400">vs</span> <TeamNames team={it.match.teamB} /> <small className="ml-2 text-slate-500">{it.restMinutes === null ? 'chưa đánh trận nào' : `nghỉ ${it.restMinutes} phút`}</small></div>
                <Button className="!px-3 !py-1 !text-xs" onClick={() => onCall(it.match, court)}>Gọi ra {courtName(court)}</Button>
              </div>
            ))}
          </div>
        </>
      ) : <p>Chưa có trận nào gọi được.</p>)}
    </Dialog>
  );
}

