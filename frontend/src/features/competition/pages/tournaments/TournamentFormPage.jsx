import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { useBranch } from '../../../../contexts/BranchContext';
import { tournamentsApi } from '../../api/tournaments';
import { useAction } from '../../hooks/useAction';
import { useCourts } from '../../hooks/useCourts';
import { useCourtUsage } from '../../hooks/useCourtUsage';
import { useCompetition } from '../../context/CompetitionContext';
import { permissionsFor } from '../../lib/permissions';
import { FORMAT, MATCH_MINUTES, SCORING_PRESETS } from '../../lib/labels';
import { addMinutes, courtName, orgName } from '../../lib/format';
import { Button, Card, Notice, PageHeader } from '../../components/ui';
import { Check, Field, Fieldset, inputClass } from '../../components/form';

// Tạo giải — 4 phần như wizard ở docs/06 mục 2, gom trên một trang (điện thoại cuộn dọc): (1) thông tin + sân, (2) nội dung & điều kiện,
// (3) thể thức + luật điểm, (4) xem lại — gọi /tournaments/advice để gợi ý thể thức và ước tính số trận / thời gian theo số đội dự kiến
// và số sân đã chọn. Sân đang được buổi / giải khác dùng ghi rõ và không chọn sẵn.

const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

const INITIAL = {
  name: '', startsOn: today(), startTime: '18:00', tier: 'club', description: '', courts: null,
  discipline: 'doubles', genderRule: 'open', pairingMode: 'fixed', ruleScope: '', ruleMin: '', ruleMax: '', maxEntries: '', checkInRequired: false,
  format: '', groupCount: '', advancePerGroup: '', groupMode: 'seeded', thirdPlaceMatch: false,
  scoring: '1x21', matchMinutes: 15, rated: true, ranked: true, teams: 8
};

/** Dựng body POST /tournaments từ form — hàm thuần để test. */
export const buildTournamentBody = (f, { organizerRef, advice }) => {
  const doubles = f.discipline === 'doubles';
  const format = f.format || (advice && advice.format);
  if (!format) return { error: 'Chưa chọn được thể thức — xem lại số đội dự kiến.' };
  if (!f.courts || !f.courts.length) return { error: 'Chọn ít nhất một sân của giải.' };
  const body = {
    organizerRef,
    name: f.name.trim(),
    startsOn: f.startsOn,
    startTime: f.startTime || null,
    tier: f.tier,
    description: f.description.trim() || null,
    discipline: f.discipline,
    genderRule: f.genderRule,
    pairingMode: doubles ? f.pairingMode : 'fixed',
    maxEntries: f.maxEntries ? Number(f.maxEntries) : null,
    checkInRequired: f.checkInRequired,
    format,
    thirdPlaceMatch: format !== 'round_robin' && f.thirdPlaceMatch,
    scoring: f.scoring,
    courtRefs: f.courts,
    matchMinutes: Number(f.matchMinutes),
    rated: f.rated,
    ranked: f.ranked
  };
  if (format === 'groups_knockout') {
    body.groupCount = f.groupCount ? Number(f.groupCount) : null;
    body.advancePerGroup = f.advancePerGroup ? Number(f.advancePerGroup) : null;
    body.groupMode = f.groupMode;
  }
  if (f.ruleScope) body.ratingRule = { scope: f.ruleScope, min: f.ruleMin ? Number(f.ruleMin) : null, max: f.ruleMax ? Number(f.ruleMax) : null };
  return { body };
};

