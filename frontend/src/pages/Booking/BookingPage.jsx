import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { useAuth } from '../../contexts/AuthContext';
import { roleOf } from '../../utils/roles';
import { todayInZone } from '../../utils/datetime';
import { bookingService, publicService } from '../../services/apiServices';
import useDayAvailability from './useDayAvailability';
import useCompactLayout from './useCompactLayout';
import { buildDayStrip, fallbackWindow } from './lib/dayStrip';
import { dayStatus } from './lib/gridModel';
import { confirmBooking, resumePending } from './lib/bookingFlow';
import {
  MAX_BOOKING_HOURS,
  hintText,
  lostText,
  reconcileSelection,
  summarize,
  tapSlot
} from './lib/daySelection';
import DayStrip from './components/DayStrip';
import Legend from './components/Legend';
import CourtGrid from './components/CourtGrid';
import PhoneGrid from './components/PhoneGrid';
import SummaryBar from './components/SummaryBar';
import ConfirmDialog from './components/ConfirmDialog';
import { ErrorBoard, LoadingBoard, NoCourtsBoard, OverBoard } from './components/BoardStates';

// Cùng khoá với ô đặt nhanh ở Trang chủ: khách chọn chi nhánh ở đâu thì cả hai
// nơi cùng nhớ. KHÔNG phải "admin_selected_branch_id" (bộ chuyển của nhân viên).
const CUSTOMER_BRANCH_KEY = 'customer_selected_branch_id';

const readStored = (key) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};
const writeStored = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // kho bị chặn: chỉ là không nhớ được lần sau
  }
};

// sessionStorage có thể ném lỗi ngay khi truy cập (chế độ riêng tư, bị chặn): khi đó
// đưa vào một đối tượng rỗng — mọi thao tác ở lib/pendingBooking đều đã nuốt lỗi.
const sessionStore = () => {
  try {
    return window.sessionStorage;
  } catch {
    return {};
  }
};

const clock = (date) =>
  date ? date.toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

/**
 * Trang Đặt sân (/dat-san, kế hoạch 29): lưới sân × giờ của một ngày, chạm khung
 * giờ còn trống rồi đặt. Công khai — khách chưa đăng nhập vẫn xem được.
 *
 * Trang chỉ ghép: dữ liệu từ `useDayAvailability`, mọi quy tắc chọn / tạm tính
 * nằm ở `lib/` (thuần, có test), luật nghiệp vụ thật do server chốt.
 */
