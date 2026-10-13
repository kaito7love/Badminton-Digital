import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Dialog } from '../Dialog';
import { Notice, Spinner } from '../ui';
import { Field, inputClass } from '../form';
import { meApi } from '../../api/tournaments';
import { partnersApi, publicTournamentsApi } from '../../api/publicApi';
import { useAction } from '../../hooks/useAction';
import { disciplineLabel } from '../../lib/publicHub';
import {
  GUEST_GENDERS, GUEST_LEVELS, buildRegisterBody, canSearchPartners, emptyGuest, feeSummary, guestFieldErrors, hasRatingFor, partnerProblem,
  registerErrorHint, validateGuestForm
} from '../../lib/registerFlow';

// Hộp thoại "Đăng ký giải" của khách (plan 27, p4). Giải đơn: xác nhận một bấm. Giải đôi cặp cố định: chọn đồng đội — người ĐÃ có trong hệ thống
// (tìm theo tên, tôn trọng quyền riêng tư) hoặc người CHƯA có tài khoản (tên + SĐT + giới tính + mức trình) — rồi nhận cả hai người trong MỘT lần.
// Người chưa có điểm trình phải tự chấm trước (service từ chối NEEDS_ASSESSMENT) — hộp thoại báo sớm và dẫn sang trang tự chấm.

const SEARCH_DELAY_MS = 300;

const modeBtn = (active) => `flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition ${active ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`;

const GENDER_TEXT = { male: 'nam', female: 'nữ' };

