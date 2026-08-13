import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "./HomePage.css";

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState({
    name: "Court 01 - BWF Tournament Arena",
    time: "05:00 PM",
    duration: 2,
    price: 30,
  });
  const [addons, setAddons] = useState({
    shuttles: false,
    racket: false,
    coaching: false,
  });
  const [toastMessage, setToastMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [booking, setBooking] = useState({
    date: new Date().toLocaleDateString("en-CA"),
    time: "17:00",
    duration: "2",
    court: "bwf",
  });
  const closeButtonRef = useRef(null);
  const lastFocusedElementRef = useRef(null);

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

  const openBookingModal = (name, time, duration, price) => {
    lastFocusedElementRef.current = document.activeElement;
    setSelectedCourt({ name, time, duration, price });
    setIsModalOpen(true);
  };

  const closeBookingModal = () => {
    setIsModalOpen(false);
    lastFocusedElementRef.current?.focus();
  };

  const handleBookingChange = (event) => {
    setBooking((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleQuickBooking = (event) => {
    event.preventDefault();
    const courtDetails = {
      bwf: ["Court 01 - BWF Tournament Arena", 30],
      vip: ["Court 02 - VIP Executive Suite", 45],
      pro: ["Court 03 - Pro Performance Studio", 28],
    }[booking.court];
    openBookingModal(
      courtDetails[0],
      booking.time,
      Number(booking.duration),
      courtDetails[1],
    );
  };

  const toggleAddon = (key) => {
    setAddons((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const calculateTotal = () => {
    let total = selectedCourt.duration * selectedCourt.price;
    if (addons.shuttles) total += 28;
    if (addons.racket) total += 10;
    if (addons.coaching) total += 65;
    return total;
  };

  const handleBookingSubmit = (e) => {
    e.preventDefault();
    closeBookingModal();
    showToast("Please sign in to confirm your booking and payment.");
    return;
    setIsModalOpen(false);
    showToast(
      `⚡ RESERVATION CONFIRMED! CHECK-IN PASS #BD-${Math.floor(1000 + Math.random() * 9000)}`,
    );
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
                        <option value="08:00">08:00 AM</option>
                        <option value="10:00">10:00 AM</option>
                        <option value="14:00">02:00 PM</option>
                        <option value="17:00">05:00 PM (PEAK)</option>
                        <option value="19:00">07:00 PM (PEAK)</option>
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
                        <option value="1">1 HOUR</option>
                        <option value="2">2 HOURS</option>
                        <option value="3">3 HOURS</option>
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
                    >
                      <option value="bwf">
                        Court 01 - BWF Tournament Arena ($30/h)
                      </option>
                      <option value="vip">
                        Court 02 - VIP Executive Suite ($45/h)
                      </option>
                      <option value="pro">
                        Court 03 - Pro Performance Studio ($28/h)
                      </option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full btn-nike-bolt justify-center py-4 text-sm mt-4"
                  >
                    FIND AVAILABLE SLOTS ⚡
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
                  $30 / HR
                </span>
              </div>
              <div className="p-8">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                    Court 01 - BWF Arena
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
                    openBookingModal(
                      "Court 01 - BWF Tournament Arena",
                      "05:00 PM",
                      2,
                      30,
                    )
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
                  $45 / HR
                </span>
              </div>
              <div className="p-8">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                    Court 02 - VIP Lounge
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
                    openBookingModal(
                      "Court 02 - VIP Executive Suite",
                      "05:00 PM",
                      2,
                      45,
                    )
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
                  $28 / HR
                </span>
              </div>
              <div className="p-8">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                    Court 03 - Pro Studio
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
                    openBookingModal("Court 03 - Pro Studio", "05:00 PM", 2, 28)
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
            <div className="live-ticker mb-4">REAL-TIME SCHEDULE GRID</div>
            <h2 className="font-kinetic text-5xl sm:text-6xl font-black text-white uppercase tracking-tighter">
              COURT{" "}
              <span className="text-gradient-nike">AVAILABILITY GRID</span>
            </h2>
            <p className="text-slate-400 text-lg mt-4 font-medium">
              Click any green time slot to open instant checkout drawer.
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
                        openBookingModal("Court 01", "08:00 AM", 1, 25)
                      }
                    >
                      $25
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        openBookingModal("Court 01", "12:00 PM", 1, 25)
                      }
                    >
                      $25
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        openBookingModal("Court 01", "04:00 PM", 1, 30)
                      }
                    >
                      $30
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        openBookingModal("Court 01", "08:00 PM", 1, 30)
                      }
                    >
                      $30
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
                        openBookingModal("Court 02", "10:00 AM", 1, 40)
                      }
                    >
                      $40
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        openBookingModal("Court 02", "02:00 PM", 1, 40)
                      }
                    >
                      $40
                    </div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        openBookingModal("Court 02", "04:00 PM", 1, 45)
                      }
                    >
                      $45
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="cyber-slot booked">BOOKED</div>
                  </td>
                  <td className="p-2">
                    <div
                      className="cyber-slot available"
                      onClick={() =>
                        openBookingModal("Court 02", "08:00 PM", 1, 45)
                      }
                    >
                      $45
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
            {[
              ["Off-peak", "$25", "06:00–16:00"],
              ["Peak time", "$30", "16:00–23:00"],
              ["VIP Lounge", "$45", "Private court experience"],
            ].map(([title, price, detail]) => (
              <div key={title} className="nike-card p-8 text-center">
                <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                  {title}
                </h3>
                <p className="font-kinetic text-5xl font-black text-emerald-400 my-5">
                  {price}
                  <span className="text-sm text-slate-400">/hr</span>
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
      {isModalOpen && (
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
              CHECKOUT RESERVATION
            </h3>

            <div className="bg-slate-950/90 p-5 rounded-2xl mb-6 space-y-3 border border-white/10 font-kinetic text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">COURT:</span>
                <strong className="text-white font-black">
                  {selectedCourt.name}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">TIME SLOT:</span>
                <strong className="text-white font-black">
                  {selectedCourt.time} ({selectedCourt.duration} HOURS)
                </strong>
              </div>
              <div className="flex justify-between pt-3 border-t border-white/10 text-xl font-black">
                <span className="text-white">TOTAL DUE:</span>
                <span className="text-emerald-400">${calculateTotal()}.00</span>
              </div>
            </div>

            {/* Gear Addons */}
            <div className="mb-6 space-y-2 font-kinetic">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                GEAR & COACHING ADD-ONS
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-white/10 cursor-pointer hover:border-emerald-400/40">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={addons.shuttles}
                    onChange={() => toggleAddon("shuttles")}
                    className="w-4 h-4 accent-emerald-400"
                  />
                  <span className="text-sm font-bold text-white">
                    Yonex AS-50 Feather Shuttles (1 Tube)
                  </span>
                </div>
                <span className="text-xs font-black text-emerald-400">
                  +$28
                </span>
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-white/10 cursor-pointer hover:border-emerald-400/40">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={addons.coaching}
                    onChange={() => toggleAddon("coaching")}
                    className="w-4 h-4 accent-emerald-400"
                  />
                  <span className="text-sm font-bold text-white">
                    One-on-one coaching session
                  </span>
                </div>
                <span className="text-xs font-black text-emerald-400">
                  +$65
                </span>
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-white/10 cursor-pointer hover:border-emerald-400/40">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={addons.racket}
                    onChange={() => toggleAddon("racket")}
                    className="w-4 h-4 accent-emerald-400"
                  />
                  <span className="text-sm font-bold text-white">
                    Pro Yonex Astrox 99 Racket Rental
                  </span>
                </div>
                <span className="text-xs font-black text-emerald-400">
                  +$10
                </span>
              </label>
            </div>

            <form onSubmit={handleBookingSubmit} className="space-y-4">
              <div>
                <label className="block font-kinetic text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  FULL NAME
                </label>
                <input
                  type="text"
                  placeholder="Alex Morgan"
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-semibold focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-kinetic text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  PHONE NUMBER
                </label>
                <input
                  type="tel"
                  placeholder="+1 (555) 019-2834"
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-semibold focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full btn-nike-bolt justify-center py-4 text-sm mt-2"
              >
                CONFIRM & PAY (${calculateTotal()}.00) ⚡
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
