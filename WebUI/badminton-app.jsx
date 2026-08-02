import { useState, useEffect, useCallback } from "react";

const COURTS = [
  { id: 1, name: "Sân 1", pricePerHour: 80000 },
  { id: 2, name: "Sân 2", pricePerHour: 80000 },
  { id: 3, name: "Sân 3", pricePerHour: 100000 },
  { id: 4, name: "Sân 4", pricePerHour: 100000 },
  { id: 5, name: "Sân VIP", pricePerHour: 150000 },
  { id: 6, name: "Sân 6", pricePerHour: 80000 },
];

const EXTRAS = [
  { id: "nuoc_loc", name: "Nước lọc", price: 10000, icon: "💧", unit: "chai" },
  { id: "nuoc_ngot", name: "Nước ngọt", price: 15000, icon: "🥤", unit: "lon" },
  { id: "nuoc_tang_luc", name: "Nước tăng lực", price: 25000, icon: "⚡", unit: "lon" },
  { id: "cau_long_1", name: "Cầu lông (thường)", price: 45000, icon: "🏸", unit: "hộp" },
  { id: "cau_long_2", name: "Cầu lông (tốt)", price: 75000, icon: "🏸", unit: "hộp" },
  { id: "khan_lanh", name: "Khăn lạnh", price: 5000, icon: "🧊", unit: "cái" },
  { id: "bang_co", name: "Băng cơ", price: 20000, icon: "🩹", unit: "cuộn" },
];

const STATUS = { OPEN: "open", BUSY: "busy", MAINTENANCE: "maintenance" };

const formatTime = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const formatMoney = (n) => new Intl.NumberFormat("vi-VN").format(n) + "đ";

