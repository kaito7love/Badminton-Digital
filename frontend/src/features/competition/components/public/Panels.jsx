import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Card } from '../ui';
import { isStaff, roleOf } from '../../../../utils/roles';
import { fillRatio, myTournamentText, mySessionText, registrationState, sessionFillRatio, sessionSpotsText, spotsText } from '../../lib/publicHub';
import { FeeChip, Meter, Pill } from './atoms';

// Khung "đăng ký" của trang giải / buổi giao lưu (plan 27): chỗ còn, lệ phí dự kiến, trạng thái của CHÍNH MÌNH và nút hành động theo người xem
// (chưa đăng nhập → đăng nhập; nhân viên → đăng ký hộ ở trang quản lý; khách → đăng ký / rút). Hành động do trang truyền vào (`onRegister`, `onWithdraw`).

const TONE_BOX = {
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
};

function LoginPrompt({ what }) {
  const location = useLocation();
  const state = { from: { pathname: location.pathname } };
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600 dark:text-slate-300">Đăng nhập tài khoản khách để {what}. Chưa có tài khoản? Tạo chỉ mất một phút.</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/login" state={state} className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-emerald-400">Đăng nhập để {what}</Link>
        <Link to="/register" state={state} className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Tạo tài khoản</Link>
      </div>
    </div>
  );
}

function StaffNote({ to, label }) {
  return (
    <p className="text-sm text-slate-600 dark:text-slate-300">
      Bạn đang đăng nhập bằng tài khoản nhân viên — đăng ký hộ người chơi ở <Link to={to} className="font-bold text-emerald-600 hover:underline dark:text-emerald-400">{label}</Link>.
    </p>
  );
}

function MyState({ info, extra }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${TONE_BOX[info.tone]}`} role="status" data-testid="my-state">
      {info.text}
      {info.pair && <span className="ml-1 font-semibold">· Cặp: {info.pair}</span>}
      {extra}
    </div>
  );
}

export function RegistrationPanel({ t, user, onRegister, onWithdraw, busy = false }) {
  const state = registrationState(t);
  const reg = t.registration;
  const role = roleOf(user);
  const customer = role === 'customer';
  const mine = myTournamentText(t.me);
  return (
    <Card className="lg:sticky lg:top-24" title="Đăng ký tham gia">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Pill tone={state.tone}>{state.label}</Pill><FeeChip /></div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
            <span>{spotsText(reg)}</span>
            {reg.maxEntries ? <span className="tabular-nums">{reg.registered}/{reg.maxEntries}</span> : null}
          </div>
          <Meter ratio={fillRatio(reg)} />
          {reg.waitlisted > 0 && reg.maxEntries && <p className="text-xs text-slate-500 dark:text-slate-400">{reg.waitlisted} người đang trong danh sách chờ.</p>}
        </div>
        {reg.needsPartner && state.canRegister && (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Giải đánh đôi cặp cố định: bạn đăng ký <b>cả cặp trong một lần</b> — chọn đồng đội có sẵn trong hệ thống hoặc nhập tên và số điện thoại của người chưa có tài khoản.
          </p>
        )}
        {state.canRegister && <p className="text-xs text-slate-500 dark:text-slate-400">Lệ phí thanh toán tại quầy khi nhận số. Đăng ký đủ điều kiện sẽ vào danh sách ngay, hết chỗ thì xếp danh sách chờ.</p>}

        {!state.canRegister && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {state.key === 'done' ? 'Giải đã kết thúc — xem lịch, bảng và kết quả ở các tab bên dưới.' : 'Ban tổ chức đã chốt danh sách. Nếu bạn đã đăng ký, hãy theo dõi lịch thi đấu ở tab "Lịch & kết quả".'}
          </p>
        )}
        {state.canRegister && !user && <LoginPrompt what="đăng ký" />}
        {state.canRegister && user && !customer && isStaff(user) && <StaffNote to={`/competition/tournaments/${t.id}`} label="trang quản lý giải" />}
        {state.canRegister && customer && (
          <>
            {mine && <MyState info={mine} />}
            {t.me && t.me.canWithdraw && onWithdraw && <Button variant="danger" busy={busy} onClick={onWithdraw}>Rút khỏi giải</Button>}
            {t.me && !t.me.canWithdraw && <p className="text-xs text-slate-500">Giải đã bốc thăm — liên hệ nhân viên nếu bạn không thể tham gia nữa.</p>}
            {!t.me && onRegister && <Button busy={busy} onClick={onRegister}>{state.key === 'full' ? 'Vào danh sách chờ' : reg.needsPartner ? 'Đăng ký cả cặp' : 'Đăng ký'}</Button>}
          </>
        )}
        {customer && !state.canRegister && mine && <MyState info={mine} />}
      </div>
    </Card>
  );
}

export function SessionSignupPanel({ s, user, onSignUp, onCancel, busy = false }) {
  const open = s.status === 'open';
  const signup = s.signup;
  const role = roleOf(user);
  const customer = role === 'customer';
  const mine = mySessionText(s.me);
  return (
    <Card className="lg:sticky lg:top-24" title="Tham gia buổi giao lưu">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Pill tone={open ? 'emerald' : 'slate'}>{open ? 'Đang nhận đăng ký' : 'Đã kết thúc'}</Pill><FeeChip /></div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
            <span>{sessionSpotsText(signup)}</span>
            <span className="text-xs font-semibold text-slate-500">{s.players.present} đang có mặt</span>
          </div>
          <Meter ratio={sessionFillRatio(signup)} tone="sky" />
          {signup.waitlisted > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{signup.waitlisted} người đang chờ chỗ.</p>}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Đăng ký là báo trước để sân giữ chỗ; nhân viên vẫn điểm danh tại quầy khi bạn tới. Lệ phí thanh toán tại quầy.</p>
        {!open && <p className="text-sm text-slate-600 dark:text-slate-300">Buổi này đã kết thúc.</p>}
        {open && !user && <LoginPrompt what="tham gia" />}
        {open && user && !customer && isStaff(user) && <StaffNote to={`/competition/sessions/${s.id}`} label="trang quản lý buổi" />}
        {open && customer && (
          <>
            {mine && <MyState info={mine} />}
            {s.me && s.me.canCancel && onCancel && <Button variant="danger" busy={busy} onClick={onCancel}>Huỷ đăng ký</Button>}
            {!s.me && onSignUp && <Button busy={busy} onClick={onSignUp}>{signup.maxPlayers && signup.spotsLeft === 0 ? 'Vào danh sách chờ' : 'Tham gia buổi này'}</Button>}
          </>
        )}
      </div>
    </Card>
  );
}
