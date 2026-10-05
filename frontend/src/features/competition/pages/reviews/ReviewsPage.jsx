import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { Badge } from '../../../../components/UIComponents';
import { ratingApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { useAction } from '../../hooks/useAction';
import { useCompetition } from '../../context/CompetitionContext';
import { permissionsFor } from '../../lib/permissions';
import { SOURCE_LABEL } from '../../lib/rating';
import { fmtDateTime, fmtNumber } from '../../lib/format';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner } from '../../components/ui';
import { Dialog } from '../../components/Dialog';
import { Field, inputClass } from '../../components/form';

// Hàng chờ duyệt (quản lý — 07 mục 1.2): bài tự chấm có cờ "cần xác nhận" (điểm kỹ năng cao / vượt mức tự chấm) và bài chấm AI chờ duyệt.
// Đồng ý = xác nhận trình giữ nguyên điểm; "Sửa rồi duyệt" = nhân viên chỉnh / điền nốt tiêu chí (tính như nhân viên chấm); Từ chối = ghi lý do.

const loadAll = async () => {
  const [rubric, verify, ai] = await Promise.all([
    ratingApi.rubric(),
    ratingApi.assessments({ flag: 'needs_verification' }),
    ratingApi.assessments({ status: 'pending_review' })
  ]);
  return { rubric, verify: verify.items, ai: ai.items };
};

function ReviewDialog({ item, rubric, onClose, onDone }) {
  const [answers, setAnswers] = useState(() => ({ ...item.answers }));
  const [note, setNote] = useState('');
  const [run, { busy, error }] = useAction();
  const isAi = item.status === 'pending_review';
  const missing = rubric.criteria.filter((c) => !Number.isInteger(answers[c.code]));
  const changed = Object.fromEntries(Object.entries(answers).filter(([k, v]) => Number.isInteger(v) && v !== item.answers[k]));
  const save = async () => {
    const done = await run(() => ratingApi.review(item.id, { decision: 'approve', answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => Number.isInteger(v))), ...(note.trim() ? { note: note.trim() } : {}) }));
    if (done) onDone(`Đã duyệt bài chấm của ${item.playerName}`);
  };
  return (
    <Dialog
      title={`Sửa rồi duyệt — ${item.playerName}`}
      size="lg"
      onClose={onClose}
      error={error}
      actions={[{ label: 'Duyệt kèm sửa', variant: 'primary', busy, disabled: missing.length > 0 || (!isAi && Object.keys(changed).length === 0), onClick: save }]}
    >
      <p>{isAi ? 'Điền nốt các tiêu chí AI chưa đánh giá (—), sửa mức nếu cần. Điểm tính như nhân viên chấm (không trần 4.5).' : 'Sửa các mức chưa đúng rồi duyệt — điểm tính như nhân viên chấm, không trần 4.5.'}</p>
      <div className="max-h-[50vh] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {rubric.criteria.map((c) => (
              <tr key={c.code} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3 font-semibold">{c.name}{c.gate && <small className="ml-1 text-amber-600">(then chốt)</small>}</td>
                <td className="py-1.5">
                  <select className={`${inputClass} !w-24`} aria-label={c.name} value={answers[c.code] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [c.code]: e.target.value === '' ? null : Number(e.target.value) }))}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>mức {n}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && <Notice kind="warn">Còn {missing.length} tiêu chí chưa có mức: {missing.map((c) => c.name).join(', ')}.</Notice>}
      <Field label="Ghi chú (không bắt buộc)"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
  );
}