const now = () => Date.now();

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [courts, setCourts] = useState(
    COURTS.map((c) => ({ ...c, status: STATUS.OPEN, session: null, extras: [], note: "" }))
  );
  const [bookings, setBookings] = useState([]);
  const [history, setHistory] = useState([]);
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState(null);
  const [addExtraModal, setAddExtraModal] = useState(null);
  const [bookingModal, setBookingModal] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openCourt = (courtId) => {
    setModal({ type: "open", courtId });
  };

  const closeCourt = (courtId) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court.session) return;
    const elapsed = now() - court.session.startTime;
    const hours = elapsed / 3600000;
    const courtFee = Math.ceil(hours * court.pricePerHour);
    const extrasFee = court.extras.reduce((s, e) => s + e.price * e.qty, 0);
    const total = courtFee + extrasFee;
    setModal({ type: "checkout", courtId, court, elapsed, courtFee, extrasFee, total });
  };

  const confirmOpen = (courtId, playerName) => {
    setCourts((cs) =>
      cs.map((c) =>
        c.id === courtId
          ? { ...c, status: STATUS.BUSY, session: { startTime: now(), playerName }, extras: [] }
          : c
      )
    );
    setModal(null);
    showToast(`Đã mở ${courts.find((c) => c.id === courtId).name} cho ${playerName}`);
  };

  const confirmClose = (courtId) => {
    const court = courts.find((c) => c.id === courtId);
    const elapsed = now() - court.session.startTime;
    const hours = elapsed / 3600000;
    const courtFee = Math.ceil(hours * court.pricePerHour);
    const extrasFee = court.extras.reduce((s, e) => s + e.price * e.qty, 0);
    const total = courtFee + extrasFee;
    const record = {
      id: Date.now(),
      courtId,
      courtName: court.name,
      playerName: court.session.playerName,
      startTime: court.session.startTime,
      endTime: now(),
      duration: elapsed,
      courtFee,
      extras: [...court.extras],
      extrasFee,
      total,
      date: new Date().toLocaleDateString("vi-VN"),
    };
    setHistory((h) => [record, ...h]);
    setCourts((cs) =>
      cs.map((c) => (c.id === courtId ? { ...c, status: STATUS.OPEN, session: null, extras: [], note: "" } : c))
    );
    setModal(null);
    showToast(`Đã đóng ${court.name} — Tổng: ${formatMoney(total)}`, "info");
  };

  const addExtra = (courtId, extraId, qty) => {
    const extra = EXTRAS.find((e) => e.id === extraId);
    setCourts((cs) =>
      cs.map((c) => {
        if (c.id !== courtId) return c;
        const existing = c.extras.find((e) => e.id === extraId);
        if (existing) {
          return { ...c, extras: c.extras.map((e) => (e.id === extraId ? { ...e, qty: e.qty + qty } : e)) };
        }
        return { ...c, extras: [...c.extras, { ...extra, qty }] };
      })
    );
    setAddExtraModal(null);
    showToast(`Đã thêm ${qty} ${extra.unit} ${extra.name}`);
  };

  const setMaintenance = (courtId) => {
    setCourts((cs) =>
      cs.map((c) => (c.id === courtId ? { ...c, status: STATUS.MAINTENANCE, session: null, extras: [] } : c))
    );
    showToast("Sân chuyển sang bảo trì", "warn");
  };

  const setAvailable = (courtId) => {
    setCourts((cs) => cs.map((c) => (c.id === courtId ? { ...c, status: STATUS.OPEN } : c)));
    showToast("Sân đã sẵn sàng");
  };

  const confirmBooking = (data) => {
    setBookings((b) => [{ id: Date.now(), ...data, status: "pending" }, ...b]);
    setBookingModal(null);
    showToast(`Đã đặt lịch: ${data.courtName} lúc ${data.time}`);
  };

  const todayRevenue = history
    .filter((h) => h.date === new Date().toLocaleDateString("vi-VN"))
    .reduce((s, h) => s + h.total, 0);

  const busyCourts = courts.filter((c) => c.status === STATUS.BUSY).length;
  const openCourts = courts.filter((c) => c.status === STATUS.OPEN).length;

  const navItems = [
    { id: "dashboard", label: "Tổng quan", icon: "🏠" },
    { id: "courts", label: "Quản lý sân", icon: "🏸" },
    { id: "bookings", label: "Đặt lịch", icon: "📅" },
    { id: "history", label: "Lịch sử", icon: "📋" },
    { id: "extras", label: "Phụ kiện", icon: "🛒" },
  ];

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", minHeight: "100vh", background: "#f0faf4", color: "#1a2e1a" }}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <header style={{ background: "#fff", borderBottom: "2px solid #e0f0e5", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(34,139,34,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", borderRadius: 12, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏸</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#15803d", lineHeight: 1.1 }}>BadmintonPro</div>
            <div style={{ fontSize: 11, color: "#86efac", fontWeight: 600 }}>Quản lý sân chuyên nghiệp</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
                fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s",
                background: page === n.id ? "#dcfce7" : "transparent",
                color: page === n.id ? "#15803d" : "#4b7a55",
              }}
            >
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", borderRadius: 10, padding: "8px 14px", border: "1px solid #bbf7d0" }}>
          <span style={{ fontSize: 18 }}>💰</span>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Doanh thu hôm nay</div>
            <div style={{ fontWeight: 900, fontSize: 15, color: "#15803d" }}>{formatMoney(todayRevenue)}</div>
          </div>
        </div>
      </header>

      <main style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
        {page === "dashboard" && <Dashboard courts={courts} history={history} todayRevenue={todayRevenue} busyCourts={busyCourts} openCourts={openCourts} tick={tick} setPage={setPage} />}
        {page === "courts" && <CourtsPage courts={courts} tick={tick} openCourt={openCourt} closeCourt={closeCourt} setMaintenance={setMaintenance} setAvailable={setAvailable} setAddExtraModal={setAddExtraModal} />}
        {page === "bookings" && <BookingsPage bookings={bookings} setBookingModal={setBookingModal} setBookings={setBookings} courts={courts} showToast={showToast} />}
        {page === "history" && <HistoryPage history={history} />}
        {page === "extras" && <ExtrasPage />}
      </main>

      {/* MODALS */}
      {modal?.type === "open" && <OpenModal courtId={modal.courtId} courts={courts} onConfirm={confirmOpen} onClose={() => setModal(null)} />}
      {modal?.type === "checkout" && <CheckoutModal data={modal} onConfirm={() => confirmClose(modal.courtId)} onClose={() => setModal(null)} tick={tick} />}
      {addExtraModal && <AddExtraModal courtId={addExtraModal} courts={courts} onConfirm={addExtra} onClose={() => setAddExtraModal(null)} />}
      {bookingModal && <BookingModal courts={courts} onConfirm={confirmBooking} onClose={() => setBookingModal(null)} />}

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, padding: "14px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14,
          background: toast.type === "success" ? "#16a34a" : toast.type === "warn" ? "#d97706" : "#0284c7",
          color: "#fff", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", zIndex: 9999, display: "flex", alignItems: "center", gap: 10,
          animation: "slideIn 0.3s ease",
        }}>
          {toast.type === "success" ? "✅" : toast.type === "warn" ? "⚠️" : "ℹ️"} {toast.msg}
        </div>
      )}
      <style>{`@keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

function Dashboard({ courts, history, todayRevenue, busyCourts, openCourts, tick, setPage }) {
  const weekRevenue = history.slice(0, 50).reduce((s, h) => s + h.total, 0);
  const totalSessions = history.length;
  const avgSession = totalSessions > 0 ? Math.round(history.reduce((s, h) => s + h.duration, 0) / totalSessions / 60000) : 0;

  const statCards = [
    { label: "Sân đang hoạt động", value: busyCourts, total: courts.length, icon: "🏸", color: "#16a34a", bg: "#dcfce7" },
    { label: "Sân trống", value: openCourts, total: courts.length, icon: "✅", color: "#0284c7", bg: "#dbeafe" },
    { label: "Doanh thu hôm nay", value: formatMoney(todayRevenue), icon: "💵", color: "#d97706", bg: "#fef3c7" },
    { label: "Tổng lượt chơi", value: totalSessions, icon: "📊", color: "#7c3aed", bg: "#ede9fe" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#15803d", margin: 0 }}>Tổng quan hệ thống</h1>
        <p style={{ color: "#6b7280", margin: "4px 0 0", fontWeight: 600 }}>{new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "20px", border: `2px solid ${s.bg}`, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 28 }}>{s.icon}</span>
              <div style={{ background: s.bg, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: s.color }}>{s.label}</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #e0f0e5" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: "#15803d" }}>🏸 Trạng thái sân realtime</h2>
            <button onClick={() => setPage("courts")} style={{ background: "#dcfce7", border: "none", borderRadius: 8, padding: "6px 14px", color: "#15803d", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Quản lý →</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {courts.map((c) => (
              <CourtMiniCard key={c.id} court={c} tick={tick} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #e0f0e5" }}>
            <h2 style={{ margin: "0 0 14px", fontWeight: 800, fontSize: 16, color: "#15803d" }}>📋 Hoạt động gần đây</h2>
            {history.length === 0 ? (
              <div style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Chưa có lịch sử</div>
            ) : (
              history.slice(0, 5).map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.courtName} — {h.playerName}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{formatTime(h.duration)}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: "#16a34a", fontSize: 13 }}>{formatMoney(h.total)}</div>
                </div>
              ))
            )}
          </div>

          <div style={{ background: "linear-gradient(135deg, #15803d, #22c55e)", borderRadius: 16, padding: 20, color: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, marginBottom: 4 }}>Thống kê tuần</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{formatMoney(weekRevenue)}</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{totalSessions} lượt · TB {avgSession} phút/lượt</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CourtMiniCard({ court, tick }) {
  const elapsed = court.session ? now() - court.session.startTime : 0;
  const statusColor = { open: "#16a34a", busy: "#ef4444", maintenance: "#d97706" };
  const statusLabel = { open: "Trống", busy: "Đang chơi", maintenance: "Bảo trì" };
  const statusBg = { open: "#dcfce7", busy: "#fee2e2", maintenance: "#fef3c7" };

  return (
    <div style={{ background: statusBg[court.status], borderRadius: 12, padding: "12px", border: `1.5px solid ${statusColor[court.status]}30` }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: statusColor[court.status] }}>{court.name}</div>
      <div style={{ fontSize: 11, background: `${statusColor[court.status]}20`, color: statusColor[court.status], borderRadius: 6, padding: "2px 8px", display: "inline-block", fontWeight: 700, marginTop: 4 }}>
        {statusLabel[court.status]}
      </div>
      {court.session && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", marginTop: 4 }}>⏱ {formatTime(elapsed)}</div>
      )}
    </div>
  );
}

function CourtsPage({ courts, tick, openCourt, closeCourt, setMaintenance, setAvailable, setAddExtraModal }) {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: "#15803d", margin: "0 0 20px" }}>🏸 Quản lý sân</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {courts.map((c) => <CourtCard key={c.id} court={c} tick={tick} openCourt={openCourt} closeCourt={closeCourt} setMaintenance={setMaintenance} setAvailable={setAvailable} setAddExtraModal={setAddExtraModal} />)}
      </div>
    </div>
  );
}

function CourtCard({ court, tick, openCourt, closeCourt, setMaintenance, setAvailable, setAddExtraModal }) {
  const elapsed = court.session ? now() - court.session.startTime : 0;
  const hours = elapsed / 3600000;
  const liveCourtFee = Math.ceil(hours * court.pricePerHour);
  const liveExtrasFee = court.extras.reduce((s, e) => s + e.price * e.qty, 0);
  const liveTotal = liveCourtFee + liveExtrasFee;

  const isBusy = court.status === "busy";
  const isOpen = court.status === "open";
  const isMaint = court.status === "maintenance";

  return (
    <div style={{
      background: "#fff", borderRadius: 20, border: isBusy ? "2px solid #ef4444" : isOpen ? "2px solid #22c55e" : "2px solid #f59e0b",
      overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", transition: "transform 0.2s",
    }}>
      {/* Header */}
      <div style={{ background: isBusy ? "#ef4444" : isOpen ? "#16a34a" : "#d97706", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>{court.name}</div>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600 }}>{formatMoney(court.pricePerHour)}/giờ</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 12px", color: "#fff", fontWeight: 800, fontSize: 13 }}>
          {isBusy ? "🔴 Đang chơi" : isOpen ? "🟢 Trống" : "🟡 Bảo trì"}
        </div>
      </div>

      <div style={{ padding: "16px 18px" }}>
        {isBusy && court.session && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>Khách hàng</div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>👤 {court.session.playerName}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>Thời gian</div>
                <div style={{ fontWeight: 900, fontSize: 16, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>⏱ {formatTime(elapsed)}</div>
              </div>
            </div>

            <div style={{ background: "#f9fafb", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#6b7280" }}>Tiền sân</span>
                <span style={{ fontWeight: 700 }}>{formatMoney(liveCourtFee)}</span>
              </div>
              {court.extras.map((e) => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 2 }}>
                  <span>{e.icon} {e.name} ×{e.qty}</span>
                  <span>{formatMoney(e.price * e.qty)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 15, color: "#15803d" }}>
                <span>Tổng cộng</span>
                <span>{formatMoney(liveTotal)}</span>
              </div>
            </div>

            <button
              onClick={() => setAddExtraModal(court.id)}
              style={{ width: "100%", padding: "8px", borderRadius: 8, border: "2px dashed #22c55e", background: "transparent", color: "#16a34a", fontWeight: 700, cursor: "pointer", fontSize: 13, marginBottom: 8 }}
            >
              ➕ Thêm nước / cầu
            </button>
            <button
              onClick={() => closeCourt(court.id)}
              style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "#ef4444", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
            >
              🏁 Đóng sân & Tính tiền
            </button>
          </>
        )}

        {isOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
            <div style={{ textAlign: "center", padding: "16px 0", color: "#9ca3af", fontSize: 14 }}>Sân đang trống</div>
            <button
              onClick={() => openCourt(court.id)}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
            >
              ▶️ Mở sân
            </button>
            <button
              onClick={() => setMaintenance(court.id)}
              style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #d97706", background: "#fef3c7", color: "#92400e", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
            >
              🔧 Chuyển bảo trì
            </button>
          </div>
        )}

        {isMaint && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
            <div style={{ textAlign: "center", padding: "16px 0", color: "#d97706", fontSize: 14, fontWeight: 700 }}>🔧 Đang bảo trì</div>
            <button
              onClick={() => setAvailable(court.id)}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
            >
              ✅ Mở lại sân
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingsPage({ bookings, setBookingModal, setBookings, courts, showToast }) {
  const today = new Date().toLocaleDateString("vi-VN");

  const updateStatus = (id, status) => {
    setBookings((b) => b.map((bk) => (bk.id === id ? { ...bk, status } : bk)));
    showToast(status === "confirmed" ? "Đã xác nhận lịch đặt" : "Đã huỷ lịch đặt", status === "confirmed" ? "success" : "warn");
  };

  const statusStyle = {
    pending: { bg: "#fef3c7", color: "#92400e", label: "Chờ xác nhận" },
    confirmed: { bg: "#dcfce7", color: "#15803d", label: "Đã xác nhận" },
    cancelled: { bg: "#fee2e2", color: "#991b1b", label: "Đã huỷ" },
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#15803d", margin: 0 }}>📅 Đặt lịch</h1>
        <button
          onClick={() => setBookingModal(true)}
          style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
        >
          + Tạo lịch đặt mới
        </button>
      </div>

      {bookings.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: "60px 20px", textAlign: "center", border: "1px solid #e0f0e5" }}>
          <div style={{ fontSize: 48 }}>📅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#9ca3af", marginTop: 12 }}>Chưa có lịch đặt nào</div>
          <button onClick={() => setBookingModal(true)} style={{ marginTop: 16, padding: "12px 28px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
            Tạo lịch đặt đầu tiên
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {bookings.map((b) => (
            <div key={b.id} style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", border: "1px solid #e0f0e5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ background: "#dcfce7", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#15803d" }}>{b.time}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{b.date}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{b.customerName}</div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>📞 {b.phone} · {b.courtName}</div>
                  {b.note && <div style={{ color: "#9ca3af", fontSize: 12, fontStyle: "italic" }}>{b.note}</div>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: statusStyle[b.status].bg, color: statusStyle[b.status].color }}>
                  {statusStyle[b.status].label}
                </span>
                {b.status === "pending" && (
                  <>
                    <button onClick={() => updateStatus(b.id, "confirmed")} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>✓ Xác nhận</button>
                    <button onClick={() => updateStatus(b.id, "cancelled")} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#991b1b", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>✕ Huỷ</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryPage({ history }) {
  const [filter, setFilter] = useState("all");
  const today = new Date().toLocaleDateString("vi-VN");
  const filtered = filter === "today" ? history.filter((h) => h.date === today) : history;
  const total = filtered.reduce((s, h) => s + h.total, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#15803d", margin: 0 }}>📋 Lịch sử & Doanh thu</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {["all", "today"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 700, cursor: "pointer", fontSize: 13, background: filter === f ? "#16a34a" : "#f3f4f6", color: filter === f ? "#fff" : "#4b5563" }}>
              {f === "all" ? "Tất cả" : "Hôm nay"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "linear-gradient(135deg, #15803d, #22c55e)", borderRadius: 16, padding: 20, marginBottom: 20, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ opacity: 0.8, fontSize: 14, fontWeight: 600 }}>Tổng doanh thu {filter === "today" ? "hôm nay" : "tất cả"}</div>
          <div style={{ fontSize: 32, fontWeight: 900 }}>{formatMoney(total)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ opacity: 0.8, fontSize: 14 }}>{filtered.length} lượt chơi</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🏸</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: "60px 20px", textAlign: "center", border: "1px solid #e0f0e5" }}>
          <div style={{ fontSize: 48 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#9ca3af", marginTop: 12 }}>Chưa có lịch sử</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((h) => (
            <div key={h.id} style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", border: "1px solid #e0f0e5" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{h.courtName} — {h.playerName}</div>
                  <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
                    ⏱ {formatTime(h.duration)} · {h.date}
                  </div>
                  {h.extras.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {h.extras.map((e) => (
                        <span key={e.id} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#15803d", fontWeight: 600 }}>
                          {e.icon} {e.name} ×{e.qty}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#16a34a" }}>{formatMoney(h.total)}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>Sân: {formatMoney(h.courtFee)} · Khác: {formatMoney(h.extrasFee)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExtrasPage() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: "#15803d", margin: "0 0 20px" }}>🛒 Phụ kiện & Đồ uống</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {EXTRAS.map((e) => (
          <div key={e.id} style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #e0f0e5", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{e.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{e.name}</div>
            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>Đơn vị: {e.unit}</div>
            <div style={{ background: "#dcfce7", color: "#15803d", borderRadius: 10, padding: "6px 0", fontWeight: 900, fontSize: 16 }}>{formatMoney(e.price)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenModal({ courtId, courts, onConfirm, onClose }) {
  const [name, setName] = useState("");
  const court = courts.find((c) => c.id === courtId);

  return (
    <Modal title={`Mở ${court.name}`} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 700, fontSize: 14, display: "block", marginBottom: 6, color: "#374151" }}>Tên khách hàng *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nhập tên khách..."
          style={{ width: "100%", padding: "12px", borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          onFocus={(e) => (e.target.style.borderColor = "#22c55e")}
          onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
        />
      </div>
      <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: "#15803d" }}>
        ⏰ Bắt đầu tính giờ lúc: {new Date().toLocaleTimeString("vi-VN")} · 💰 {formatMoney(court.pricePerHour)}/giờ
      </div>
      <button
        disabled={!name.trim()}
        onClick={() => onConfirm(courtId, name.trim())}
        style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: name.trim() ? "#16a34a" : "#d1fae5", color: "#fff", fontWeight: 800, cursor: name.trim() ? "pointer" : "not-allowed", fontSize: 15 }}
      >
        ▶️ Bắt đầu tính giờ
      </button>
    </Modal>
  );
}

function CheckoutModal({ data, onConfirm, onClose, tick }) {
  const { court, elapsed, courtFee, extrasFee, total } = data;
  const liveElapsed = court.session ? now() - court.session.startTime : elapsed;
  const liveHours = liveElapsed / 3600000;
  const liveCourtFee = Math.ceil(liveHours * court.pricePerHour);
  const liveTotal = liveCourtFee + extrasFee;

  return (
    <Modal title="🧾 Thanh toán" onClose={onClose}>
      <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#6b7280", fontWeight: 600 }}>Khách hàng</span>
          <span style={{ fontWeight: 800 }}>{court.session?.playerName}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#6b7280", fontWeight: 600 }}>Thời gian</span>
          <span style={{ fontWeight: 800, color: "#ef4444" }}>{formatTime(liveElapsed)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#6b7280", fontWeight: 600 }}>Tiền sân</span>
          <span style={{ fontWeight: 700 }}>{formatMoney(liveCourtFee)}</span>
        </div>
        {court.extras.map((e) => (
          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>{e.icon} {e.name} ×{e.qty}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{formatMoney(e.price * e.qty)}</span>
          </div>
        ))}
        <div style={{ borderTop: "2px solid #22c55e", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 900, fontSize: 18, color: "#15803d" }}>TỔNG CỘNG</span>
          <span style={{ fontWeight: 900, fontSize: 22, color: "#15803d" }}>{formatMoney(liveTotal)}</span>
        </div>
      </div>
      <button onClick={onConfirm} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontWeight: 900, cursor: "pointer", fontSize: 16 }}>
        💳 Xác nhận thanh toán
      </button>
    </Modal>
  );
}

function AddExtraModal({ courtId, courts, onConfirm, onClose }) {
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);

  return (
    <Modal title="➕ Thêm nước / Cầu" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {EXTRAS.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelected(e.id)}
            style={{
              padding: "12px", borderRadius: 10, border: `2px solid ${selected === e.id ? "#22c55e" : "#e5e7eb"}`,
              background: selected === e.id ? "#f0fdf4" : "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 20 }}>{e.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{e.name}</div>
            <div style={{ color: "#16a34a", fontWeight: 800, fontSize: 13 }}>{formatMoney(e.price)}/{e.unit}</div>
          </button>
        ))}
      </div>

      {selected && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
            <span style={{ fontWeight: 700 }}>Số lượng</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 16 }}>-</button>
              <span style={{ fontWeight: 900, fontSize: 18, minWidth: 24, textAlign: "center" }}>{qty}</span>
              <button onClick={() => setQty(qty + 1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 16 }}>+</button>
            </div>
          </div>
          <button
            onClick={() => onConfirm(courtId, selected, qty)}
            style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 15 }}
          >
            ✅ Thêm {qty} {EXTRAS.find((e) => e.id === selected)?.unit} · {formatMoney(EXTRAS.find((e) => e.id === selected)?.price * qty)}
          </button>
        </>
      )}
    </Modal>
  );
}

function BookingModal({ courts, onConfirm, onClose }) {
  const [form, setForm] = useState({ customerName: "", phone: "", courtId: "", date: new Date().toISOString().split("T")[0], time: "08:00", duration: "1", note: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const court = courts.find((c) => c.id === parseInt(form.courtId));
  const valid = form.customerName && form.phone && form.courtId && form.date && form.time;

  const handleConfirm = () => {
    onConfirm({
      customerName: form.customerName,
      phone: form.phone,
      courtId: parseInt(form.courtId),
      courtName: court.name,
      date: new Date(form.date).toLocaleDateString("vi-VN"),
      time: form.time,
      duration: form.duration,
      note: form.note,
    });
  };

  return (
    <Modal title="📅 Tạo lịch đặt sân" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tên khách hàng *"><input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Nguyễn Văn A" style={inputStyle} /></Field>
        <Field label="Số điện thoại *"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0901234567" style={inputStyle} /></Field>
        <Field label="Chọn sân *">
          <select value={form.courtId} onChange={(e) => set("courtId", e.target.value)} style={inputStyle}>
            <option value="">-- Chọn sân --</option>
            {courts.filter((c) => c.status !== "maintenance").map((c) => <option key={c.id} value={c.id}>{c.name} — {formatMoney(c.pricePerHour)}/h</option>)}
          </select>
        </Field>
        <Field label="Thời lượng">
          <select value={form.duration} onChange={(e) => set("duration", e.target.value)} style={inputStyle}>
            {["1", "1.5", "2", "2.5", "3"].map((d) => <option key={d} value={d}>{d} giờ</option>)}
          </select>
        </Field>
        <Field label="Ngày *"><input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} style={inputStyle} /></Field>
        <Field label="Giờ *"><input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} style={inputStyle} /></Field>
      </div>
      <Field label="Ghi chú">
        <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Yêu cầu đặc biệt..." style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
      </Field>
      {court && (
        <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 12, margin: "12px 0", fontSize: 13, color: "#15803d", fontWeight: 600 }}>
          💰 Dự tính: {formatMoney(court.pricePerHour * parseFloat(form.duration))} ({court.name} × {form.duration}h)
        </div>
      )}
      <button disabled={!valid} onClick={handleConfirm} style={{ width: "100%", marginTop: 8, padding: "14px", borderRadius: 10, border: "none", background: valid ? "#16a34a" : "#d1fae5", color: "#fff", fontWeight: 800, cursor: valid ? "pointer" : "not-allowed", fontSize: 15 }}>
        📅 Xác nhận đặt lịch
      </button>
    </Modal>
  );
}

const inputStyle = { padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ fontWeight: 700, fontSize: 12, display: "block", marginBottom: 5, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontWeight: 900, fontSize: 18, color: "#15803d" }}>{title}</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#f3f4f6", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
