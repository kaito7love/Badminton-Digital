import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./HomePage.css";
import { publicService, bookingService } from "../../services/apiServices";
import { useAuth } from "../../contexts/AuthContext";
import { roleOf } from "../../utils/roles";

// Lựa chọn của khách được giữ lại khi họ phải rẽ qua trang đăng nhập, để quay
// về là đặt tiếp chứ không phải chọn lại từ đầu.
const PENDING_BOOKING_KEY = "pending_booking";

const addHours = (hhmm, hours) => {
  const [h, m] = hhmm.split(":").map(Number);
  const end = Math.min(h + Number(hours), 23);
  return `${String(end).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatVnd = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [courts, setCourts] = useState([]);
  const [peakHours, setPeakHours] = useState({ peakStartHour: 17, peakEndHour: 22 });
  const [catalogError, setCatalogError] = useState(null);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [booking, setBooking] = useState({
    date: new Date().toLocaleDateString("en-CA"),
    time: "17:00",
    duration: "2",
    court: "",
  });
  const closeButtonRef = useRef(null);
  const lastFocusedElementRef = useRef(null);

  // Giá một khung đặt: cộng theo từng giờ, giờ nào rơi vào cao điểm thì tính giá
  // cao điểm — cùng quy tắc với priceCalculator ở backend.
  const estimatePrice = (court, startTime, hours) => {
    if (!court) return 0;
    const startHour = Number(String(startTime).split(":")[0]);
    let total = 0;
    for (let i = 0; i < Number(hours); i += 1) {
      const hour = startHour + i;
      const isPeak = hour >= peakHours.peakStartHour && hour < peakHours.peakEndHour;
      total += isPeak ? court.peakPricePerHour : court.offpeakPricePerHour;
    }
    return total;
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isModalOpen) return undefined;
    closeButtonRef.current?.focus();
    const handleEscape = (event) => {
      if (event.key === "Escape") closeBookingModal();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isModalOpen]);

  // Danh mục sân và bảng giá lấy thẳng từ hệ thống, không cứng trong code —
  // nếu không, đổi giá ở màn Cài đặt mà trang chủ vẫn rao giá cũ.
  useEffect(() => {
    let cancelled = false;
    publicService
      .getCourts()
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        const list = data?.courts || [];
        setCourts(list);
        if (data?.peakHours) setPeakHours(data.peakHours);
        const firstBookable = list.find((c) => c.bookable);
        if (firstBookable) setBooking((cur) => ({ ...cur, court: String(firstBookable.id) }));
      })
      .catch(() => {
        if (!cancelled) setCatalogError("Chưa tải được danh sách sân. Vui lòng thử lại sau.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Quay lại sau khi đăng nhập: dựng lại đúng lựa chọn dở dang.
  useEffect(() => {
    if (!user || courts.length === 0) return;
    const saved = sessionStorage.getItem(PENDING_BOOKING_KEY);
    if (!saved) return;
    sessionStorage.removeItem(PENDING_BOOKING_KEY);
    try {
      const pending = JSON.parse(saved);
      setBooking(pending.form);
      setSelectedCourt(pending.selection);
      setIsModalOpen(true);
    } catch {
      // Dữ liệu hỏng thì bỏ qua, khách chọn lại từ đầu
    }
  }, [user, courts.length]);

  const closeBookingModal = () => {
    setIsModalOpen(false);
    lastFocusedElementRef.current?.focus();
  };

  /**
   * Các nút "Đặt sân" rải khắp phần giới thiệu chỉ là lối tắt: chúng điền sẵn
   * form rồi đưa khách về widget, chứ không tự mở hộp xác nhận. Khung giờ có
   * còn trống hay không phải do hệ thống trả lời, không phải do trang tĩnh này
   * đoán — nên mọi đường đều đi qua đúng một chỗ kiểm tra.
   */
  const startBookingFromCard = (courtIndex, time, hours = 2) => {
    const court = courts[courtIndex] || courts.find((c) => c.bookable);
    if (!court) {
      showToast("Chưa tải được danh sách sân. Vui lòng thử lại sau.");
      return;
    }
    setBooking((cur) => ({
      ...cur,
      court: String(court.id),
      time,
      duration: String(hours),
    }));
    scrollToSection("booking-widget");
  };

  const handleBookingChange = (event) => {
    setBooking((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleQuickBooking = async (event) => {
    event.preventDefault();
    const court = courts.find((c) => String(c.id) === String(booking.court));
    if (!court) {
      showToast("Vui lòng chọn sân.");
      return;
    }

    const startTime = booking.time;
    const endTime = addHours(startTime, booking.duration);

    setChecking(true);
    try {
      // Hỏi đúng hệ thống xem còn trống không, thay vì hứa suông rồi để khách
      // phát hiện trùng lịch ở bước cuối.
      const res = await publicService.checkAvailability({
        courtId: court.id,
        bookingDate: booking.date,
        startTime,
        endTime,
      });
      if (!res.data?.data?.available) {
        showToast(res.data?.data?.message || "Khung giờ này đã có người đặt. Mời bạn chọn giờ khác.");
        return;
      }

      lastFocusedElementRef.current = document.activeElement;
      setSelectedCourt({
        courtId: court.id,
        name: court.name,
        bookingDate: booking.date,
        startTime,
        endTime,
        duration: Number(booking.duration),
        price: estimatePrice(court, startTime, booking.duration),
      });
      setIsModalOpen(true);
    } catch (err) {
      showToast(err.response?.data?.message || "Không kiểm tra được khung giờ. Vui lòng thử lại.");
    } finally {
      setChecking(false);
    }
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCourt) return;

    // Chưa đăng nhập: cất lựa chọn lại rồi mời đăng nhập, quay về là đặt tiếp.
    if (!user) {
      sessionStorage.setItem(
        PENDING_BOOKING_KEY,
        JSON.stringify({ form: booking, selection: selectedCourt }),
      );
      navigate("/login", { state: { from: { pathname: "/" } } });
      return;
    }

    if (roleOf(user) !== "customer") {
      showToast("Tài khoản nhân viên vui lòng đặt lịch trong màn Quản Lý Đặt Sân.");
      return;
    }

    setSubmitting(true);
    try {
      await bookingService.createBooking({
        courtId: selectedCourt.courtId,
        bookingDate: selectedCourt.bookingDate,
        startTime: selectedCourt.startTime,
        endTime: selectedCourt.endTime,
      });
      closeBookingModal();
      navigate("/my-bookings");
    } catch (err) {
      showToast(err.response?.data?.message || "Đặt sân không thành công. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  // Smooth scroll with fixed header offset
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const headerHeight = 24; // h-24 = 96px
    const top = el.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top, behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <div className="home-page-wrapper nike-grid-bg">
      {/* KINETIC HEADER / NAVBAR */}
      <header
        className={`fixed top-0 left-0 right-0 h-24 z-50 transition-all duration-300 ${scrolled ? "h-20 bg-slate-950/90 backdrop-blur-2xl border-b border-white/10 shadow-2xl" : ""}`}
      >
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3 group"
            onClick={(e) => {
              if (window.location.pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-110 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-emerald-400"
                  viewBox="0 0 100 100"
                  fill="none"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <path d="M50 18 L68 45 L50 38 L32 45 Z" fill="#CCFF00" />
                  <path
                    d="M50 38 L50 82"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <div className="font-kinetic font-black text-2xl tracking-tighter text-white uppercase">
              BADMINTON <span className="text-gradient-nike">DIGITAL</span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-8 font-kinetic font-bold text-xs uppercase tracking-widest text-slate-300">
            <button
              type="button"
              onClick={() => scrollToSection("courts")}
              className="hover:text-emerald-400 transition-colors bg-transparent border-0 cursor-pointer"
            >
              Courts
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("availability")}
              className="hover:text-emerald-400 transition-colors bg-transparent border-0 cursor-pointer"
            >
              Schedule
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("facilities")}
              className="hover:text-emerald-400 transition-colors bg-transparent border-0 cursor-pointer"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("pricing")}
              className="hover:text-emerald-400 transition-colors bg-transparent border-0 cursor-pointer"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("services")}
              className="hover:text-emerald-400 transition-colors bg-transparent border-0 cursor-pointer"
            >
              Gear
            </button>
          </nav>

          <button
            type="button"
            className="lg:hidden text-white border border-white/20 rounded-lg px-3 py-2"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            aria-label="Toggle navigation menu"
          >
            Menu
          </button>

          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="hidden sm:inline-block font-kinetic font-extrabold text-xs uppercase tracking-wider text-slate-300 hover:text-white px-4 py-2 transition-colors"
            >
              Staff Sign In
            </Link>
            <button
              type="button"
              onClick={() => scrollToSection("booking-widget")}
              className="btn-nike-bolt text-xs py-3.5 px-7 border-0 cursor-pointer"
            >
              Instant Book ⚡
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <nav
            id="mobile-navigation"
            className="lg:hidden bg-slate-950/95 border-t border-white/10 px-6 py-4 grid grid-cols-2 gap-3 font-kinetic font-bold text-xs uppercase tracking-widest text-slate-300"
            aria-label="Mobile navigation"
          >
            <button
              type="button"
              onClick={() => scrollToSection("courts")}
              className="text-left bg-transparent border-0 cursor-pointer hover:text-emerald-400 transition-colors"
            >
              Courts
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("availability")}
              className="text-left bg-transparent border-0 cursor-pointer hover:text-emerald-400 transition-colors"
            >
              Schedule
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("facilities")}
              className="text-left bg-transparent border-0 cursor-pointer hover:text-emerald-400 transition-colors"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("pricing")}
              className="text-left bg-transparent border-0 cursor-pointer hover:text-emerald-400 transition-colors"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("services")}
              className="text-left bg-transparent border-0 cursor-pointer hover:text-emerald-400 transition-colors"
            >
              Gear
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("faq")}
              className="text-left bg-transparent border-0 cursor-pointer hover:text-emerald-400 transition-colors"
            >
              FAQ
            </button>
          </nav>
        )}
      </header>

      {/* HERO SECTION (~100vh) */}
      <section className="relative min-h-screen pt-36 pb-24 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-40">
          <img
            src="/assets/images/hero_bg.jpg"
            alt="Stadium BG"
            className="w-full h-full object-cover scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#030508]/40 via-[#030508]/80 to-[#030508]"></div>
        </div>

        {/* 3D Visual Graphic */}
        <img
          src="/assets/images/shuttlecock_3d.jpg"
          alt="3D Shuttlecock Visual"
          className="absolute right-6 top-1/4 w-80 h-80 object-contain pointer-events-none z-10 hidden lg:block floating-hero-visual filter drop-shadow-[0_25px_60px_rgba(0,255,102,0.4)]"
        />

        <div className="max-w-7xl mx-auto px-6 relative z-20 w-full">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7">
              <div className="live-ticker mb-6">
                <span className="live-ticker-dot"></span>
                LIVE STADIUM SYNC: 8 COURTS OPEN RIGHT NOW
              </div>

              <h1 className="font-kinetic text-6xl sm:text-8xl font-black text-white leading-none mb-6 uppercase tracking-tighter">
                PLAY AT THE <br />
                <span className="text-gradient-nike">SPEED OF LIGHT</span>
              </h1>

              <p className="text-xl text-slate-300 mb-10 max-w-2xl font-medium leading-relaxed">
                Reserve BWF-certified synthetic courts with sub-second instant
                booking. Engineered with shock-absorbing subflooring and
                glare-free vertical LED lighting arrays.
              </p>

              <div className="flex flex-wrap items-center gap-5 mb-14">
                <button
                  type="button"
                  onClick={() => scrollToSection("booking-widget")}
                  className="btn-nike-bolt border-0 cursor-pointer"
                >
                  RESERVE COURT NOW
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                  >
                    <path d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("courts")}
                  className="btn-nike-dark border-0 cursor-pointer"
                >
                  EXPLORE ARENAS
                </button>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 nike-card border-white/10">
                <div>
                  <div className="font-kinetic text-4xl font-black text-emerald-400">
                    4.9 ★
                  </div>
                  <div className="font-kinetic text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
                    PRO RATING
                  </div>
                </div>
                <div>
                  <div className="font-kinetic text-4xl font-black text-emerald-400">
                    12,000+
                  </div>
                  <div className="font-kinetic text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
                    MATCHES
                  </div>
                </div>
                <div>
                  <div className="font-kinetic text-4xl font-black text-emerald-400">
                    8
                  </div>
                  <div className="font-kinetic text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
                    BWF COURTS
                  </div>
                </div>
                <div>
                  <div className="font-kinetic text-4xl font-black text-emerald-400">
                    6AM–11PM
                  </div>
                  <div className="font-kinetic text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
                    OPEN DAILY
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Booking Glass Widget */}
            <div className="lg:col-span-5" id="booking-widget">
              <div className="nike-card p-8 border-emerald-500/40">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-kinetic text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm">
                      ⚡
                    </span>
                    FAST BOOKING
                  </h3>
                  <span className="font-kinetic text-[10px] font-black text-slate-950 bg-emerald-400 px-3 py-1 rounded-full uppercase tracking-widest">
                    LIVE INSTANT
                  </span>
                </div>

                <form className="space-y-4" onSubmit={handleQuickBooking}>
                  <div>
                    <label className="block font-kinetic text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      DATE
                    </label>
                    <input
                      id="booking-date"
                      type="date"
                      name="date"
                      min={new Date().toLocaleDateString("en-CA")}
                      value={booking.date}
                      onChange={handleBookingChange}
                      className="booking-input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-kinetic text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        TIME SLOT
                      </label>
                      <select
                        id="booking-time"
                        name="time"
                        value={booking.time}
                        onChange={handleBookingChange}
                        className="booking-input"
                      >
                        {["06:00", "08:00", "10:00", "14:00", "16:00", "17:00", "19:00", "21:00"].map((t) => {
                          const hour = Number(t.split(":")[0]);
                          const peak = hour >= peakHours.peakStartHour && hour < peakHours.peakEndHour;
                          return (
                            <option key={t} value={t}>
                              {t}{peak ? " (CAO ĐIỂM)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block font-kinetic text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        DURATION
                      </label>
                      <select
                        id="booking-duration"
                        name="duration"
                        value={booking.duration}
                        onChange={handleBookingChange}
                        className="booking-input"
                      >
                        <option value="1">1 GIỜ</option>
                        <option value="2">2 GIỜ</option>
                        <option value="3">3 GIỜ</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-kinetic text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      COURT ARENA
                    </label>
                    <select
                      id="booking-court"
                      name="court"
                      value={booking.court}
                      onChange={handleBookingChange}
                      className="booking-input"
                      disabled={courts.length === 0}
                    >
                      {courts.length === 0 && <option value="">Đang tải danh sách sân...</option>}
                      {courts.map((court) => (
                        <option key={court.id} value={court.id} disabled={!court.bookable}>
                          {court.name} — {formatVnd(court.offpeakPricePerHour)}
                          {court.peakPricePerHour !== court.offpeakPricePerHour
                            ? ` / ${formatVnd(court.peakPricePerHour)} cao điểm`
                            : ""}
                          {court.bookable ? "" : " (đang bảo trì)"}
                        </option>
                      ))}
                    </select>
                    {catalogError && (
                      <p className="mt-2 text-xs font-bold text-rose-400">{catalogError}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={checking || courts.length === 0}
                    className="w-full btn-nike-bolt justify-center py-4 text-sm mt-4 disabled:opacity-60"
                  >
                    {checking ? "ĐANG KIỂM TRA..." : "TÌM KHUNG GIỜ TRỐNG ⚡"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED COURTS SECTION */}
      <section className="py-32 relative z-10" id="courts">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <div className="live-ticker mb-4">ENGINEERED FOR PEAK SPEED</div>
            <h2 className="font-kinetic text-5xl sm:text-6xl font-black text-white uppercase tracking-tighter">
              WORLD-CLASS{" "}
              <span className="text-gradient-nike">ARENA COURTS</span>
            </h2>
            <p className="text-slate-400 text-lg mt-4 font-medium">
              Multi-layered rubber cushion base paired with high-contrast BWF
              synthetic floor mats and 1200 Lux glare-free vertical arrays.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Court 1 */}
            <div className="nike-card group">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/assets/images/court_1.jpg"
                  alt="BWF Court"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <span className="absolute top-4 left-4 bg-emerald-400 text-slate-950 font-kinetic font-black text-[10px] px-3.5 py-1.5 rounded-full uppercase tracking-widest">
                  LIVE OPEN
                </span>
                <span className="absolute top-4 right-4 bg-slate-950/80 text-white font-kinetic font-black text-sm px-4 py-1.5 rounded-full border border-white/10">
                  {courts[0] ? `${formatVnd(courts[0].offpeakPricePerHour)} / giờ` : "—"}
                </span>
              </div>
              <div className="p-8">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                    {courts[0]?.name || "Đang tải..."}
                  </h3>
                  <span className="text-amber-400 font-black text-sm">
                    ★ 4.9
                  </span>
                </div>
                <p className="text-slate-400 text-sm mb-6 font-medium">
                  Official tournament court with broadcast LED lights and
                  spectator gallery.
                </p>
                <div className="flex flex-wrap gap-2 mb-8">
                  <span className="bg-slate-950/80 text-slate-300 font-kinetic text-xs px-3 py-1.5 rounded-lg border border-white/10">
                    BWF 5.0mm Mat
                  </span>
                  <span className="bg-slate-950/80 text-slate-300 font-kinetic text-xs px-3 py-1.5 rounded-lg border border-white/10">
                    1200 LUX LED
                  </span>
                </div>
                <button
                  onClick={() =>
                    startBookingFromCard(0, "17:00", 2)
                  }
                  className="w-full btn-nike-dark justify-center text-xs py-4"
                >
                  BOOK COURT 01
                </button>
              </div>
            </div>

            {/* Court 2 (VIP) */}
            <div className="nike-card group border-amber-400/40">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/assets/images/court_2.jpg"
                  alt="VIP Suite"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <span className="absolute top-4 left-4 bg-amber-400 text-slate-950 font-kinetic font-black text-[10px] px-3.5 py-1.5 rounded-full uppercase tracking-widest">
                  VIP SUITE
                </span>
                <span className="absolute top-4 right-4 bg-slate-950/80 text-white font-kinetic font-black text-sm px-4 py-1.5 rounded-full border border-white/10">
                  {courts[1] ? `${formatVnd(courts[1].offpeakPricePerHour)} / giờ` : "—"}
                </span>
              </div>
              <div className="p-8">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                    {courts[1]?.name || "Đang tải..."}
                  </h3>
                  <span className="text-amber-400 font-black text-sm">
                    ★ 5.0
                  </span>
                </div>
                <p className="text-slate-400 text-sm mb-6 font-medium">
                  Enclosed private suite with leather lounge, mini bar &
                  surround sound.
                </p>
                <div className="flex flex-wrap gap-2 mb-8">
                  <span className="bg-slate-950/80 text-slate-300 font-kinetic text-xs px-3 py-1.5 rounded-lg border border-white/10">
                    Private Suite
                  </span>
                  <span className="bg-slate-950/80 text-slate-300 font-kinetic text-xs px-3 py-1.5 rounded-lg border border-white/10">
                    Maple Subfloor
                  </span>
                </div>
                <button
                  onClick={() =>
                    startBookingFromCard(1, "17:00", 2)
                  }
                  className="w-full btn-nike-bolt justify-center text-xs py-4"
                >
                  RESERVE VIP SUITE
                </button>
              </div>
            </div>

            {/* Court 3 */}
            <div className="nike-card group">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/assets/images/court_1.jpg"
                  alt="Pro Studio"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <span className="absolute top-4 left-4 bg-emerald-400 text-slate-950 font-kinetic font-black text-[10px] px-3.5 py-1.5 rounded-full uppercase tracking-widest">
                  LIVE OPEN
                </span>
                <span className="absolute top-4 right-4 bg-slate-950/80 text-white font-kinetic font-black text-sm px-4 py-1.5 rounded-full border border-white/10">
                  {courts[2] ? `${formatVnd(courts[2].offpeakPricePerHour)} / giờ` : "—"}
                </span>
              </div>
              <div className="p-8">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                    {courts[2]?.name || "Đang tải..."}
                  </h3>
                  <span className="text-amber-400 font-black text-sm">
                    ★ 4.8
                  </span>
                </div>
                <p className="text-slate-400 text-sm mb-6 font-medium">
                  High-speed camera tracking studio for smash velocity and
                  footwork analysis.
                </p>
                <div className="flex flex-wrap gap-2 mb-8">
                  <span className="bg-slate-950/80 text-slate-300 font-kinetic text-xs px-3 py-1.5 rounded-lg border border-white/10">
                    Smash Analytics
                  </span>
                  <span className="bg-slate-950/80 text-slate-300 font-kinetic text-xs px-3 py-1.5 rounded-lg border border-white/10">
                    Cushioned Base
                  </span>
                </div>
                <button
                  onClick={() =>
                    startBookingFromCard(2, "17:00", 2)
                  }
                  className="w-full btn-nike-dark justify-center text-xs py-4"
                >
                  BOOK COURT 03
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SCHEDULE TIMELINE GRID */}
      <section
        className="py-32 bg-slate-950/80 relative z-10"
        id="availability"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="live-ticker mb-4">KHUNG GIỜ THAM KHẢO</div>
            <h2 className="font-kinetic text-5xl sm:text-6xl font-black text-white uppercase tracking-tighter">
              COURT{" "}
              <span className="text-gradient-nike">AVAILABILITY GRID</span>
            </h2>
            <p className="text-slate-400 text-lg mt-4 font-medium">
              Bấm vào khung giờ để điền sẵn form đặt sân — hệ thống sẽ kiểm tra chỗ trống thực tế khi bạn bấm tìm.
            </p>
          </div>

          <div className="nike-card p-8 overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className="border-b border-white/10 font-kinetic text-xs font-black text-slate-400 uppercase tracking-widest">
                  <th className="text-left py-4 px-4 text-white text-base">
                    VENUE COURT
                  </th>
                  <th className="py-4 px-3">08:00 AM</th>
                  <th className="py-4 px-3">10:00 AM</th>
                  <th className="py-4 px-3">12:00 PM</th>
                  <th className="py-4 px-3">02:00 PM</th>
                  <th className="py-4 px-3">04:00 PM</th>
                  <th className="py-4 px-3">06:00 PM</th>
                  <th className="py-4 px-3">08:00 PM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-5 px-4 font-kinetic font-black text-white">
                    Court 01 (BWF)
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        startBookingFromCard(0, "08:00", 1)
                      }
                    >
                      {courts[0] ? formatVnd(estimatePrice(courts[0], "08:00", 1)) : "—"}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        startBookingFromCard(0, "12:00", 1)
                      }
                    >
                      {courts[0] ? formatVnd(estimatePrice(courts[0], "12:00", 1)) : "—"}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        startBookingFromCard(0, "16:00", 1)
                      }
                    >
                      {courts[0] ? formatVnd(estimatePrice(courts[0], "16:00", 1)) : "—"}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        startBookingFromCard(0, "20:00", 1)
                      }
                    >
                      {courts[0] ? formatVnd(estimatePrice(courts[0], "20:00", 1)) : "—"}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="py-5 px-4 font-kinetic font-black text-white">
                    Court 02 (VIP)
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">MAINT.</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        startBookingFromCard(1, "17:00", 2)
                      }
                    >
                      {courts[1] ? formatVnd(estimatePrice(courts[1], "10:00", 1)) : "—"}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        startBookingFromCard(1, "17:00", 2)
                      }
                    >
                      {courts[1] ? formatVnd(estimatePrice(courts[1], "14:00", 1)) : "—"}
                    </div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        startBookingFromCard(1, "17:00", 2)
                      }
                    >
                      {courts[1] ? formatVnd(estimatePrice(courts[1], "16:00", 1)) : "—"}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        startBookingFromCard(1, "17:00", 2)
                      }
                    >
                      {courts[1] ? formatVnd(estimatePrice(courts[1], "20:00", 1)) : "—"}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-32 relative z-10" id="facilities">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="live-ticker mb-4">PREMIUM AMENITIES</div>
            <h2 className="font-kinetic text-5xl font-black text-white uppercase">
              EVERYTHING FOR{" "}
              <span className="text-gradient-nike">BETTER PLAY</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              "BWF shock-absorbing mats",
              "Anti-glare LED lighting",
              "Changing rooms & lockers",
              "Convenient parking",
            ].map((item) => (
              <div key={item} className="nike-card p-6">
                <h3 className="font-kinetic text-xl font-black text-white uppercase">
                  {item}
                </h3>
                <p className="text-slate-400 text-sm mt-3">
                  A clean, comfortable environment designed for every training
                  session.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 bg-slate-950/80 relative z-10" id="pricing">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="live-ticker mb-4">CLEAR PRICING</div>
            <h2 className="font-kinetic text-5xl font-black text-white uppercase">
              CHOOSE YOUR <span className="text-gradient-nike">COURT TIME</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {/* Bảng giá phải là giá đang áp dụng thật. Đây là chỗ khách nhìn để
                quyết định, treo nhầm một con số là mất lòng tin ngay ở bước đầu. */}
            {(() => {
              const standard = courts.find((c) => !/vip/i.test(c.name)) || courts[0];
              const vip = courts.find((c) => /vip/i.test(c.name));
              const pad = (h) => `${String(h).padStart(2, "0")}:00`;
              return [
                [
                  "Giờ thường",
                  standard ? formatVnd(standard.offpeakPricePerHour) : "—",
                  `Ngoài khung ${pad(peakHours.peakStartHour)}–${pad(peakHours.peakEndHour)}`,
                ],
                [
                  "Giờ cao điểm",
                  standard ? formatVnd(standard.peakPricePerHour) : "—",
                  `${pad(peakHours.peakStartHour)}–${pad(peakHours.peakEndHour)} hằng ngày`,
                ],
                [
                  vip ? vip.name : "Sân VIP",
                  vip ? formatVnd(vip.peakPricePerHour) : "—",
                  "Mặt thảm cao cấp, giá giờ cao điểm",
                ],
              ];
            })().map(([title, price, detail]) => (
              <div key={title} className="nike-card p-8 text-center">
                <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                  {title}
                </h3>
                <p className="font-kinetic text-4xl font-black text-emerald-400 my-5">
                  {price}
                  <span className="text-sm text-slate-400">/giờ</span>
                </p>
                <p className="text-slate-400">{detail}</p>
                <button
                  type="button"
                  onClick={() => scrollToSection("booking-widget")}
                  className="btn-nike-dark justify-center text-xs py-3 mt-7 border-0 cursor-pointer w-full"
                >
                  BOOK NOW
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 relative z-10" id="services">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="live-ticker mb-4">ON-COURT SUPPORT</div>
            <h2 className="font-kinetic text-5xl font-black text-white uppercase">
              GEAR & <span className="text-gradient-nike">COACHING</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              ["Racket rental", "Quality rackets ready at the counter."],
              ["Feather shuttles", "Add a tube of match-ready shuttles."],
              ["Personal coaching", "Book a focused session with a coach."],
            ].map(([title, description]) => (
              <div key={title} className="nike-card p-7">
                <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                  {title}
                </h3>
                <p className="text-slate-400 mt-3">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 bg-slate-950/80 relative z-10" id="faq">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="live-ticker mb-4">HELP CENTER</div>
            <h2 className="font-kinetic text-5xl font-black text-white uppercase">
              FREQUENTLY ASKED{" "}
              <span className="text-gradient-nike">QUESTIONS</span>
            </h2>
          </div>
          {[
            [
              "Can I cancel a booking?",
              "Manage or cancel your booking from your signed-in account, subject to the venue policy.",
            ],
            [
              "Why do I need to sign in?",
              "Signing in confirms your booking details and protects your payment.",
            ],
            [
              "Can I rent equipment?",
              "Yes. Rackets, shuttles and coaching are available at checkout.",
            ],
          ].map(([question, answer]) => (
            <details key={question} className="nike-card p-6 mb-4">
              <summary className="font-kinetic font-black text-white cursor-pointer">
                {question}
              </summary>
              <p className="text-slate-400 mt-4">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-slate-950 py-16 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-4 font-kinetic font-black text-2xl text-white uppercase">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
              ⚡
            </div>
            <span>
              BADMINTON <span className="text-gradient-nike">DIGITAL</span>
            </span>
          </div>

          <div className="font-kinetic text-xs font-bold text-slate-500 uppercase tracking-widest">
            © 2026 BADMINTON DIGITAL // NIKE KINETIC EDITION
          </div>
        </div>
      </footer>

      {/* CHECKOUT MODAL DRAWER */}
      {isModalOpen && selectedCourt && (
        <div
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-50 flex items-center justify-center p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBookingModal();
          }}
        >
          <div
            className="nike-card max-w-lg w-full p-8 border-emerald-500/50 relative"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-dialog-title"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeBookingModal}
              className="absolute top-6 right-6 text-slate-400 hover:text-white text-2xl font-bold"
              aria-label="Close booking dialog"
            >
              &times;
            </button>

            <h3
              id="booking-dialog-title"
              className="font-kinetic text-3xl font-black text-white uppercase tracking-tight mb-6"
            >
              XÁC NHẬN ĐẶT SÂN
            </h3>

            <div className="bg-slate-950/90 p-5 rounded-2xl mb-6 space-y-3 border border-white/10 font-kinetic text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">SÂN:</span>
                <strong className="text-white font-black">
                  {selectedCourt.name}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">NGÀY:</span>
                <strong className="text-white font-black">
                  {selectedCourt.bookingDate.split("-").reverse().join("/")}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">GIỜ:</span>
                <strong className="text-white font-black">
                  {selectedCourt.startTime}–{selectedCourt.endTime} ({selectedCourt.duration} giờ)
                </strong>
              </div>
              <div className="flex justify-between pt-3 border-t border-white/10 text-xl font-black">
                <span className="text-white">TẠM TÍNH:</span>
                <span className="text-emerald-400">{formatVnd(selectedCourt.price)}</span>
              </div>
            </div>

            {/* Cầu, vợt, nước gọi tại quầy lúc vào chơi và tính vào hoá đơn cuối
                buổi — không đặt trước ở đây, nên không bày ra để hứa hão. */}
            <p className="mb-6 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-400">
              Tiền sân tính theo giờ chơi thực tế khi kết thúc. Cầu, vợt và nước gọi thêm
              tại quầy sẽ được cộng vào hoá đơn cuối buổi.
            </p>

            <form onSubmit={handleBookingSubmit} className="space-y-4">
              {user ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 font-kinetic text-sm">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    ĐẶT DƯỚI TÊN
                  </div>
                  <strong className="text-white font-black">{user.fullName}</strong>
                  {user.phone && <span className="ml-2 text-slate-400">• {user.phone}</span>}
                </div>
              ) : (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-300">
                  Bạn cần đăng nhập để hoàn tất. Lựa chọn hiện tại sẽ được giữ lại,
                  đăng nhập xong quay về là đặt tiếp.
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-nike-bolt justify-center py-4 text-sm mt-2 disabled:opacity-60"
              >
                {submitting
                  ? "ĐANG GỬI..."
                  : user
                    ? "XÁC NHẬN ĐẶT SÂN ⚡"
                    : "ĐĂNG NHẬP ĐỂ ĐẶT SÂN ⚡"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toastMessage && (
        <div className="fixed bottom-24 right-8 bg-emerald-400 text-slate-950 font-kinetic font-black text-sm px-8 py-4 rounded-full shadow-2xl z-50 animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* SCROLL TO TOP */}
      {scrolled && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-8 right-8 z-40 group border-0 bg-transparent cursor-pointer"
          aria-label="Scroll to top"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-110 transition-transform shadow-2xl shadow-emerald-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <svg
                className="w-6 h-6 text-emerald-400"
                viewBox="0 0 100 100"
                fill="none"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                />
                <path d="M50 18 L68 45 L50 38 L32 45 Z" fill="#CCFF00" />
                <path
                  d="M50 38 L50 82"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
