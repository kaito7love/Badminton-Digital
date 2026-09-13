import React, { useState, useEffect } from 'react';
import { Modal, Badge } from '../../components/UIComponents';
import { courtService, sessionService, accessoryService, paymentService } from '../../services/apiServices';
import { connectRealtimeStream } from '../../services/realtimeClient';
import { useBranch } from '../../contexts/BranchContext';

const formatTime = (ms) => {
  if (!ms || ms < 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

const formatRates = (court) =>
  `Cao điểm ${formatMoney(court.peakPricePerHour)} · Thấp điểm ${formatMoney(court.offpeakPricePerHour)}/giờ`;

const errorMessageOf = (err, fallback) =>
  err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message || fallback;

// Backend trả về `state` đã gộp sẵn vòng đời sân + việc có phiên chơi đang mở
const mapStatus = (c) => {
  if (c.state === 'PLAYING') return 'busy';
  if (c.state === 'MAINTENANCE') return 'maintenance';
  if (c.state === 'INACTIVE') return 'inactive';
  return 'open';
};

// Transform API court → local state format
const mapCourt = (c) => {
  const activeSession = c.sessions?.find(s => s.status === 'playing') || null;
  return {
    id: c.id,
    name: c.name,
    peakPricePerHour: Number(c.peakPricePerHour || 0),
    offpeakPricePerHour: Number(c.offpeakPricePerHour || 0),
    note: c.note || '',
    status: mapStatus(c),
    session: activeSession ? {
      id: activeSession.id,
      startTime: new Date(activeSession.startTime).getTime(),
      playerName: activeSession.customer?.fullName || 'Khách vãng lai',
      customerId: activeSession.customerId,
    } : null,
    extras: [],
  };
};

export default function CourtsPage() {
  const { selectedBranchId, activeTimezone } = useBranch() || {};
  const [courts, setCourts] = useState([]);
  const [extrasList, setExtrasList] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal States
  const [activeModal, setActiveModal] = useState(null); // 'open' | 'checkout' | 'extra' | 'return' | 'switch' | 'courtModal'
  const [courtFormMode, setCourtFormMode] = useState('add'); // 'add' | 'edit'
  const [editingCourtId, setEditingCourtId] = useState(null);
  const [courtFormData, setCourtFormData] = useState({
    name: '',
    peakPricePerHour: 100000,
    offpeakPricePerHour: 80000,
    note: '',
  });

  const [playerNameInput, setPlayerNameInput] = useState('');
  const [playerPhoneInput, setPlayerPhoneInput] = useState('');
  const [selectedExtra, setSelectedExtra] = useState(null);
  const [extraQty, setExtraQty] = useState(1);
  const [returnItems, setReturnItems] = useState({});
  const [targetSwitchId, setTargetSwitchId] = useState('');
  // Modal thanh toán: { loading, error, preview, submitting, receipt }. Số tiền
  // luôn do server tính (GET /sessions/:id → checkoutPreview), không tự nhân giờ
  // chơi với giá ở trình duyệt nữa.
  const [checkout, setCheckout] = useState(null);

  // Fetch danh sách sân từ API
  const fetchCourts = async () => {
    try {
      const res = await courtService.getAllCourts();
      const apiCourts = res.data?.data || res.data || [];
      const mapped = (Array.isArray(apiCourts) ? apiCourts : []).map(mapCourt);

      // Load extras cho các sân đang chơi
      const withExtras = await Promise.all(mapped.map(async (court) => {
        if (court.session) {
          try {
            const extrasRes = await sessionService.getExtras(court.session.id);
            const extrasData = extrasRes.data?.data || extrasRes.data || [];
            court.extras = (Array.isArray(extrasData) ? extrasData : []).map(se => ({
              id: se.extraId || se.id,
              name: se.extra?.name || se.name || 'N/A',
              price: Number(se.unitPrice || se.price || 0),
              qty: se.quantity || se.qty || 0,
              icon: '📦',
            }));
          } catch { /* ignore */ }
        }
        return court;
      }));

      setCourts(withExtras);
    } catch (err) {
      setError(err.message || 'Không tải được danh sách sân');
    }
  };

  const fetchExtras = async () => {
    try {
      const res = await accessoryService.getAllAccessories();
      const data = res.data?.data || res.data || [];
      setExtrasList((Array.isArray(data) ? data : []).map(e => ({
        id: e.id,
        name: e.name,
        price: Number(e.price),
        icon: '📦',
        unit: 'cái',
        stock: e.stockQuantity,
      })));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchCourts(), fetchExtras()]);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Đồng bộ realtime giữa nhiều thiết bị: thiết bị khác mở/đóng/chuyển sân
  // thì trang này tự cập nhật, không cần F5 (docs/05-extra/01-audit/RealtimeCourtSync.md).
  // Nhận sự kiện là fetch lại TOÀN BỘ danh sách sân, không tự ráp state từ
  // payload — tránh sự kiện đến sai thứ tự làm UI kẹt sai trạng thái.
  useEffect(() => {
    const close = connectRealtimeStream({
      branchId: selectedBranchId,
      onEvent: () => fetchCourts()
    });
    // Tab quay lại foreground trên di động: trình duyệt di động thường tạm
    // ngưng kết nối SSE nền khi chuyển app, có thể đã bỏ lỡ sự kiện trong
    // lúc đó — fetch lại ngay 1 lần cho chắc.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchCourts();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      close();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [selectedBranchId]);

  // CRUD Sân
  const handleOpenAddCourtModal = () => {
    setCourtFormMode('add');
    setEditingCourtId(null);
    setCourtFormData({
      name: `Sân ${courts.length + 1}`,
      peakPricePerHour: 100000,
      offpeakPricePerHour: 80000,
      note: '',
    });
    setActiveModal({ type: 'courtModal' });
  };

  const handleOpenEditCourtModal = (court) => {
    setCourtFormMode('edit');
    setEditingCourtId(court.id);
    setCourtFormData({
      name: court.name,
      peakPricePerHour: court.peakPricePerHour || 100000,
      offpeakPricePerHour: court.offpeakPricePerHour || 80000,
      note: court.note || '',
    });
    setActiveModal({ type: 'courtModal' });
  };

  const handleSaveCourt = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: courtFormData.name,
        peakPricePerHour: Number(courtFormData.peakPricePerHour),
        offpeakPricePerHour: Number(courtFormData.offpeakPricePerHour),
        note: courtFormData.note || null,
      };

      if (courtFormMode === 'edit') {
        await courtService.updateCourt(editingCourtId, payload);
      } else {
        await courtService.createCourt(payload);
      }
      await fetchCourts();
      setActiveModal(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi lưu thông tin sân');
    }
  };

  const handleDeleteCourt = async (courtId, courtName) => {
    if (!window.confirm(`Bạn có chắc muốn xóa sân "${courtName}"?`)) return;
    try {
      await courtService.deleteCourt(courtId);
      await fetchCourts();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi xóa sân');
    }
  };

  // Operations
  const handleOpenCourt = (courtId) => {
    const court = courts.find((c) => c.id === courtId);
    setActiveModal({ type: 'open', courtId, courtName: court.name });
    setPlayerNameInput('');
    setPlayerPhoneInput('');
  };

  const confirmOpen = async (e) => {
    e.preventDefault();
    if (!playerNameInput.trim()) return;
    try {
      await courtService.openCourt(activeModal.courtId, {
        guestName: playerNameInput.trim(),
        guestPhone: playerPhoneInput.trim() || undefined
      });
      await fetchCourts();
      setActiveModal(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi mở sân');
    }
  };

  // Hỏi server số tiền nếu thanh toán ngay bây giờ. Server chốt luôn giờ kết thúc
  // của số này (`endTime`); xác nhận thì gửi lại đúng mốc đó, nên hoá đơn ra đúng
  // số thu ngân vừa đọc cho khách — kể cả giờ cao/thấp điểm và các lần đổi sân.
  const loadCheckoutPreview = async (court) => {
    setCheckout({ loading: true, error: null, preview: null, submitting: false, receipt: null });
    try {
      const res = await sessionService.getById(court.session.id);
      const preview = res.data?.data?.checkoutPreview;
      if (!preview) {
        throw new Error('Phiên chơi này đã được đóng ở thiết bị khác. Đóng cửa sổ để xem trạng thái sân mới nhất.');
      }
      setCheckout({ loading: false, error: null, preview, submitting: false, receipt: null });
    } catch (err) {
      setCheckout({ loading: false, error: errorMessageOf(err, 'Không tính được số tiền'), preview: null, submitting: false, receipt: null });
    }
  };

  const handleCheckout = (courtId) => {
    const court = courts.find(c => c.id === courtId);
    setActiveModal({ type: 'checkout', courtId, court });
    loadCheckoutPreview(court);
  };

  const closeCheckout = () => {
    setActiveModal(null);
    setCheckout(null);
  };

  const confirmCheckout = async () => {
    const { court } = activeModal;
    setCheckout((prev) => ({ ...prev, submitting: true, error: null }));
    try {
      const res = await paymentService.checkout({
        sessionId: court.session.id,
        paymentMethod: 'cash',
        endTime: checkout.preview.endTime,
      });
      setCheckout((prev) => ({ ...prev, submitting: false, receipt: res.data.data }));
      fetchCourts();
    } catch (err) {
      setCheckout((prev) => ({ ...prev, submitting: false, error: errorMessageOf(err, 'Lỗi thanh toán') }));
    }
  };

  const handleAddExtra = (courtId) => {
    const court = courts.find(c => c.id === courtId);
    setActiveModal({ type: 'extra', courtId, court });
    setSelectedExtra(extrasList[0] || null);
    setExtraQty(1);
  };

  const confirmAddExtra = async () => {
    if (!selectedExtra) return;
    const court = courts.find(c => c.id === activeModal.courtId);
    try {
      await sessionService.addExtra(court.session.id, {
        extraId: selectedExtra.id,
        quantity: extraQty,
      });
      await Promise.all([fetchCourts(), fetchExtras()]);
      setActiveModal(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi thêm phụ kiện');
    }
  };

  const handleReturnExtra = (courtId) => {
    const court = courts.find(c => c.id === courtId);
    const initialReturns = {};
    court.extras.forEach(e => { initialReturns[e.id] = 0; });
    setReturnItems(initialReturns);
    setActiveModal({ type: 'return', courtId, court });
  };

  const confirmReturnExtra = async () => {
    const court = courts.find(c => c.id === activeModal.courtId);
    try {
      const promises = Object.entries(returnItems)
        .filter(([, qty]) => qty > 0)
        .map(([extraId, returnQuantity]) =>
          sessionService.returnExtra(court.session.id, {
            extraId: parseInt(extraId),
            returnQuantity,
          })
        );
      await Promise.all(promises);
      await Promise.all([fetchCourts(), fetchExtras()]);
      setActiveModal(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi trả đồ');
    }
  };

  const changeCourtStatus = async (courtId, status) => {
    try {
      await courtService.updateStatus(courtId, status);
      await fetchCourts();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi chuyển trạng thái');
    }
  };

  const handleSwitchCourt = (courtId) => {
    const court = courts.find(c => c.id === courtId);
    const availableTargets = courts.filter(c => c.status === 'open' && c.id !== courtId);
    setActiveModal({ type: 'switch', courtId, court, availableTargets });
    setTargetSwitchId(availableTargets[0]?.id || '');
  };

  const confirmSwitchCourt = async () => {
    if (!targetSwitchId) return;
    try {
      await courtService.transferCourt(activeModal.courtId, {
        targetCourtId: parseInt(targetSwitchId),
      });
      await fetchCourts();
      setActiveModal(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi đổi sân');
    }
  };

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải danh sách sân...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">Realtime Court Matrix</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">Sơ đồ quản lý sân thời gian thực</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tự động đếm giờ, tính tiền sân, gọi đồ, trả đồ dư & cập nhật thông tin sân.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex shrink-0 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 px-4 py-2 text-center">
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Đang chơi</span>
              <p className="text-base font-bold text-rose-600 dark:text-rose-400">{courts.filter(c => c.status === 'busy').length} sân</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 px-4 py-2 text-center">
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Sân trống</span>
              <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{courts.filter(c => c.status === 'open').length} sân</p>
            </div>
          </div>
          <button
            onClick={handleOpenAddCourtModal}
            className="shrink-0 whitespace-nowrap rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition"
          >
            + Thêm Sân Mới
          </button>
        </div>
      </div>

      {/* Grid Sân */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {courts.map((court) => {
          const isBusy = court.status === 'busy';
          const isOpen = court.status === 'open';
          const isMaint = court.status === 'maintenance';
          const isInactive = court.status === 'inactive';

          // Kẹp về 0: đồng hồ trình duyệt có thể chậm hơn server vài giây, để âm
          // thì đồng hồ giờ chơi hiện ra số âm ngay khi vừa mở sân.
          const elapsed = isBusy && court.session ? Math.max(0, now - court.session.startTime) : 0;
          // Không tự tính tiền sân ở đây nữa: số cũ luôn nhân giá cao điểm và không biết
          // đổi sân. Tiền sân chỉ hiện ở modal thanh toán, do server tính.
          const extrasFee = court.extras.reduce((sum, e) => sum + e.price * e.qty, 0);

          return (
            <div
              key={court.id}
              className={`rounded-3xl border p-6 transition shadow-xl flex flex-col justify-between ${
                isBusy
                  ? 'border-rose-500/40 bg-gradient-to-b from-white via-white to-rose-50 dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/20 shadow-rose-100 dark:shadow-rose-950/10'
                  : isOpen
                  ? 'border-emerald-500/30 bg-white dark:bg-slate-900/90 hover:border-emerald-500/50 shadow-slate-200/40 dark:shadow-slate-950/20'
                  : 'border-amber-500/30 bg-slate-50 dark:bg-slate-900/60 opacity-80'
              }`}
            >
              <div>
                {/* Card Title & Status Badge */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{court.name}</h3>
                      <button
                        onClick={() => handleOpenEditCourtModal(court)}
                        className="text-xs text-slate-400 hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400"
                        title="Chỉnh sửa thông tin sân"
                      >
                        ✏️
                      </button>
                      {isOpen && (
                        <button
                          onClick={() => handleDeleteCourt(court.id, court.name)}
                          className="text-xs text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                          title="Xóa sân"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatRates(court)}</p>
                  </div>
                  <Badge variant={isBusy ? 'rose' : isOpen ? 'emerald' : isInactive ? 'slate' : 'amber'}>
                    {isBusy ? '🔴 Đang chơi' : isOpen ? '🟢 Trống' : isInactive ? '⚫ Ngưng khai thác' : '🟡 Bảo trì'}
                  </Badge>
                </div>

                {/* Body Content */}
                {isBusy && court.session && (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-50 dark:bg-rose-950/30 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Khách hàng:</p>
                        <p className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">👤 {court.session.playerName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Thời gian chơi:</p>
                        <p className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono tracking-wider animate-pulse">
                          ⏱ {formatTime(elapsed)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 p-4 space-y-2 text-xs">
                      <div className="flex justify-between gap-3 text-slate-500 dark:text-slate-400">
                        <span>Tiền sân:</span>
                        <span className="text-right text-slate-600 dark:text-slate-300">tính theo giờ cao/thấp điểm khi thanh toán</span>
                      </div>

                      {court.extras.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-slate-500 dark:text-slate-400 font-medium">Dịch vụ đi kèm:</p>
                            <button
                              onClick={() => handleReturnExtra(court.id)}
                              className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-semibold"
                            >
                              ↩️ Trả lại đồ
                            </button>
                          </div>
                          {court.extras.map((e) => (
                            <div key={e.id} className="flex justify-between text-slate-600 dark:text-slate-300">
                              <span>{e.icon} {e.name} x{e.qty}</span>
                              <span>{formatMoney(e.price * e.qty)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {extrasFee > 0 && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
                          <span>Phụ kiện đã gọi:</span>
                          <span>{formatMoney(extrasFee)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isOpen && (
                  <div className="mt-8 mb-6 text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <p className="text-slate-500 text-sm">Sân sẵn sàng tiếp nhận khách</p>
                  </div>
                )}

                {isMaint && (
                  <div className="mt-8 mb-6 text-center py-6 border border-amber-500/20 bg-amber-500/5 rounded-2xl">
                    <p className="text-amber-600 dark:text-amber-400 text-sm font-medium">🛠 Đang trong quá trình bảo trì</p>
                  </div>
                )}

                {isInactive && (
                  <div className="mt-8 mb-6 text-center py-6 border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/30 rounded-2xl">
                    <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">⚫ Sân đã ngưng khai thác</p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Không nằm trong công suất kinh doanh</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                {isBusy && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAddExtra(court.id)}
                        className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 transition"
                      >
                        🥤 Thêm Nước/Cầu
                      </button>
                      <button
                        onClick={() => handleSwitchCourt(court.id)}
                        className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 transition"
                      >
                        🔄 Đổi sang sân khác
                      </button>
                    </div>
                    <button
                      onClick={() => handleCheckout(court.id)}
                      className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-950/40 hover:brightness-110 transition"
                    >
                      🏁 Đóng Sân & Tính Tiền
                    </button>
                  </>
                )}

                {isOpen && (
                  <div className="space-y-2">
                    <button
                      onClick={() => handleOpenCourt(court.id)}
                      className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition"
                    >
                      ▶️ Mở Sân Ngay
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => changeCourtStatus(court.id, 'maintenance')}
                        className="rounded-xl border border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:text-slate-200 px-3 py-1.5 text-xs transition"
                      >
                        🔧 Chuyển sang bảo trì
                      </button>
                      <button
                        onClick={() => changeCourtStatus(court.id, 'inactive')}
                        className="rounded-xl border border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:text-slate-200 px-3 py-1.5 text-xs transition"
                      >
                        ⚫ Ngưng khai thác
                      </button>
                    </div>
                  </div>
                )}

                {(isMaint || isInactive) && (
                  <button
                    onClick={() => changeCourtStatus(court.id, 'active')}
                    className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition"
                  >
                    {isMaint ? '✅ Hoàn tất bảo trì (Mở lại)' : '✅ Khai thác trở lại'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- MODAL TẠO / SỬA THÔNG TIN SÂN --- */}
      <Modal
        isOpen={activeModal?.type === 'courtModal'}
        onClose={() => setActiveModal(null)}
        title={courtFormMode === 'edit' ? 'Chỉnh Sửa Thông Tin Sân' : 'Thêm Sân Mới'}
      >
        <form onSubmit={handleSaveCourt} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tên sân *</label>
            <input
              type="text"
              required
              value={courtFormData.name}
              onChange={(e) => setCourtFormData({ ...courtFormData, name: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="VD: Sân 7 (VIP)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Giá cao điểm (/giờ) *</label>
              <input
                type="number"
                required
                value={courtFormData.peakPricePerHour}
                onChange={(e) => setCourtFormData({ ...courtFormData, peakPricePerHour: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Giá thấp điểm (/giờ) *</label>
              <input
                type="number"
                required
                value={courtFormData.offpeakPricePerHour}
                onChange={(e) => setCourtFormData({ ...courtFormData, offpeakPricePerHour: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Ghi chú sân</label>
            <input
              type="text"
              value={courtFormData.note}
              onChange={(e) => setCourtFormData({ ...courtFormData, note: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="VD: Sân thảm Yonex cao cấp..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            >
              {courtFormMode === 'edit' ? 'Lưu Thông Tin' : 'Tạo Sân'}
            </button>
          </div>
        </form>
      </Modal>

      {/* --- CÁC MODAL THAO TÁC SÂN KHÁC --- */}
      <Modal
        isOpen={activeModal?.type === 'open'}
        onClose={() => setActiveModal(null)}
        title={`Mở Sân: ${activeModal?.courtName}`}
      >
        <form onSubmit={confirmOpen} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tên khách hàng hoặc tên nhóm *</label>
            <input
              type="text"
              required
              autoFocus
              value={playerNameInput}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              placeholder="Nhập tên khách (VD: Anh Hùng...)"
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Số điện thoại</label>
            <input
              type="tel"
              value={playerPhoneInput}
              onChange={(e) => setPlayerPhoneInput(e.target.value)}
              placeholder="Không bắt buộc — có SĐT thì lần sau nhận ra khách cũ"
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setActiveModal(null)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">▶️ Bắt Đầu Tính Giờ</button>
          </div>
        </form>
      </Modal>

      {activeModal?.type === 'checkout' && checkout && (() => {
        const { court } = activeModal;
        const { loading: previewLoading, error: checkoutError, preview, submitting, receipt } = checkout;
        const secondaryButton = 'rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm';
        const row = (label, value, valueClass = 'font-semibold text-slate-700 dark:text-slate-200') => (
          <div className="flex justify-between gap-3"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className={valueClass}>{value}</span></div>
        );
        const endedAt = preview
          ? new Date(preview.endTime).toLocaleTimeString('vi-VN', activeTimezone ? { timeZone: activeTimezone } : undefined)
          : null;

        return (
          <Modal isOpen={true} onClose={closeCheckout} title={receipt ? `Đã thanh toán ${court.name}` : `Thanh Toán & Đóng ${court.name}`}>
            <div className="space-y-4">
              {previewLoading && <p className="text-sm text-slate-500 dark:text-slate-400">⏳ Đang tính tiền...</p>}

              {!previewLoading && !preview && (
                <>
                  <p className="rounded-2xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300">{checkoutError}</p>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={closeCheckout} className={secondaryButton}>Đóng</button>
                    <button onClick={() => loadCheckoutPreview(court)} className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">Tính lại</button>
                  </div>
                </>
              )}

              {preview && !receipt && (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/80 p-4 space-y-2 text-sm">
                    {row('Khách hàng:', court.session.playerName, 'font-bold text-slate-900 dark:text-slate-100')}
                    {row('Thời gian chơi:', formatTime(preview.durationSeconds * 1000), 'font-mono font-bold text-rose-600 dark:text-rose-400')}
                    {row('Tính đến:', endedAt, 'font-mono text-slate-600 dark:text-slate-300')}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                      {row('Tiền sân:', formatMoney(preview.courtFee))}
                      {preview.extrasFee > 0 && row('Phụ kiện:', formatMoney(preview.extrasFee))}
                    </div>
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-base font-bold">
                      <span className="text-slate-700 dark:text-slate-200">TỔNG CỘNG:</span>
                      <span className="text-xl text-emerald-600 dark:text-emerald-400">{formatMoney(preview.totalAmount)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tiền sân đã tính theo giờ cao điểm/thấp điểm và các lần đổi sân. Hoá đơn chốt đúng số này nếu xác nhận trong 10 phút.
                  </p>
                  {checkoutError && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                      <span>{checkoutError}</span>
                      <button onClick={() => loadCheckoutPreview(court)} className="font-semibold underline">Tính lại</button>
                    </div>
                  )}
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={closeCheckout} className={secondaryButton}>Quay lại</button>
                    <button onClick={confirmCheckout} disabled={submitting} className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
                      {submitting ? 'Đang thanh toán...' : '💳 Xác Nhận Thanh Toán'}
                    </button>
                  </div>
                </>
              )}

              {receipt && (
                <>
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-2 text-sm">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-300">✅ Hoá đơn {receipt.invoiceNo}</p>
                    {row('Tiền sân:', formatMoney(receipt.courtFee))}
                    {receipt.extrasFee > 0 && row('Phụ kiện:', formatMoney(receipt.extrasFee))}
                    {receipt.discountAmount > 0 && row('Giảm giá:', `-${formatMoney(receipt.discountAmount)}`)}
                    <div className="pt-3 border-t border-emerald-500/20 flex justify-between items-center text-base font-bold">
                      <span className="text-slate-700 dark:text-slate-200">ĐÃ THU:</span>
                      <span className="text-xl text-emerald-600 dark:text-emerald-400">{formatMoney(receipt.totalAmount)}</span>
                    </div>
                  </div>
                  {receipt.totalAmount !== preview?.totalAmount && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Khác số xem trước ({formatMoney(preview?.totalAmount || 0)}) vì phụ kiện của phiên vừa thay đổi — thu theo hoá đơn.
                    </p>
                  )}
                  <div className="flex justify-end pt-2">
                    <button onClick={closeCheckout} className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">Xong</button>
                  </div>
                </>
              )}
            </div>
          </Modal>
        );
      })()}

      <Modal isOpen={activeModal?.type === 'extra'} onClose={() => setActiveModal(null)} title={`Thêm Nước / Phụ Kiện`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {extrasList.map((item) => (
              <button key={item.id} onClick={() => setSelectedExtra(item)} className={`p-3 rounded-2xl border text-left transition ${selectedExtra?.id === item.id ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300'}`}>
                <div className="font-semibold text-xs">{item.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{formatMoney(item.price)} • Kho: {item.stock}</div>
              </button>
            ))}
          </div>
          {selectedExtra && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 p-3">
              <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Số lượng mua:</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setExtraQty(Math.max(1, extraQty - 1))} className="h-8 w-8 rounded-lg bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 font-bold">-</button>
                <span className="font-bold text-base text-slate-900 dark:text-slate-100 min-w-6 text-center">{extraQty}</span>
                <button onClick={() => setExtraQty(extraQty + 1)} className="h-8 w-8 rounded-lg bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 font-bold">+</button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setActiveModal(null)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button onClick={confirmAddExtra} className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">➕ Thêm Món</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal?.type === 'return'} onClose={() => setActiveModal(null)} title={`↩️ Trả Đồ Dư`}>
        <div className="space-y-4">
          <div className="space-y-3">
            {activeModal?.court?.extras.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 p-3.5">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{item.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Đã lấy: {item.qty} • Giá: {formatMoney(item.price)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setReturnItems({ ...returnItems, [item.id]: Math.max(0, (returnItems[item.id] || 0) - 1) })} className="h-8 w-8 rounded-lg bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 font-bold">-</button>
                  <span className="font-bold text-base text-amber-600 dark:text-amber-400 min-w-6 text-center">{returnItems[item.id] || 0}</span>
                  <button onClick={() => setReturnItems({ ...returnItems, [item.id]: Math.min(item.qty, (returnItems[item.id] || 0) + 1) })} className="h-8 w-8 rounded-lg bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 font-bold">+</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setActiveModal(null)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button onClick={confirmReturnExtra} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400">↩️ Xác Nhận Trả Đồ</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal?.type === 'switch'} onClose={() => setActiveModal(null)} title={`Đổi Sân`}>
        <div className="space-y-4">
          <select value={targetSwitchId} onChange={(e) => setTargetSwitchId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 px-4 py-2.5 text-sm">
            {activeModal?.availableTargets?.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {formatRates(c)}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Thời gian đã chơi ở {activeModal?.court?.name} vẫn tính theo giá sân này; giá sân mới chỉ áp từ lúc đổi.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setActiveModal(null)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button onClick={confirmSwitchCourt} className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400">🔄 Xác Nhận Đổi Sân</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