export default function TournamentFormPage() {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch() || {};
  const { toast } = useCompetition();
  const navigate = useNavigate();
  const perms = permissionsFor(user);
  const { courts: branchCourts } = useCourts();
  const { usage, loaded: usageLoaded } = useCourtUsage();
  const [f, setF] = useState(INITIAL);
  const [advice, setAdvice] = useState(null);
  const [adviceError, setAdviceError] = useState(null);
  const [run, { busy, error }] = useAction();
  const set = (patch) => setF((s) => ({ ...s, ...patch }));

  const branchId = selectedBranchId || user?.employee?.branchId || null;
  const organizerRef = branchId ? `bd:branch:${branchId}` : null;
  const doubles = f.discipline === 'doubles';
  const fixed = doubles && f.pairingMode === 'fixed';

  // Chọn sẵn tối đa 2 sân không đang dùng (live) khi đã tải được danh sách sân + mức dùng sân.
  useEffect(() => {
    // Đợi biết sân nào đang bận rồi mới chọn sẵn (chọn trước khi tải xong thì lỡ chọn sân đang có buổi giao lưu).
    if (f.courts !== null || !branchCourts.length || !usageLoaded) return;
    const free = branchCourts.filter((c) => c.status !== 'maintenance' && !(usage.get(c.ref) && usage.get(c.ref).live)).slice(0, 2).map((c) => c.ref);
    set({ courts: free });
  }, [branchCourts, usage, usageLoaded, f.courts]);

  // Ràng buộc giữa các ô: giải đơn không có nam nữ / ghép đôi; tổng trình cặp chỉ cho đôi cặp sẵn.
  useEffect(() => {
    if (!doubles && f.genderRule === 'mixed') set({ genderRule: 'open' });
    if (!fixed && f.ruleScope === 'team_sum') set({ ruleScope: 'player' });
  }, [doubles, fixed, f.genderRule, f.ruleScope]);

  // Gợi ý thể thức + ước tính, gọi lại 250 ms sau khi ngừng gõ.
  const timer = useRef(null);
  const adviceInput = useMemo(() => ({
    teams: Number(f.teams) || 2,
    courts: (f.courts || []).length || 1,
    matchMinutes: Number(f.matchMinutes) || 15,
    thirdPlace: f.thirdPlaceMatch,
    ...(f.format ? { format: f.format } : {}),
    ...(f.groupCount ? { groupCount: Number(f.groupCount) } : {}),
    ...(f.advancePerGroup ? { advancePerGroup: Number(f.advancePerGroup) } : {})
  }), [f.teams, f.courts, f.matchMinutes, f.thirdPlaceMatch, f.format, f.groupCount, f.advancePerGroup]);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      tournamentsApi.advice(adviceInput).then((a) => { setAdvice(a); setAdviceError(null); }).catch((e) => { setAdvice(null); setAdviceError(e); });
    }, 250);
    return () => clearTimeout(timer.current);
  }, [adviceInput]);

  const format = f.format || (advice && advice.format);
  const end = advice && f.startTime ? addMinutes(f.startTime, advice.estimate.minutes) : '';
  const busyPicked = (f.courts || []).filter((c) => usage.get(c) && usage.get(c).live);
  const toggleCourt = (ref) => set({ courts: (f.courts || []).includes(ref) ? f.courts.filter((c) => c !== ref) : [...(f.courts || []), ref] });

  const submit = async (openNow) => {
    const built = buildTournamentBody(f, { organizerRef, advice });
    if (built.error) { toast(built.error, 'error'); return; }
    const created = await run(async () => {
      const t = await tournamentsApi.create(built.body);
      if (openNow) await tournamentsApi.action(t.id, 'open');
      return t;
    });
    if (!created) return;
    toast(openNow ? 'Đã tạo giải và mở đăng ký — đăng ký các cặp ở tab "Đăng ký"' : 'Đã tạo giải (nháp)');
    navigate(`/competition/tournaments/${created.id}`, { replace: true });
  };

  if (!perms.canManageTournaments) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <Notice kind="warn">Chỉ quản lý hoặc admin được tạo giải. <Link className="font-bold underline" to="/competition/tournaments">Về danh sách giải</Link></Notice>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <PageHeader title="Tạo giải đấu" subtitle={organizerRef ? orgName(organizerRef) : 'Chưa xác định chi nhánh'} actions={<Link to="/competition/tournaments" className="text-sm font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Danh sách giải</Link>} />
      {!organizerRef && <Notice kind="warn">Không xác định được chi nhánh của tài khoản — chọn chi nhánh ở thanh trên rồi thử lại.</Notice>}

      <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(true); }}>
        <Fieldset legend="1. Thông tin">
          <Field label="Tên giải">
            <input className={inputClass} required minLength={3} maxLength={120} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Giải đôi CLB tối thứ Bảy" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ngày"><input type="date" className={inputClass} required value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} /></Field>
            <Field label="Giờ bắt đầu"><input type="time" className={inputClass} value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
            <Field label="Cấp giải">
              <select className={inputClass} value={f.tier} onChange={(e) => set({ tier: e.target.value })}>
                <option value="club">CLB</option>
                <option value="open">Mở rộng</option>
                {perms.role === 'admin' && <option value="chain">Toàn chuỗi</option>}
              </select>
            </Field>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Sân của giải</p>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">"Gọi ra sân" chỉ vào các sân này. Sân đang được buổi / giải khác dùng có ghi chú và không chọn sẵn.</p>
            <div className="flex flex-wrap gap-2">
              {branchCourts.map((c) => {
                const u = usage.get(c.ref);
                const on = (f.courts || []).includes(c.ref);
                return (
                  <label key={c.ref} title={u ? u.label : ''} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${on ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700'}`}>
                    <input type="checkbox" className="accent-emerald-500" checked={on} onChange={() => toggleCourt(c.ref)} />
                    {c.name}
                    {u && <small className={u.live ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-slate-500'}>{u.live ? '(đang dùng)' : '(giải khác cũng chọn)'}</small>}
                  </label>
                );
              })}
              {!branchCourts.length && <small className="text-slate-500">Chưa tải được danh sách sân của chi nhánh.</small>}
            </div>
          </div>
          <Field label="Điều lệ"><textarea className={inputClass} rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="(không bắt buộc)" /></Field>
        </Fieldset>

        <Fieldset legend="2. Nội dung & điều kiện">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nội dung">
              <select className={inputClass} value={f.discipline} onChange={(e) => set({ discipline: e.target.value })}>
                <option value="doubles">Đôi</option>
                <option value="singles">Đơn</option>
              </select>
            </Field>
            <Field label="Giới">
              <select className={inputClass} value={f.genderRule} onChange={(e) => set({ genderRule: e.target.value })}>
                <option value="open">Tự do</option>
                <option value="men">Nam</option>
                <option value="women">Nữ</option>
                <option value="mixed" disabled={!doubles}>Nam nữ</option>
              </select>
            </Field>
            {doubles && (
              <Field label="Cách ghép đôi">
                <select className={inputClass} value={f.pairingMode} onChange={(e) => set({ pairingMode: e.target.value })}>
                  <option value="fixed">Cặp đăng ký sẵn</option>
                  <option value="random_balanced">Bốc thăm ghép cặp cân bằng</option>
                </select>
              </Field>
            )}
          </div>
          {doubles && <p className="text-xs text-slate-500 dark:text-slate-400">{fixed ? 'Hai người đăng ký chung một đội — bốc thăm giữ nguyên cặp.' : 'Đăng ký từng người; bốc thăm ghép cặp cân bằng theo điểm trình (nam nữ luôn 1 + 1).'}</p>}
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Điều kiện trình">
              <select className={inputClass} value={f.ruleScope} onChange={(e) => set({ ruleScope: e.target.value })}>
                <option value="">Không giới hạn</option>
                <option value="player">Từng người</option>
                <option value="team_sum" disabled={!fixed}>Tổng trình cặp</option>
              </select>
            </Field>
            {f.ruleScope && <Field label="Từ"><input type="number" step="0.1" min="1" max="14" className={inputClass} value={f.ruleMin} onChange={(e) => set({ ruleMin: e.target.value })} /></Field>}
            {f.ruleScope && <Field label="Đến"><input type="number" step="0.1" min="1" max="14" className={inputClass} value={f.ruleMax} onChange={(e) => set({ ruleMax: e.target.value })} /></Field>}
            <Field label={`Tối đa (${doubles ? 'người' : 'người'})`} hint="Trống = không giới hạn; quá → danh sách chờ.">
              <input type="number" min="2" max="512" className={inputClass} value={f.maxEntries} onChange={(e) => set({ maxEntries: e.target.value })} />
            </Field>
          </div>
          <Check checked={f.checkInRequired} onChange={(v) => set({ checkInRequired: v })}>
            <b>Bốc thăm tại sân</b> — chỉ bốc những người đã điểm danh (đôi cặp sẵn cần cả hai người); không bật thì bốc trước, ngày thi đấu đội vắng xử W.O.
          </Check>
        </Fieldset>

        <Fieldset legend="3. Thể thức & luật điểm">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Thể thức">
              <select className={inputClass} value={f.format} onChange={(e) => set({ format: e.target.value })}>
                <option value="">Theo gợi ý</option>
                <option value="round_robin">Vòng tròn</option>
                <option value="groups_knockout">Vòng bảng + loại trực tiếp</option>
                <option value="knockout">Loại trực tiếp</option>
              </select>
            </Field>
            {format === 'groups_knockout' && (
              <>
                <Field label="Số bảng"><input type="number" min="2" max="16" className={inputClass} placeholder="tự" value={f.groupCount} onChange={(e) => set({ groupCount: e.target.value })} /></Field>
                <Field label="Đi tiếp mỗi bảng">
                  <select className={inputClass} value={f.advancePerGroup} onChange={(e) => set({ advancePerGroup: e.target.value })}>
                    <option value="">tự</option><option value="1">1</option><option value="2">2</option>
                  </select>
                </Field>
                <Field label="Chia bảng">
                  <select className={inputClass} value={f.groupMode} onChange={(e) => set({ groupMode: e.target.value })}>
                    <option value="seeded">Rải hạt giống</option><option value="level">Theo trình</option>
                  </select>
                </Field>
              </>
            )}
          </div>
          {format && format !== 'round_robin' && <Check checked={f.thirdPlaceMatch} onChange={(v) => set({ thirdPlaceMatch: v })}>Có trận tranh hạng 3</Check>}
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Luật điểm">
              <select className={inputClass} value={f.scoring} onChange={(e) => set({ scoring: e.target.value, matchMinutes: MATCH_MINUTES[e.target.value] || 15 })}>
                {SCORING_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Phút / trận"><input type="number" min="5" max="240" className={inputClass} value={f.matchMinutes} onChange={(e) => set({ matchMinutes: e.target.value })} /></Field>
            <div className="flex flex-col justify-end gap-2 sm:col-span-2">
              <Check checked={f.rated} onChange={(v) => set({ rated: v })}>Tính điểm trình</Check>
              <Check checked={f.ranked} onChange={(v) => set({ ranked: v })}>Tính điểm BXH thành tích</Check>
            </div>
          </div>
        </Fieldset>

        <Fieldset legend="4. Xem lại">
          <Field label={`Số ${doubles ? 'đội' : 'người'} dự kiến`}>
            <input type="number" min="2" max="256" className={`${inputClass} max-w-[8rem]`} value={f.teams} onChange={(e) => set({ teams: e.target.value })} />
          </Field>
          <Card className="!rounded-2xl !p-4">
            {adviceError && <Notice error={adviceError} />}
            {advice && (
              <div className="space-y-1 text-sm" data-testid="advice">
                <p>
                  Thể thức <b>{FORMAT[advice.format]}</b>
                  {f.format ? (advice.suggestedFormat !== advice.format && <small className="text-slate-500"> (gợi ý cho {f.teams} {doubles ? 'đội' : 'người'}: {FORMAT[advice.suggestedFormat]})</small>) : <small className="text-slate-500"> (gợi ý)</small>}
                  {advice.groupCount ? ` · ${advice.groupCount} bảng (${advice.groupSizes.join(' / ')}), đi tiếp ${advice.advancePerGroup} / bảng` : ''}
                </p>
                <p>
                  Ước tính <b>{advice.estimate.matches} trận</b>, {advice.estimate.slots} lượt trên {adviceInput.courts} sân ≈ <b>{advice.estimate.minutes} phút</b>
                  {end ? <> — bắt đầu {f.startTime}, xong khoảng <b>{end}</b></> : null}
                </p>
                {busyPicked.length > 0 && (
                  <p className="font-semibold text-amber-600 dark:text-amber-400">{busyPicked.map(courtName).join(', ')}: {usage.get(busyPicked[0]).label} — trận có thể phải chờ sân</p>
                )}
              </div>
            )}
          </Card>
        </Fieldset>

        {error && <Notice error={error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" busy={busy} disabled={!organizerRef} onClick={() => submit(false)}>Tạo (nháp)</Button>
          <Button type="submit" busy={busy} disabled={!organizerRef}>Tạo và mở đăng ký</Button>
        </div>
      </form>
    </div>
  );
}