function RejectDialog({ item, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [run, { busy, error }] = useAction();
  const save = async () => {
    const done = await run(() => ratingApi.review(item.id, { decision: 'reject', ...(note.trim() ? { note: note.trim() } : {}) }));
    if (done) onDone(`Đã từ chối bài chấm của ${item.playerName}`);
  };
  return (
    <Dialog title={`Từ chối — ${item.playerName}`} onClose={onClose} error={error} actions={[{ label: 'Từ chối', variant: 'danger', busy, onClick: save }]}>
      <p>Bài chấm AI bị từ chối thì không áp dụng; bài tự chấm bị từ chối vẫn giữ điểm hiện tại nhưng bỏ khỏi hàng chờ.</p>
      <Field label="Lý do (không bắt buộc)"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
  );
}

function Row({ item, onApprove, onEdit, onReject, busy }) {
  const ai = item.status === 'pending_review';
  const complete = Object.values(item.answers || {}).every((v) => Number.isInteger(v));
  const result = item.result || {};
  return (
    <li className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800" data-assessment={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/competition/players/${item.playerId}`} className="text-base font-bold text-slate-900 hover:underline dark:text-white">{item.playerName}</Link>
          <p className="mt-0.5 text-xs text-slate-500">
            {SOURCE_LABEL[item.source] || item.source} · {fmtDateTime(item.createdAt)}
            {ai && item.confidence != null && ` · AI tin cậy ${Math.round(item.confidence * 100)}%`}
          </p>
          <p className="mt-1 text-sm">
            {['singles', 'doubles'].map((d) => result[d] && (
              <span key={d} className="mr-4"><b>{d === 'singles' ? 'Đơn' : 'Đôi'}</b> {fmtNumber(result[d].rating)} <small className="text-slate-500">{result[d].level}</small></span>
            ))}
            {item.needsVerification && <Badge variant="rose">cần xác nhận</Badge>}
          </p>
          {item.note && <p className="mt-1 text-xs text-slate-500">Ghi chú: {item.note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(!ai || complete) && <Button disabled={busy} onClick={() => onApprove(item)} data-act="approve">{ai ? 'Đồng ý — áp dụng' : 'Đồng ý — xác nhận trình'}</Button>}
          <Button variant="secondary" onClick={() => onEdit(item)} data-act="edit">Sửa rồi duyệt…</Button>
          <Button variant="secondary" onClick={() => onReject(item)} data-act="reject">Từ chối…</Button>
        </div>
      </div>
    </li>
  );
}

export default function ReviewsPage() {
  const { user } = useAuth();
  const { toast } = useCompetition();
  const perms = permissionsFor(user);
  const load = useCallback(() => loadAll(), []);
  const { data, loading, error, reload } = useLiveResource({ load });
  const [dialog, setDialog] = useState(null);
  const [run, { busy }] = useAction({ onReload: () => reload({ silent: true }) });

  if (!perms.canReviewAssessments) {
    return <div className="mx-auto max-w-3xl p-4 sm:p-8"><Notice kind="warn">Chỉ quản lý hoặc admin duyệt được bài chấm.</Notice></div>;
  }
  if (loading && !data) return <div className="mx-auto max-w-5xl p-4 sm:p-8"><Spinner label="Đang tải hàng chờ…" /></div>;
  if (error && !data) return <div className="mx-auto max-w-5xl p-4 sm:p-8"><Notice error={error} onRetry={() => reload()} /></div>;
  if (!data) return null;

  const closeAnd = (message) => { setDialog(null); toast(message); reload({ silent: true }); };
  const approve = async (item) => {
    const res = await run(() => ratingApi.review(item.id, { decision: 'approve' }), { onError: (e) => toast(e.message, 'error') });
    if (res !== undefined) { toast(`Đã xác nhận trình của ${item.playerName}`); reload({ silent: true }); }
  };
  const empty = data.verify.length === 0 && data.ai.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-8">
      <PageHeader title="Hàng chờ duyệt" subtitle="Bài chấm cần quản lý xác nhận." />
      {empty && <EmptyState title="Không có bài nào chờ duyệt">Bài tự chấm có kỹ năng cao hoặc bài chấm AI sẽ hiện ở đây.</EmptyState>}
      {data.verify.length > 0 && (
        <Card title={`Cần xác nhận (${data.verify.length})`}>
          <p className="mb-3 text-xs text-slate-500">Bài tự chấm có điểm kỹ năng cao hoặc vượt mức tự chấm. Đồng ý = giữ nguyên điểm và đánh dấu đã xác thực.</p>
          <ul className="space-y-3">{data.verify.map((i) => <Row key={i.id} item={i} busy={busy} onApprove={approve} onEdit={(x) => setDialog({ type: 'edit', item: x })} onReject={(x) => setDialog({ type: 'reject', item: x })} />)}</ul>
        </Card>
      )}
      {data.ai.length > 0 && (
        <Card title={`Bài chấm AI chờ duyệt (${data.ai.length})`}>
          <ul className="space-y-3">{data.ai.map((i) => <Row key={i.id} item={i} busy={busy} onApprove={approve} onEdit={(x) => setDialog({ type: 'edit', item: x })} onReject={(x) => setDialog({ type: 'reject', item: x })} />)}</ul>
        </Card>
      )}
      {dialog && dialog.type === 'edit' && <ReviewDialog item={dialog.item} rubric={data.rubric} onClose={() => setDialog(null)} onDone={closeAnd} />}
      {dialog && dialog.type === 'reject' && <RejectDialog item={dialog.item} onClose={() => setDialog(null)} onDone={closeAnd} />}
    </div>
  );
}
