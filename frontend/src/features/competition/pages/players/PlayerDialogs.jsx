import React, { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { chip, Field, inputClass } from '../../components/form';
import { Notice } from '../../components/ui';
import { playersApi } from '../../api/tournaments';
import { useAction } from '../../hooks/useAction';
import { QUICK_LEVELS } from '../../lib/labels';
import { adjustError, DISCIPLINE_LABEL, MAX_RATING, MIN_RATING, ratingOf } from '../../lib/rating';
import { fmtNumber } from '../../lib/format';

// Hộp thoại của hồ sơ người chơi (nhân viên): chấm nhanh (chỉ người chưa có điểm) và chỉnh điểm tay (quản lý, bắt buộc lý do).

export function QuickAssessDialog({ player, onClose, onDone }) {
  const [level, setLevel] = useState('tb');
  const [note, setNote] = useState('');
  const [run, { busy, error }] = useAction();
  const save = async () => {
    const done = await run(() => playersApi.quickAssessment(player.id, { level, ...(note.trim() ? { note: note.trim() } : {}) }));
    if (done) onDone(`Đã chấm nhanh ${player.displayName}`);
  };
  return (
    <Dialog title={`Chấm nhanh — ${player.displayName}`} onClose={onClose} error={error} actions={[{ label: 'Chấm nhanh', variant: 'primary', busy, onClick: save }]}>
      <p>Chọn nhãn trình — dùng cho người chưa có điểm (khách vãng lai). Cùng một điểm cho cả Đơn và Đôi, ghi là "chưa xác thực"; có thể chấm đầy đủ sau.</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_LEVELS.map(([key, label]) => (
          <button key={key} type="button" className={chip(level === key)} aria-pressed={level === key} onClick={() => setLevel(key)} data-level={key}>{label}</button>
        ))}
      </div>
      <Field label="Ghi chú (không bắt buộc)"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
    </Dialog>
  );
}

export function AdjustDialog({ player, onClose, onDone }) {
  const withRating = ['singles', 'doubles'].filter((d) => ratingOf(player, d));
  const [discipline, setDiscipline] = useState(withRating[0] || 'singles');
  const [newRating, setNewRating] = useState('');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');
  const [run, { busy, error }] = useAction();
  const current = ratingOf(player, discipline);
  const save = async () => {
    const problem = adjustError(newRating, reason);
    if (problem) { setLocalError(problem); return; }
    setLocalError('');
    const done = await run(() => playersApi.adjust(player.id, { discipline, newRating: Number(newRating), reason: reason.trim() }));
    if (done) onDone(`Đã chỉnh điểm ${DISCIPLINE_LABEL[discipline]} của ${player.displayName}`);
  };
  return (
    <Dialog title={`Chỉnh điểm — ${player.displayName}`} onClose={onClose} error={error} actions={[{ label: 'Chỉnh điểm', variant: 'primary', busy, onClick: save }]}>
      {!withRating.length && <Notice kind="warn">Người này chưa có điểm — chấm trình trước, rồi mới chỉnh được.</Notice>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nội dung">
          <select className={inputClass} value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
            {withRating.map((d) => <option key={d} value={d}>{DISCIPLINE_LABEL[d]}</option>)}
          </select>
        </Field>
        <Field label="Điểm hiện tại"><input className={inputClass} disabled value={current ? fmtNumber(current.rating) : '—'} /></Field>
        <Field label={`Điểm mới (${MIN_RATING}–${MAX_RATING})`}><input type="number" step="0.01" min={MIN_RATING} max={MAX_RATING} className={inputClass} value={newRating} onChange={(e) => setNewRating(e.target.value)} aria-label="Điểm mới" /></Field>
      </div>
      <Field label="Lý do (bắt buộc, tối thiểu 10 ký tự)" hint="Được ghi vào sổ điểm và nhật ký.">
        <textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lý do" />
      </Field>
      {localError && <Notice kind="error">{localError}</Notice>}
    </Dialog>
  );
}
