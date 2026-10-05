import React, { useEffect, useMemo, useState } from 'react';
import { ratingApi } from '../api/tournaments';
import { useAction } from '../hooks/useAction';
import { answeredCount, buildAssessmentBody, capExplanation, clearDraft, criteriaOnPage, firstIncomplete, loadDraft, pageComplete, profileError, ratingOf, saveDraft, stepsOf } from '../lib/rating';
import { fmtNumber } from '../lib/format';
import { Button, Notice, Spinner } from './ui';
import { Field, inputClass } from './form';
import { RatingCard } from './RatingCards';

// Form chấm trình (docs/03 mục 2.4, 07): [0] Thông tin chơi → [1]–[4] mỗi trang 3 tiêu chí × 5 thẻ mô tả → [5] Xem lại + điểm xem trước
// (gọi `POST /assessments/preview`, không lưu) → [6] Kết quả. Dùng chung cho nhân viên (`mode="staff"`: có ô ghi chú, không trần 4.5) và khách
// (`mode="self"`). Bản nháp tự lưu trên máy. `locked` (chuỗi lý do) → chỉ xem. `submit(body)` trả { result, player }.

const OPTIONS = {
  dominantHand: [['', '—'], ['right', 'Tay phải'], ['left', 'Tay trái']],
  preferredPlay: [['', '—'], ['singles', 'Đơn'], ['doubles', 'Đôi'], ['both', 'Cả hai']],
  doublesPosition: [['', '—'], ['front', 'Gần lưới'], ['back', 'Cuối sân'], ['both', 'Linh hoạt']]
};