export default function BookingPage() {
  const { user } = useAuth();
  const role = roleOf(user);
  const mode = !user ? 'guest' : role === 'customer' ? 'customer' : 'staff';
  const compact = useCompactLayout();
  const navigate = useNavigate();

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(() => readStored(CUSTOMER_BRANCH_KEY));
  const [date, setDate] = useState(() => todayInZone());
  const [selection, setSelection] = useState(null);
  const [notice, setNotice] = useState(null);
  const [courtTab, setCourtTab] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [resumed, setResumed] = useState(false);

  const { day, loading, error, stamp, reload, refresh } = useDayAvailability({
    date,
    branchId,
    paused: dialogOpen
  });

  // Danh sách chi nhánh cho bộ chọn, tải một lần.
  useEffect(() => {
    publicService
      .getBranches()
      .then((res) => setBranches(res.data?.data || []))
      .catch(() => {});
  }, []);

  // Lần đầu chưa chọn chi nhánh thì server chọn hộ: đồng bộ ngược để bộ chọn hiện
  // đúng. CHỈ khi chưa có chi nhánh: khi khách vừa đổi chi nhánh, `day` còn là của
  // chi nhánh cũ tới lúc phản hồi mới về, đồng bộ lúc đó sẽ kéo lựa chọn về chỗ cũ.
  useEffect(() => {
    const id = day?.branch?.id;
    if (!id) return;
    if (!branchId) setBranchId(String(id));
    if (String(id) === String(branchId) || !branchId) writeStored(CUSTOMER_BRANCH_KEY, String(id));
  }, [day, branchId]);

  // Chi nhánh đã nhớ từ lần trước mà nay ngưng hoạt động / không còn: về mặc định,
  // nếu không trang kẹt ở lỗi 404 mãi.
  useEffect(() => {
    if (branchId && branches.length > 0 && !branches.some((b) => String(b.id) === String(branchId))) {
      setBranchId('');
      writeStored(CUSTOMER_BRANCH_KEY, '');
    }
  }, [branches, branchId]);

  // Dải ngày theo "hôm nay" và hạn cuối của server; trước khi có phản hồi thì dải mặc định.
  const bookingWindow = useMemo(
    () => (day ? { today: day.today, lastDate: day.lastBookableDate } : fallbackWindow(todayInZone())),
    [day]
  );
  const days = useMemo(() => buildDayStrip(bookingWindow), [bookingWindow]);

  // Để tab mở qua nửa đêm: ngày đang xem thành "hôm qua" thì nhảy sang hôm nay.
  useEffect(() => {
    const timer = setInterval(() => {
      const today = todayInZone();
      setDate((current) => (current < today ? today : current));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Lưới vừa tải lại: khung đang chọn có còn trống không. Đọc lựa chọn qua ref để
  // chỉ chạy khi `day` đổi, không chạy lại mỗi lần khách chạm một ô.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // Lựa chọn vừa dựng lại sau đăng nhập, đang chờ lưới đúng ngày / chi nhánh về để kiểm.
  const restoreRef = useRef(false);
  useEffect(() => {
    if (!day) return;
    // Lưới còn là của ngày / chi nhánh khác (phản hồi mới chưa về, ví dụ ngay sau khi
    // dựng lại lựa chọn đã cất): đối chiếu lúc này sẽ bỏ oan lựa chọn.
    if (day.date !== date) return;
    if (branchId && String(day.branch?.id) !== String(branchId)) return;

    const result = reconcileSelection(selectionRef.current, day);
    if (result.lost) {
      restoreRef.current = false;
      setResumed(false);
      setSelection(null);
      setNotice({ tone: 'warn', text: lostText(result.lost) });
      setDialogOpen(false);
    } else if (restoreRef.current && selectionRef.current) {
      // Đã đăng nhập, khung còn trống: mở hộp xác nhận để khách bấm đặt nốt.
      restoreRef.current = false;
      setDialogOpen(true);
    }
  }, [day, date, branchId]);

  // Quay lại từ trang đăng nhập: dựng lại đúng lựa chọn đã cất. Chỉ chạy một lần,
  // khi đã biết người dùng; việc "còn trống không" do lưới tải về quyết định (effect trên).
  const resumedOnce = useRef(false);
  useEffect(() => {
    if (resumedOnce.current || !user) return;
    resumedOnce.current = true;
    const result = resumePending({ storage: sessionStore(), mode, window: fallbackWindow(todayInZone()) });
    if (result.type !== 'resume') return;
    restoreRef.current = true;
    setResumed(true);
    if (result.branchId) {
      setBranchId(String(result.branchId));
      writeStored(CUSTOMER_BRANCH_KEY, String(result.branchId));
    }
    setDate(result.date);
    setSelection(result.selection);
    setCourtTab(result.selection.courtId);
  }, [user, mode]);

  const resetPick = useCallback(() => {
    setSelection(null);
    setNotice(null);
  }, []);

  const changeDate = (next) => {
    setDate(next);
    resetPick();
  };
  const changeBranch = (event) => {
    const next = event.target.value;
    setBranchId(next);
    writeStored(CUSTOMER_BRANCH_KEY, next);
    setCourtTab(null);
    resetPick();
  };
  const changeCourtTab = (id) => {
    setCourtTab(id);
    resetPick();
  };

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogError('');
    setResumed(false);
  }, []);

  // Nút chính của hộp xác nhận: đặt thật (khách hàng) hoặc cất lựa chọn rồi sang đăng nhập (khách).
  const handleConfirm = async () => {
    if (busy || !selection) return;
    setBusy(true);
    setDialogError('');
    const outcome = await confirmBooking({
      mode,
      date,
      branchId: day?.branch?.id ?? branchId,
      selection,
      createBooking: bookingService.createBooking,
      storage: sessionStore()
    });
    setBusy(false);

    if (outcome.type === 'login') {
      navigate('/login', { state: { from: { pathname: '/dat-san' } } });
    } else if (outcome.type === 'created') {
      navigate('/my-bookings');
    } else if (outcome.type === 'failed') {
      if (outcome.refreshGrid) {
        // Khung đã đổi dưới chân khách (trùng lịch, hết giờ, ngoài dải): bỏ lựa chọn,
        // nói đúng lý do của server và tải lại lưới để thấy tình hình thật.
        closeDialog();
        setSelection(null);
        setNotice({ tone: 'warn', text: outcome.message });
        refresh();
      } else {
        // Mất mạng / lỗi tạm: giữ hộp và lựa chọn để khách bấm thử lại.
        setDialogError(outcome.message);
      }
    }
  };

  const onTap = (court, slot) => {
    const result = tapSlot({ selection, court, slot, maxHours: MAX_BOOKING_HOURS });
    setSelection(result.selection);
    setNotice(result.hint ? { tone: 'warn', text: hintText(result.hint) } : null);
  };

  const status = day ? dayStatus(day) : null;
  const courts = day?.courts || [];
  const phoneCourt =
    courts.find((c) => c.id === courtTab) || courts.find((c) => c.bookable) || courts[0] || null;
  const selectedCourt = selection ? courts.find((c) => c.id === selection.courtId) : null;
  const summary = summarize(selectedCourt, selection);
  const nextDay = days.find((d) => d.date > date);

  const hint =
    notice?.text ||
    (status === 'full'
      ? 'Ngày này không còn khung trống. Thử ngày khác nhé.'
      : `Chạm giờ bắt đầu, rồi chạm thêm một ô cùng sân để kéo dài (tối đa ${MAX_BOOKING_HOURS} giờ).`);

  const peak = day?.peakHours;
  const pad = (n) => String(n).padStart(2, '0');

  return (
    <CustomerLayout
      eyebrow="Đặt sân"
      title={
        <>
          ĐẶT <span className="text-gradient-nike">SÂN</span>
        </>
      }
      subtitle={
        peak
          ? `Chọn ngày, rồi chạm khung giờ còn trống. Giá đã tính giờ cao điểm ${pad(peak.peakStartHour)}:00–${pad(peak.peakEndHour)}:00.`
          : 'Chọn ngày, rồi chạm khung giờ còn trống.'
      }
      action={
        mode === 'customer' ? (
          <Link to="/my-bookings" className="btn-nike-dark text-xs">
            Lịch đặt của tôi
          </Link>
        ) : null
      }
    >
      <div className="pb-40 lg:pb-0">
        <div className="grid gap-4">
          <label className="grid w-full gap-2 sm:w-64">
            <span className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
              Chi nhánh
            </span>
            <select
              id="dat-san-branch"
              value={branchId}
              onChange={changeBranch}
              disabled={branches.length === 0}
              className="booking-input"
            >
              {branches.length === 0 && <option value={branchId}>{day?.branch?.name || 'Đang tải…'}</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <DayStrip days={days} value={date} onChange={changeDate} />
        </div>

        <div className="mt-6 mb-3">
          <Legend />
        </div>

        <section className="nike-card-static p-4 sm:p-5" aria-label="Lịch sân theo giờ">
          {loading && <LoadingBoard />}
          {!loading && error && <ErrorBoard message={error} onRetry={reload} />}
          {!loading && !error && day && status === 'no-courts' && <NoCourtsBoard />}
          {!loading && !error && day && status === 'over' && (
            <OverBoard onNextDay={nextDay ? () => changeDate(nextDay.date) : null} />
          )}
          {!loading && !error && day && (status === 'ok' || status === 'full') && (
            <>
              {compact ? (
                <PhoneGrid
                  day={day}
                  courtId={phoneCourt?.id}
                  onCourt={changeCourtTab}
                  selection={selection}
                  onTap={onTap}
                />
              ) : (
                <CourtGrid day={day} selection={selection} onTap={onTap} />
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600 dark:border-white/10 dark:text-slate-400">
                <span>Cập nhật {clock(stamp)} · tự tải lại mỗi 30 giây</span>
                <button
                  type="button"
                  onClick={refresh}
                  className="font-bold text-emerald-700 underline hover:no-underline dark:text-emerald-300"
                >
                  Tải lại
                </button>
              </div>
            </>
          )}
        </section>

        {(status === 'ok' || status === 'full') && (
          <p
            role="status"
            className={`mx-1 mt-3 min-h-[1.5rem] text-sm font-semibold ${
              notice?.tone === 'warn' ? 'text-amber-800 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {hint}
          </p>
        )}

        {(status === 'ok' || status === 'full') && (
          <SummaryBar summary={summary} date={date} role={mode} portal={compact} onBook={() => setDialogOpen(true)} />
        )}
      </div>

      <ConfirmDialog
        open={dialogOpen && Boolean(summary)}
        summary={summary}
        branchName={day?.branch?.name}
        date={date}
        mode={mode}
        user={user}
        resumed={resumed}
        busy={busy}
        error={dialogError}
        onClose={closeDialog}
        onConfirm={handleConfirm}
      />
    </CustomerLayout>
  );
}