/** Ô tìm đồng đội: gõ ≥ 2 ký tự → hỏi service (chỉ người mà thành viên được thấy) → chọn một dòng. */
function PartnerSearch({ picked, onPick, disabled }) {
  const [text, setText] = useState('');
  const [state, setState] = useState({ items: [], loading: false, error: null, asked: '' });
  const seq = useRef(0);

  useEffect(() => {
    if (!canSearchPartners(text)) { setState({ items: [], loading: false, error: null, asked: '' }); return undefined; }
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      partnersApi.search(text.trim())
        .then((res) => { if (mine === seq.current) setState({ items: res.items || [], loading: false, error: null, asked: text.trim() }); })
        .catch((err) => { if (mine === seq.current) setState({ items: [], loading: false, error: err, asked: text.trim() }); });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  if (picked) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-2" data-testid="partner-picked">
        <span className="font-bold text-slate-900 dark:text-white">{picked.name}{picked.nickname && picked.nickname !== picked.name ? <small className="ml-2 font-normal text-slate-500">({picked.nickname})</small> : null}</span>
        <button type="button" disabled={disabled} onClick={() => { onPick(null); setText(''); }} className="text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-300">Chọn người khác</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        placeholder="Gõ tên đồng đội (ít nhất 2 chữ)…"
        aria-label="Tìm đồng đội"
        autoComplete="off"
        className={inputClass}
      />
      {state.loading && <p className="text-xs text-slate-500">Đang tìm…</p>}
      {state.error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">Không tìm được lúc này — thử lại sau, hoặc nhập đồng đội như người chưa có tài khoản.</p>}
      {!state.loading && !state.error && state.asked && state.items.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Không thấy ai tên như vậy trong hệ thống (người đặt hồ sơ riêng tư sẽ không hiện). Đồng đội chưa có tài khoản thì chọn "Chưa có tài khoản".</p>
      )}
      {state.items.length > 0 && (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700" role="listbox" aria-label="Kết quả tìm đồng đội">
          {state.items.map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected="false" onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-500/10">
                <span className="min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-white">{p.name}</span>
                  {p.nickname && p.nickname !== p.name && <small className="ml-2 text-slate-500">({p.nickname})</small>}
                  {p.gender && <small className="ml-2 text-slate-500">{GENDER_TEXT[p.gender]}</small>}
                </span>
                <small className={p.rated ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{p.rated ? 'đã có điểm' : 'chưa có điểm'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Form đồng đội CHƯA có tài khoản. `errors` = lỗi theo ô (client + service); hiện sau khi bấm Đăng ký. */
export function GuestForm({ value, onChange, errors, disabled }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const err = (key) => (errors[key] ? <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300" role="alert">{errors[key]}</p> : null);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="guest-form">
      <Field label="Họ tên đồng đội" className="sm:col-span-2">
        <input className={inputClass} value={value.name} onChange={set('name')} disabled={disabled} autoComplete="off" maxLength={100} placeholder="Nguyễn Văn A" />
        {err('name')}
      </Field>
      <Field label="Số điện thoại" hint="Để nhân viên liên hệ khi cần — chỉ nhân viên thấy.">
        <input className={inputClass} value={value.phone} onChange={set('phone')} disabled={disabled} inputMode="tel" autoComplete="off" placeholder="0912 345 678" />
        {err('phone')}
      </Field>
      <Field label="Giới tính">
        <select className={inputClass} value={value.gender} onChange={set('gender')} disabled={disabled}>
          <option value="">Chọn…</option>
          {GUEST_GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {err('gender')}
      </Field>
      <Field label="Mức trình gần đúng" className="sm:col-span-2" hint="Bạn ước lượng giúp — nhân viên sẽ xác nhận lại khi nhận số tại quầy.">
        <select className={inputClass} value={value.level} onChange={set('level')} disabled={disabled}>
          <option value="">Chọn…</option>
          {GUEST_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {err('level')}
      </Field>
    </div>
  );
}

function ErrorHint({ error }) {
  const location = useLocation();
  const hint = registerErrorHint(error);
  if (!hint) return null;
  return (
    <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="register-hint">
      {hint.text}{' '}
      {hint.kind === 'assess' && <Link to="/my-rating/assess" state={{ from: { pathname: location.pathname } }} className="font-bold text-emerald-600 hover:underline dark:text-emerald-400">Tự chấm trình →</Link>}
    </p>
  );
}

export default function RegisterDialog({ t, onClose, onDone }) {
  const location = useLocation();
  const needsPartner = Boolean(t.registration && t.registration.needsPartner);
  const [me, setMe] = useState({ loading: true, data: null, error: null });
  const [mode, setMode] = useState('existing');
  const [picked, setPicked] = useState(null);
  const [guest, setGuest] = useState(emptyGuest);
  const [attempted, setAttempted] = useState(false);
  const [run, { busy, error, clearError }] = useAction();

  const loadMe = () => {
    setMe({ loading: true, data: null, error: null });
    meApi.get().then((data) => setMe({ loading: false, data, error: null })).catch((err) => setMe({ loading: false, data: null, error: err }));
  };
  useEffect(loadMe, []);

  const unrated = me.data && !hasRatingFor(me.data, t.discipline);
  const fee = feeSummary(needsPartner);
  const problem = needsPartner ? partnerProblem({ mode, picked, guest }) : null;
  const clientErrors = mode === 'guest' && attempted ? validateGuestForm(guest) : {};
  const fieldErrors = { ...clientErrors, ...guestFieldErrors(error) };

  const submit = async () => {
    setAttempted(true);
    if (problem) return;
    const res = await run(() => publicTournamentsApi.register(t.id, buildRegisterBody({ needsPartner, mode, picked, guest })));
    if (res) onDone(res);
  };

  const canSubmit = me.data && !unrated;
  const actions = [{ label: 'Thôi', onClick: onClose }];
  if (canSubmit) actions.push({ label: needsPartner ? 'Đăng ký cả cặp' : 'Đăng ký', variant: 'primary', busy, onClick: submit });

  return (
    <Dialog title={`Đăng ký: ${t.name}`} onClose={onClose} actions={actions}>
      <div data-testid="register-dialog" className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">Nội dung: <b className="text-slate-700 dark:text-slate-200">{disciplineLabel(t)}</b></p>

        {me.loading && <Spinner label="Đang kiểm tra hồ sơ của bạn…" />}
        {me.error && <Notice error={me.error} onRetry={loadMe} />}

        {unrated && (
          <div className="space-y-2" data-testid="needs-rating">
            <Notice kind="warn">Bạn chưa có điểm trình {t.discipline === 'doubles' ? 'Đôi' : 'Đơn'}. Cần chấm trình trước để ban tổ chức xếp bạn đúng trình — chỉ mất vài phút.</Notice>
            <Link to="/my-rating/assess" state={{ from: { pathname: location.pathname } }} className="inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-emerald-400">Tự chấm trình</Link>
            <p className="text-xs text-slate-500">Chấm xong, quay lại trang giải này để đăng ký.</p>
          </div>
        )}

        {canSubmit && (
          <>
            <div className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800/70">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Người đăng ký</p>
              <p className="font-bold text-slate-900 dark:text-white" data-testid="register-self">{me.data.displayName}</p>
            </div>

            {needsPartner && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">Giải đánh đôi cặp cố định — thêm <b>đồng đội</b> để đăng ký cả hai người trong một lần.</p>
                <div className="flex gap-2" role="tablist" aria-label="Cách chọn đồng đội">
                  <button type="button" role="tab" aria-selected={mode === 'existing'} className={modeBtn(mode === 'existing')} onClick={() => { setMode('existing'); clearError(); }}>Đã có trong hệ thống</button>
                  <button type="button" role="tab" aria-selected={mode === 'guest'} className={modeBtn(mode === 'guest')} onClick={() => { setMode('guest'); clearError(); }}>Chưa có tài khoản</button>
                </div>
                {mode === 'existing'
                  ? <PartnerSearch picked={picked} onPick={(p) => { setPicked(p); clearError(); }} disabled={busy} />
                  : <GuestForm value={guest} onChange={setGuest} errors={fieldErrors} disabled={busy} />}
                {mode === 'existing' && problem && (attempted || (picked && !picked.rated)) && <p className="text-xs font-semibold text-rose-600 dark:text-rose-300" role="alert">{problem.message}</p>}
              </div>
            )}

            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200" data-testid="register-fee">
              💰 Lệ phí dự kiến: {fee.text} — thanh toán tại quầy khi nhận số.
            </p>
          </>
        )}

        {error && <><Notice error={error} /><ErrorHint error={error} /></>}
      </div>
    </Dialog>
  );
}