function ProfileStep({ profile, setProfile, locked }) {
  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Giới tính <span className="text-rose-500">*</span></p>
        <div className="mt-1 flex gap-2">
          {[['male', 'Nam'], ['female', 'Nữ']].map(([value, label]) => (
            <button key={value} type="button" disabled={locked} data-gender={value} aria-pressed={profile.gender === value} onClick={() => set({ gender: value })}
              className={`rounded-xl border px-5 py-2 text-sm font-bold transition ${profile.gender === value ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Năm sinh" hint="Chỉ để chia nhóm tuổi trên bảng xếp hạng."><input type="number" inputMode="numeric" className={inputClass} disabled={locked} value={profile.birthYear ?? ''} onChange={(e) => set({ birthYear: e.target.value })} placeholder="1990" /></Field>
        <Field label="Năm bắt đầu chơi"><input type="number" inputMode="numeric" className={inputClass} disabled={locked} value={profile.playingSinceYear ?? ''} onChange={(e) => set({ playingSinceYear: e.target.value })} /></Field>
        <Field label="Số buổi mỗi tuần"><input type="number" inputMode="numeric" min="0" max="14" className={inputClass} disabled={locked} value={profile.sessionsPerWeek ?? ''} onChange={(e) => set({ sessionsPerWeek: e.target.value })} /></Field>
        {[['dominantHand', 'Tay thuận'], ['preferredPlay', 'Thường đánh'], ['doublesPosition', 'Vị trí ưa thích khi đánh đôi']].map(([key, label]) => (
          <Field key={key} label={label}>
            <select className={inputClass} disabled={locked} value={profile[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })}>
              {OPTIONS[key].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        ))}
      </div>
    </div>
  );
}

function CriteriaStep({ rubric, page, answers, setAnswers, locked }) {
  return (
    <div className="space-y-6">
      {criteriaOnPage(rubric, page).map((c) => (
        <fieldset key={c.code} data-criterion={c.code}>
          <legend className="mb-2 text-base font-bold text-slate-900 dark:text-white">
            {c.name} {c.gate && <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">tiêu chí then chốt</span>}
          </legend>
          <div className="grid gap-2">
            {c.anchors.map((a) => {
              const on = answers[c.code] === a.level;
              return (
                <button
                  key={a.level}
                  type="button"
                  disabled={locked}
                  data-code={c.code}
                  data-level={a.level}
                  aria-pressed={on}
                  onClick={() => setAnswers((x) => ({ ...x, [c.code]: a.level }))}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${on ? 'border-emerald-500 bg-emerald-500/10 text-slate-900 dark:text-white' : 'border-slate-300 hover:border-emerald-500/60 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'}`}
                >
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${on ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{a.level}</span>
                  <span>{a.text}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function ReviewStep({ rubric, answers, preview, mode, note, setNote, onJump, locked }) {
  const p = preview.data;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {rubric.criteria.map((c) => (
              <tr key={c.code} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3 font-semibold">{c.name}</td>
                <td className="py-1.5 pr-3 tabular-nums">mức <b>{answers[c.code] ?? '—'}</b></td>
                <td className="py-1.5 text-right">{!locked && <button type="button" className="text-xs font-bold text-emerald-600 hover:underline" onClick={() => onJump(c.page)}>Sửa</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h4 className="mb-2 font-bold text-slate-900 dark:text-white">Điểm xem trước <small className="font-normal text-slate-500">(chưa lưu)</small></h4>
        {preview.loading && <Spinner label="Đang tính…" />}
        {preview.error && <Notice error={preview.error} />}
        {p && (
          <div className="space-y-2" data-testid="preview">
            <div className="grid gap-3 sm:grid-cols-2">
              {['singles', 'doubles'].map((d) => (
                <div key={d} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800" data-preview={d}>
                  <b>{d === 'singles' ? 'Đơn' : 'Đôi'}</b>: <span className="text-2xl font-black tabular-nums">{fmtNumber(p[d].rating)}</span> <span className="font-bold text-emerald-600 dark:text-emerald-400">{p[d].level}</span>
                  {capExplanation(p[d], p, rubric) && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{capExplanation(p[d], p, rubric)}</p>}
                </div>
              ))}
            </div>
            {p.needsVerification && <Notice kind="warn">Bài này sẽ được đánh dấu <b>cần nhân viên xác nhận</b> (điểm kỹ năng cao hoặc vượt mức tự chấm).</Notice>}
            {mode === 'self' && <p className="text-xs text-slate-500">Tự chấm có trần 4.5 và là điểm tạm — tham gia giải / buổi giao lưu có tính điểm để điểm được hiệu chỉnh theo kết quả thật.</p>}
          </div>
        )}
      </div>
      {mode === 'staff' && !locked && (
        <Field label="Ghi chú (không bắt buộc)"><textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Chấm khi nào, dựa trên gì…" /></Field>
      )}
    </div>
  );
}

export default function AssessmentWizard({ rubric, mode = 'staff', who, initialProfile = {}, hasGender = false, locked = '', submit, onFinish, extra }) {
  const steps = useMemo(() => stepsOf(rubric), [rubric]);
  const draft = useMemo(() => loadDraft(who), [who]);
  const [stepNo, setStepNo] = useState(0);
  const [answers, setAnswers] = useState(() => (draft && draft.answers) || {});
  const [profile, setProfile] = useState(() => ({ ...initialProfile, ...((draft && draft.profile) || {}) }));
  const [note, setNote] = useState('');
  const [restored, setRestored] = useState(Boolean(draft && Object.keys(draft.answers || {}).length));
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState({ data: null, loading: false, error: null });
  const [run, { busy, error }] = useAction();
  const [localError, setLocalError] = useState('');

  const step = steps[stepNo];
  const done = answeredCount(rubric, answers);

  useEffect(() => { if (!result && !locked) saveDraft(who, { answers, profile }); }, [answers, profile, who, result, locked]);

  // Vào bước "Xem lại" thì tính thử điểm (không lưu).
  useEffect(() => {
    if (!step || step.key !== 'review' || firstIncomplete(rubric, answers)) return undefined;
    let alive = true;
    setPreview({ data: null, loading: true, error: null });
    ratingApi.preview({ rubricVersion: rubric.version, answers, source: mode })
      .then((data) => { if (alive) setPreview({ data, loading: false, error: null }); })
      .catch((e) => { if (alive) setPreview({ data: null, loading: false, error: e }); });
    return () => { alive = false; };
  }, [step && step.key, rubric, answers, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = () => {
    if (step.key === 'profile') return !profileError(profile, { hasGender });
    if (step.page) return pageComplete(rubric, step.page, answers);
    if (step.key === 'review') return !firstIncomplete(rubric, answers);
    return false;
  };
  const next = () => {
    setLocalError('');
    if (step.key === 'profile') { const err = profileError(profile, { hasGender }); if (err) { setLocalError(err); return; } }
    setStepNo((n) => Math.min(n + 1, steps.length - 1));
  };
  const jumpToPage = (page) => setStepNo(steps.findIndex((s) => s.page === page));

  const save = async () => {
    const body = buildAssessmentBody({ rubric, answers, profile, note });
    const res = await run(() => submit(body));
    if (res === undefined) return;
    clearDraft(who);
    setResult(res);
    setStepNo(steps.length - 1);
  };

  const discard = () => { clearDraft(who); setAnswers({}); setRestored(false); setStepNo(0); };

  return (
    <div className="space-y-4" data-testid="wizard">
      {locked && <Notice kind="warn">{locked}</Notice>}
      {restored && !locked && !result && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-800 dark:text-sky-200">
          <span>Đã khôi phục bản nháp chưa gửi ({done}/{rubric.criteria.length} tiêu chí).</span>
          <button type="button" className="text-xs font-bold underline" onClick={discard}>Bỏ bản nháp, làm lại</button>
        </div>
      )}

      <ol className="flex flex-wrap gap-1.5" aria-label="Các bước">
        {steps.map((s, i) => (
          <li key={s.key} className={`rounded-full border px-3 py-1 text-xs font-bold ${i === stepNo ? 'border-emerald-500 bg-emerald-500 text-slate-950' : i < stepNo ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`} aria-current={i === stepNo ? 'step' : undefined}>
            {i + 1}. {s.title}
          </li>
        ))}
      </ol>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={done} aria-valuemax={rubric.criteria.length}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(done / rubric.criteria.length) * 100}%` }} />
      </div>

      <section aria-label={step.title}>
        <h3 className="mb-1 text-lg font-black text-slate-900 dark:text-white">{step.title}</h3>
        {step.page && <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{rubric.instructions}</p>}
        {step.key === 'profile' && <ProfileStep profile={profile} setProfile={setProfile} locked={Boolean(locked)} />}
        {step.page && <CriteriaStep rubric={rubric} page={step.page} answers={answers} setAnswers={setAnswers} locked={Boolean(locked)} />}
        {step.key === 'review' && <ReviewStep rubric={rubric} answers={answers} preview={preview} mode={mode} note={note} setNote={setNote} onJump={jumpToPage} locked={Boolean(locked)} />}
        {step.key === 'result' && result && (
          <div className="space-y-3" data-testid="wizard-result">
            <div className="grid gap-4 sm:grid-cols-2">
              {['singles', 'doubles'].map((d) => (
                <RatingCard
                  key={d}
                  discipline={d}
                  rating={ratingOf(result.player, d) || (result.result && result.result[d] ? { rating: result.result[d].rating, level: result.result[d].level, reliability: 0, ratedMatches: 0, verified: mode === 'staff', provisional: true } : null)}
                />
              ))}
            </div>
            <Notice kind="ok">{mode === 'staff' ? 'Đã lưu bài chấm.' : 'Đã ghi nhận bài tự chấm — điểm này là tạm tính, chưa xác thực.'} {result.assessment && result.assessment.status === 'recorded' ? 'Người chơi đã có trận tính điểm nên điểm hiện tại không đổi.' : ''}</Notice>
            {mode === 'self' && <p className="text-sm text-slate-500">Tham gia giải / buổi giao lưu có tính điểm để điểm được hiệu chỉnh theo kết quả thật.</p>}
            {onFinish && <Button onClick={onFinish}>Xong</Button>}
          </div>
        )}
      </section>

      {(localError || error) && <Notice error={localError ? null : error} kind="error">{localError}</Notice>}

      {step.key !== 'result' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex gap-2">
            <Button variant="secondary" disabled={stepNo === 0} onClick={() => { setLocalError(''); setStepNo((n) => Math.max(0, n - 1)); }}>← Quay lại</Button>
            {extra}
          </div>
          {step.key === 'review'
            ? !locked && <Button busy={busy} disabled={!canNext() || !preview.data} onClick={save}>{mode === 'staff' ? 'Lưu bài chấm' : 'Gửi bài tự chấm'}</Button>
            : <Button disabled={!canNext()} onClick={next}>Tiếp →</Button>}
        </div>
      )}
    </div>
  );
}
