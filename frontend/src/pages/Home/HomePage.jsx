import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./HomePage.css";
import { publicService } from "../../services/apiServices";
import CourtFloorPlan from "../../components/CourtFloorPlan";
import SiteHeader from '../../components/site/SiteHeader';
import SiteFooter from '../../components/site/SiteFooter';
import BookingCta, { lowestOffpeakPrice } from "./BookingCta";

// Chi nhánh khách đã chọn ở trang chủ — riêng biệt với "admin_selected_branch_id"
// (BranchContext.jsx) vì đó là bộ chuyển chi nhánh của nhân viên, khác đối tượng.
// Trang Đặt sân (/dat-san) dùng cùng khoá này: chọn chi nhánh ở đây rồi bấm Đặt sân là sang đúng chi nhánh đó.
const CUSTOMER_BRANCH_KEY = "customer_selected_branch_id";

// Dùng khi chưa tải xong `/public/courts`. Trùng mặc định của backend (operating_hours).
const FALLBACK_HOURS = { open: "05:00", close: "23:00" };

const formatVnd = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;

// "05:00" → "5AM", "23:00" → "11PM". Chỉ dùng cho khối số liệu tiếng Anh ở hero.
const to12h = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "PM" : "AM"}`;
};

/**
 * Trang chủ chỉ GIỚI THIỆU: mọi nút "đặt sân" đều dẫn tới /dat-san (kế hoạch 30).
 * Việc chọn ngày/giờ/sân, hỏi chỗ trống và tạo booking nằm ở một nơi duy nhất là
 * trang Đặt sân, nên ở đây không còn form, hộp xác nhận hay lưới giờ riêng.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [courts, setCourts] = useState([]);
  const [layout, setLayout] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(
    () => localStorage.getItem(CUSTOMER_BRANCH_KEY) || "",
  );
  const [peakHours, setPeakHours] = useState({ peakStartHour: 17, peakEndHour: 22 });
  const [operatingHours, setOperatingHours] = useState(FALLBACK_HOURS);
  const [catalogError, setCatalogError] = useState(null);
  const currentBranch = branches.find((b) => String(b.id) === String(selectedBranchId));

  // Danh sách chi nhánh cho bộ chọn — chỉ tải 1 lần, độc lập với chi nhánh
  // đang xem.
  useEffect(() => {
    publicService
      .getBranches()
      .then((res) => setBranches(res.data?.data || []))
      .catch(() => {});
  }, []);

  // Danh mục sân, bảng giá và sơ đồ mặt bằng — tải lại mỗi khi khách đổi chi
  // nhánh. Không cứng branchId trong code: đổi giá/sân ở màn Cài đặt hay đổi
  // chi nhánh ở đây đều phải phản ánh đúng ngay, tránh khách xem nhầm sân của
  // chi nhánh khác.
  useEffect(() => {
    let cancelled = false;
    publicService
      .getCourts(selectedBranchId ? { branchId: selectedBranchId } : undefined)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setCourts(data?.courts || []);
        setLayout(null);
        setCatalogError(null);
        if (data?.peakHours) setPeakHours(data.peakHours);
        if (data?.operatingHours?.open && data?.operatingHours?.close) {
          setOperatingHours(data.operatingHours);
        }
        // Chưa chọn chi nhánh nào (lần đầu vào trang) thì server tự chọn hộ —
        // đồng bộ ngược lại state/localStorage để bộ chọn hiện đúng chi nhánh
        // đang xem, không để trống gây hiểu nhầm.
        const branchId = data?.branch?.id;
        if (branchId) {
          if (String(branchId) !== selectedBranchId) {
            setSelectedBranchId(String(branchId));
          }
          localStorage.setItem(CUSTOMER_BRANCH_KEY, String(branchId));
          // Sơ đồ mặt bằng là file tĩnh riêng theo chi nhánh — chưa chắc chi
          // nhánh nào cũng có, nên lỗi/404 chỉ bỏ qua (getBranchLayout tự trả
          // null), không chặn phần còn lại của trang chủ.
          publicService
            .getBranchLayout(branchId)
            .then((l) => {
              if (!cancelled) setLayout(l);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogError("Chưa tải được danh sách sân. Vui lòng thử lại sau.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBranchId]);

  // Cuộn mượt tới một mốc, chừa đúng chiều cao header đang cố định (đo thật, trước đây gõ cứng 24 px).
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector("[data-site-header]");
    const offset = (header ? header.getBoundingClientRect().height : 0) + 8;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  // Đi từ trang khác tới /#mốc (menu của header chung): cuộn tới mốc sau khi trang đã dựng; bấm lại cùng mốc cũng cuộn lại.
  // Các khối phía trên mốc còn tải dữ liệu (sân, sơ đồ) nên chiều cao đổi sau đó: cuộn lại khi dữ liệu về, cho tới khi người
  // dùng tự cuộn (bánh xe, chạm, phím) hoặc quá 4 giây.
  const pendingAnchor = useRef(null);
  useEffect(() => {
    if (!location.hash) { pendingAnchor.current = null; return undefined; }
    const id = decodeURIComponent(location.hash.slice(1));
    pendingAnchor.current = id;
    const timer = setTimeout(() => scrollToSection(id), 80);
    const stop = () => { pendingAnchor.current = null; };
    const expire = setTimeout(stop, 4000);
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });
    return () => {
      clearTimeout(timer);
      clearTimeout(expire);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.hash]);
  useEffect(() => {
    if (pendingAnchor.current) scrollToSection(pendingAnchor.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courts, layout, branches, peakHours]);

  return (
    <div className="kinetic-surface nike-grid-bg">
      {/* Header chung (kế hoạch 28): trong suốt đè lên ảnh, thành kính mờ khi cuộn; Trang chủ luôn tối nên tone="dark". */}
      <SiteHeader tone="dark" overlay />

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
                <Link to="/dat-san" className="btn-nike-bolt border-0 cursor-pointer">
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
                </Link>
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
                    {to12h(operatingHours.open)}–{to12h(operatingHours.close)}
                  </div>
                  <div className="font-kinetic text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
                    OPEN DAILY
                  </div>
                </div>
              </div>
            </div>

            {/* Bên phải: thẻ dẫn sang trang Đặt sân (thay cho form đặt nhanh cũ) */}
            <div className="lg:col-span-5" id="booking-cta">
              <BookingCta
                operatingHours={operatingHours}
                fromPrice={lowestOffpeakPrice(courts)}
                error={catalogError}
              />
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

          {branches.length > 0 && (
            <div className="nike-card-static flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 mb-8 border-emerald-500/20">
              <div className="flex items-center gap-2 font-kinetic text-sm font-bold text-white">
                <span aria-hidden="true">📍</span>
                <span>
                  Đang xem: <span className="text-emerald-400">{currentBranch?.name || "…"}</span>
                  {currentBranch?.address && (
                    <span className="text-slate-400 font-medium"> — {currentBranch.address}</span>
                  )}
                </span>
              </div>
              {branches.length > 1 && (
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="branch-select"
                    className="font-kinetic text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap"
                  >
                    Đổi chi nhánh
                  </label>
                  <select
                    id="branch-select"
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="booking-input"
                    style={{ width: "auto" }}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {layout ? (
            <CourtFloorPlan layout={layout} courts={courts} onSelectCourt={() => navigate("/dat-san")} />
          ) : (
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
                <Link to="/dat-san" className="w-full btn-nike-dark justify-center text-xs py-4">
                  BOOK COURT 01
                </Link>
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
                <Link to="/dat-san" className="w-full btn-nike-bolt justify-center text-xs py-4">
                  RESERVE VIP SUITE
                </Link>
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
                <Link to="/dat-san" className="w-full btn-nike-dark justify-center text-xs py-4">
                  BOOK COURT 03
                </Link>
              </div>
            </div>
          </div>
          )}
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
                <Link to="/dat-san" className="btn-nike-dark justify-center text-xs py-3 mt-7 border-0 cursor-pointer w-full">
                  BOOK NOW
                </Link>
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

          <div className="nike-card mt-6 flex flex-col items-center justify-between gap-5 p-8 md:flex-row md:text-left text-center">
            <div>
              <h3 className="font-kinetic text-2xl font-black text-white uppercase">
                Cửa hàng phụ kiện & trang phục
              </h3>
              <p className="text-slate-400 mt-2">
                Vợt, áo, quần, túi và phụ kiện chính hãng bán tại quầy — xem giá và size màu còn hàng trước khi tới.
              </p>
            </div>
            <Link to="/shop" className="btn-nike-bolt text-xs shrink-0">
              Xem cửa hàng 🛍️
            </Link>
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

      {/* Chân trang chung (kế hoạch 31); Trang chủ luôn tối nên tone="dark". */}
      <SiteFooter tone="dark" />
    </div>
  );
}
