/* ==========================================================================
   BADMINTONPRO — ADMIN DASHBOARD LOGIC
   Theme toggle, mock data, SVG charts (line + bar) with hover tooltips.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     0. SMALL HELPERS
     ------------------------------------------------------------------------ */
  var fmtMoney = function (n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  };
  var fmtCompact = function (n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  };
  var initials = function (name) {
    return name.split(' ').map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
  };
  var el = function (tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  var svgNS = 'http://www.w3.org/2000/svg';
  var svgEl = function (tag, attrs) {
    var e = document.createElementNS(svgNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  /* ------------------------------------------------------------------------
     1. THEME TOGGLE (persisted, no flash — inline script in <head> already
        applied the saved value before first paint)
     ------------------------------------------------------------------------ */
  var themeToggle = document.getElementById('theme-toggle');
  var themeIconSun = document.getElementById('theme-icon-sun');

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function currentIsDark() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return systemPrefersDark();
  }

  function paintThemeIcon() {
    var dark = currentIsDark();
    themeIconSun.innerHTML = dark
      ? '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
      : '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
  }

  themeToggle.addEventListener('click', function () {
    var next = currentIsDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('bp-theme', next);
    paintThemeIcon();
    renderCharts(); // chart chrome colors read CSS vars at render time
  });

  paintThemeIcon();

  /* ------------------------------------------------------------------------
     2. SIDEBAR (mobile) + LIVE CLOCK + SECTION ACTIVE-LINK ON SCROLL
     ------------------------------------------------------------------------ */
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('sidebar-scrim');
  var sidebarToggle = document.getElementById('sidebar-toggle');

  function openSidebar() { sidebar.classList.add('open'); scrim.classList.add('open'); }
  function closeSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('open'); }
  sidebarToggle.addEventListener('click', function () {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  scrim.addEventListener('click', closeSidebar);
  document.querySelectorAll('.side-link').forEach(function (l) {
    l.addEventListener('click', closeSidebar);
  });

  var clockEl = document.getElementById('live-clock');
  function tickClock() {
    var now = new Date();
    var opts = { weekday: 'long', hour: '2-digit', minute: '2-digit' };
    clockEl.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' · ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  tickClock();
  setInterval(tickClock, 30000);

  var sideLinks = document.querySelectorAll('.side-link[data-section]');
  var sections = Array.prototype.slice.call(sideLinks).map(function (l) {
    return document.getElementById(l.getAttribute('data-section'));
  }).filter(Boolean);

  window.addEventListener('scroll', function () {
    var pos = window.scrollY + 120;
    var activeIdx = 0;
    sections.forEach(function (s, i) {
      if (s.offsetTop <= pos) activeIdx = i;
    });
    sideLinks.forEach(function (l, i) { l.classList.toggle('active', i === activeIdx); });
  }, { passive: true });

  /* ------------------------------------------------------------------------
     3. MOCK DATA
     ------------------------------------------------------------------------ */
  var COURTS = [
    { name: 'Court 01', type: 'BWF Tournament Arena', status: 'occupied', util: 92, meta: 'Ends in 24 min' },
    { name: 'Court 02', type: 'VIP Executive Suite', status: 'occupied', util: 88, meta: 'Ends in 52 min' },
    { name: 'Court 03', type: 'Pro Performance Studio', status: 'available', util: 61, meta: 'Free until 6:00 PM' },
    { name: 'Court 04', type: 'Standard Court', status: 'available', util: 47, meta: 'Free until 7:30 PM' },
    { name: 'Court 05', type: 'Standard Court', status: 'reserved', util: 74, meta: 'Reserved at 5:00 PM' },
    { name: 'Court 06', type: 'Standard Court', status: 'maintenance', util: 0, meta: 'Resurfacing — back Mon' },
    { name: 'Court 07', type: 'Standard Court', status: 'occupied', util: 95, meta: 'Ends in 8 min' },
    { name: 'Court 08', type: 'Junior Training Court', status: 'available', util: 33, meta: 'Free until 8:00 PM' }
  ];

  var STATUS_META = {
    occupied: { cls: 'info', label: 'In Use' },
    available: { cls: 'good', label: 'Available' },
    reserved: { cls: 'warning', label: 'Reserved' },
    maintenance: { cls: 'muted', label: 'Maintenance' }
  };

  var SESSIONS_TODAY = [
    { name: 'Minh Duc Nguyen', court: 'Court 07', start: '4:00 PM', duration: '1h 30m', status: 'in-progress', amount: 45 },
    { name: 'Thi Lan Tran', court: 'Court 01', start: '3:30 PM', duration: '2h 00m', status: 'in-progress', amount: 60 },
    { name: 'Hoang Phuc Le', court: 'Court 02', start: '3:00 PM', duration: '1h 00m', status: 'completed', amount: 30 },
    { name: 'Bao Ngoc Vo', court: 'Court 05', start: '5:00 PM', duration: '1h 30m', status: 'upcoming', amount: 45 },
    { name: 'Gia Huy Pham', court: 'Court 04', start: '2:00 PM', duration: '2h 00m', status: 'completed', amount: 58 },
    { name: 'Khanh Linh Do', court: 'Court 03', start: '1:00 PM', duration: '1h 00m', status: 'completed', amount: 28 }
  ];

  var SESSION_STATUS_META = {
    'in-progress': { cls: 'info', label: 'In Progress' },
    completed: { cls: 'good', label: 'Completed' },
    upcoming: { cls: 'warning', label: 'Upcoming' },
    cancelled: { cls: 'critical', label: 'Cancelled' }
  };

  var TOP_CUSTOMERS = [
    { name: 'Minh Duc Nguyen', sub: '38 bookings this year', metric: '$1,140', metricSub: 'lifetime spend' },
    { name: 'Thi Lan Tran', sub: '31 bookings this year', metric: '$960', metricSub: 'lifetime spend' },
    { name: 'Gia Huy Pham', sub: '27 bookings this year', metric: '$812', metricSub: 'lifetime spend' },
    { name: 'Khanh Linh Do', sub: '24 bookings this year', metric: '$705', metricSub: 'lifetime spend' },
    { name: 'Bao Ngoc Vo', sub: '19 bookings this year', metric: '$588', metricSub: 'lifetime spend' }
  ];

  var EMPLOYEES = [
    { name: 'Anh Tuan Vu', sub: 'Branch Manager', metric: 'On Duty', metricSub: 'since 8:00 AM', status: 'good' },
    { name: 'Thu Ha Nguyen', sub: 'Front Desk', metric: 'On Duty', metricSub: 'since 12:00 PM', status: 'good' },
    { name: 'Van Long Tran', sub: 'Court Attendant', metric: 'On Break', metricSub: 'back at 5:15 PM', status: 'warning' },
    { name: 'My Duyen Le', sub: 'Front Desk', metric: 'On Duty', metricSub: 'since 2:00 PM', status: 'good' }
  ];

  var INVOICES = [
    { id: 'INV-0231', name: 'Minh Duc Nguyen', date: 'Aug 14', status: 'paid', amount: 45 },
    { id: 'INV-0230', name: 'Thi Lan Tran', date: 'Aug 14', status: 'paid', amount: 60 },
    { id: 'INV-0229', name: 'Bao Ngoc Vo', date: 'Aug 14', status: 'pending', amount: 45 },
    { id: 'INV-0228', name: 'Gia Huy Pham', date: 'Aug 13', status: 'paid', amount: 58 },
    { id: 'INV-0227', name: 'Khanh Linh Do', date: 'Aug 13', status: 'overdue', amount: 28 }
  ];

  var INVOICE_STATUS_META = {
    paid: { cls: 'good', label: 'Paid' },
    pending: { cls: 'warning', label: 'Pending' },
    overdue: { cls: 'critical', label: 'Overdue' }
  };

  var ACTIVITY = [
    { text: '<strong>Thu Ha Nguyen</strong> checked out <strong>Minh Duc Nguyen</strong> at Court 07 — Invoice #INV-0231 $45.00', time: '2 min ago', icon: 'check' },
    { text: '<strong>Van Long Tran</strong> opened a session on Court 01 for <strong>Thi Lan Tran</strong>', time: '18 min ago', icon: 'play' },
    { text: 'New booking created by <strong>Bao Ngoc Vo</strong> for Court 05, 5:00 PM', time: '34 min ago', icon: 'calendar' },
    { text: '<strong>My Duyen Le</strong> marked Court 06 under maintenance', time: '1 hr ago', icon: 'tool' },
    { text: 'Payment of <strong>$58.00</strong> received from <strong>Gia Huy Pham</strong>', time: '2 hr ago', icon: 'dollar' }
  ];

  var ACTIVITY_ICONS = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
    dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'
  };

  // Deterministic pseudo-random so the chart looks the same on every load
  function seeded(seed) {
    var s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function buildSeries(days, base, spread, seed) {
    var rand = seeded(seed);
    var out = [];
    var d = new Date();
    for (var i = days - 1; i >= 0; i--) {
      var day = new Date(d);
      day.setDate(d.getDate() - i);
      var weekend = (day.getDay() === 0 || day.getDay() === 6) ? 1.25 : 1;
      var value = Math.max(0, base * weekend + (rand() - 0.5) * spread);
      out.push({
        label: day.toLocaleDateString('en-US', { weekday: days <= 7 ? 'short' : undefined, month: days > 7 ? 'short' : undefined, day: days > 7 ? 'numeric' : undefined }),
        value: value
      });
    }
    return out;
  }

  var RANGE_CONFIG = {
    1: { days: 1, revBase: 1280, revSpread: 0, bookBase: 47, bookSpread: 0 },
    7: { days: 7, revBase: 1150, revSpread: 380, bookBase: 42, bookSpread: 14 },
    30: { days: 30, revBase: 1100, revSpread: 420, bookBase: 40, bookSpread: 16 },
    90: { days: 90, revBase: 1050, revSpread: 460, bookBase: 38, bookSpread: 18 }
  };

  var currentRange = 7;

  /* ------------------------------------------------------------------------
     4. KPI STAT TILES
     ------------------------------------------------------------------------ */
  var STAT_ICONS = {
    revenue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    bookings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    util: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    duration: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'
  };

  function renderStatTiles() {
    var cfg = RANGE_CONFIG[currentRange];
    var totalRevenue = cfg.revBase * cfg.days;
    var totalBookings = Math.round(cfg.bookBase * cfg.days);
    var util = 72 + (currentRange === 1 ? 6 : 0);
    var stats = [
      { key: 'revenue', label: 'Revenue', value: fmtMoney(totalRevenue), delta: '+12.4%', up: true, vs: 'vs prior period' },
      { key: 'bookings', label: 'Bookings', value: totalBookings.toLocaleString('en-US'), delta: '+8.1%', up: true, vs: 'vs prior period' },
      { key: 'util', label: 'Court Utilization', value: util + '%', delta: '+3.2%', up: true, vs: 'vs prior period' },
      { key: 'customers', label: 'Active Customers', value: '312', delta: '+18', up: true, vs: 'new this period' },
      { key: 'duration', label: 'Avg Session Duration', value: '1h 42m', delta: '-4 min', up: false, vs: 'vs prior period' },
      { key: 'invoice', label: 'Pending Invoices', value: '5', delta: '$340', up: false, vs: 'outstanding' }
    ];

    var grid = document.getElementById('stat-grid');
    grid.innerHTML = '';
    stats.forEach(function (s) {
      var tile = el('div', 'card stat-tile');
      var top = el('div', 'stat-tile-top');
      var icon = el('div', 'stat-icon');
      icon.innerHTML = STAT_ICONS[s.key];
      top.appendChild(icon);
      tile.appendChild(top);
      tile.appendChild(el('div', 'stat-label', s.label));
      tile.appendChild(el('div', 'stat-value', s.value));

      var delta = el('div', 'stat-delta ' + (s.up ? 'up' : 'down'));
      var arrow = document.createElement('span');
      arrow.innerHTML = s.up
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 15l-6-6-6 6"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>';
      delta.appendChild(arrow);
      delta.appendChild(document.createTextNode(s.delta));
      var vs = el('span', 'vs', s.vs);
      delta.appendChild(vs);
      tile.appendChild(delta);

      grid.appendChild(tile);
    });
  }

  /* ------------------------------------------------------------------------
     5. COURT STATUS GRID
     ------------------------------------------------------------------------ */
  function renderCourts() {
    var grid = document.getElementById('courts-grid');
    grid.innerHTML = '';
    COURTS.forEach(function (c) {
      var meta = STATUS_META[c.status];
      var tile = el('div', 'card court-tile');

      var top = el('div', 'court-tile-top');
      var left = document.createElement('div');
      left.appendChild(el('div', 'court-name', c.name));
      left.appendChild(el('div', 'court-type', c.type));
      top.appendChild(left);
      var pill = el('span', 'status-pill ' + meta.cls, meta.label);
      top.appendChild(pill);
      tile.appendChild(top);

      tile.appendChild(el('div', 'court-meta', c.meta));

      var track = el('div', 'court-progress');
      var fill = el('div', 'court-progress-fill');
      fill.style.width = c.util + '%';
      track.appendChild(fill);
      tile.appendChild(track);

      grid.appendChild(tile);
    });

    var avgUtil = Math.round(COURTS.reduce(function (a, c) { return a + c.util; }, 0) / COURTS.length);
    document.getElementById('util-total').textContent = avgUtil + '%';
  }

  /* ------------------------------------------------------------------------
     6. UTILIZATION BARS (per court)
     ------------------------------------------------------------------------ */
  function renderUtilBars() {
    var wrap = document.getElementById('util-bars');
    wrap.innerHTML = '';
    COURTS.forEach(function (c) {
      var row = el('div', 'bar-row');
      row.appendChild(el('div', 'bar-label', c.name.replace('Court ', 'C')));
      var track = el('div', 'bar-track');
      var fill = el('div', 'bar-fill');
      fill.style.width = c.util + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('div', 'bar-value', c.util + '%'));
      wrap.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------------
     7. SESSIONS / INVOICES TABLES
     ------------------------------------------------------------------------ */
  function renderSessionsTable() {
    var tbody = document.querySelector('#sessions-table tbody');
    tbody.innerHTML = '';
    SESSIONS_TODAY.forEach(function (s) {
      var tr = document.createElement('tr');

      var tdUser = document.createElement('td');
      var userWrap = el('div', 'cell-user');
      userWrap.appendChild(el('div', 'mini-avatar', initials(s.name)));
      var nameSpan = el('span', 'primary-cell', s.name);
      userWrap.appendChild(nameSpan);
      tdUser.appendChild(userWrap);
      tr.appendChild(tdUser);

      tr.appendChild(el('td', '', s.court));
      tr.appendChild(el('td', '', s.start));
      tr.appendChild(el('td', 'tnum', s.duration));

      var tdStatus = document.createElement('td');
      var meta = SESSION_STATUS_META[s.status];
      tdStatus.appendChild(el('span', 'status-pill ' + meta.cls, meta.label));
      tr.appendChild(tdStatus);

      var tdAmt = el('td', 'tnum', fmtMoney(s.amount));
      tdAmt.style.textAlign = 'right';
      tdAmt.style.color = 'var(--text-primary)';
      tdAmt.style.fontWeight = '700';
      tr.appendChild(tdAmt);

      tbody.appendChild(tr);
    });
  }

  function renderInvoicesTable() {
    var tbody = document.querySelector('#invoices-table tbody');
    tbody.innerHTML = '';
    INVOICES.forEach(function (inv) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', 'primary-cell', inv.id));
      tr.appendChild(el('td', '', inv.name));
      tr.appendChild(el('td', '', inv.date));

      var tdStatus = document.createElement('td');
      var meta = INVOICE_STATUS_META[inv.status];
      tdStatus.appendChild(el('span', 'status-pill ' + meta.cls, meta.label));
      tr.appendChild(tdStatus);

      var tdAmt = el('td', 'tnum', fmtMoney(inv.amount));
      tdAmt.style.textAlign = 'right';
      tdAmt.style.color = 'var(--text-primary)';
      tdAmt.style.fontWeight = '700';
      tr.appendChild(tdAmt);

      tbody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------------
     8. TOP CUSTOMERS / EMPLOYEES WIDGETS
     ------------------------------------------------------------------------ */
  function renderPeopleWidgets() {
    var custWrap = document.getElementById('top-customers');
    custWrap.innerHTML = '';
    TOP_CUSTOMERS.forEach(function (c) {
      var row = el('div', 'widget-row');
      row.appendChild(el('div', 'mini-avatar', initials(c.name)));
      var grow = el('div', 'grow');
      grow.appendChild(el('div', 'name', c.name));
      grow.appendChild(el('div', 'sub', c.sub));
      row.appendChild(grow);
      var metricWrap = document.createElement('div');
      metricWrap.appendChild(el('div', 'metric', c.metric));
      metricWrap.appendChild(el('div', 'metric-sub', c.metricSub));
      row.appendChild(metricWrap);
      custWrap.appendChild(row);
    });

    var empWrap = document.getElementById('employees-list');
    empWrap.innerHTML = '';
    EMPLOYEES.forEach(function (e2) {
      var row = el('div', 'widget-row');
      row.appendChild(el('div', 'mini-avatar', initials(e2.name)));
      var grow = el('div', 'grow');
      grow.appendChild(el('div', 'name', e2.name));
      grow.appendChild(el('div', 'sub', e2.sub));
      row.appendChild(grow);
      var metricWrap = document.createElement('div');
      var pill = el('span', 'status-pill ' + e2.status, e2.metric);
      metricWrap.appendChild(pill);
      metricWrap.appendChild(el('div', 'metric-sub', e2.metricSub));
      row.appendChild(metricWrap);
      empWrap.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------------
     9. ACTIVITY FEED
     ------------------------------------------------------------------------ */
  function renderActivity() {
    var feed = document.getElementById('activity-feed');
    feed.innerHTML = '';
    ACTIVITY.forEach(function (a) {
      var item = el('div', 'activity-item');
      var dot = el('div', 'activity-dot');
      dot.innerHTML = ACTIVITY_ICONS[a.icon] || '';
      item.appendChild(dot);
      var body = document.createElement('div');
      var text = el('div', 'activity-text');
      text.innerHTML = a.text; // fixed local strings only, not user-supplied
      body.appendChild(text);
      body.appendChild(el('div', 'activity-time', a.time));
      item.appendChild(body);
      feed.appendChild(item);
    });
  }

  /* ------------------------------------------------------------------------
     10. CHARTS — line (revenue) + bar (bookings), SVG, hover tooltip
     ------------------------------------------------------------------------ */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function buildLineChart(container, data, opts) {
    container.innerHTML = '';
    var W = 560, H = 200, padL = 8, padR = 8, padT = 16, padB = 26;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' });

    var max = Math.max.apply(null, data.map(function (d) { return d.value; })) * 1.15;
    var min = 0;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var xStep = data.length > 1 ? innerW / (data.length - 1) : 0;

    function xAt(i) { return padL + i * xStep; }
    function yAt(v) { return padT + innerH - ((v - min) / (max - min || 1)) * innerH; }

    // gridlines (3 horizontal, hairline, recessive)
    var grid = cssVar('--grid-line');
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (innerH / 3) * g;
      svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: gy, y2: gy, stroke: grid, 'stroke-width': 1 }));
    }

    // area fill
    var seriesColor = opts.color;
    var fillColor = opts.fillColor;
    var areaPts = data.map(function (d, i) { return xAt(i) + ',' + yAt(d.value); }).join(' ');
    var areaPath = 'M' + xAt(0) + ',' + yAt(0) + ' L' + areaPts + ' L' + xAt(data.length - 1) + ',' + yAt(0) + ' Z';
    svg.appendChild(svgEl('path', { d: areaPath, fill: fillColor, stroke: 'none' }));

    // line
    var linePts = data.map(function (d, i) { return xAt(i) + ',' + yAt(d.value); }).join(' ');
    svg.appendChild(svgEl('polyline', {
      points: linePts, fill: 'none', stroke: seriesColor, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    // crosshair
    var crosshair = svgEl('line', { class: 'crosshair-line', x1: 0, x2: 0, y1: padT, y2: H - padB });
    svg.appendChild(crosshair);

    // end marker (surface ring + fill) — only endpoint gets a permanent dot
    var lastIdx = data.length - 1;
    var surface = cssVar('--surface-1');
    svg.appendChild(svgEl('circle', { cx: xAt(lastIdx), cy: yAt(data[lastIdx].value), r: 6, fill: surface }));
    svg.appendChild(svgEl('circle', { cx: xAt(lastIdx), cy: yAt(data[lastIdx].value), r: 4, fill: seriesColor }));

    // x-axis labels: first, middle, last only (avoid clutter)
    var labelIdxs = data.length <= 8
      ? data.map(function (_, i) { return i; })
      : [0, Math.floor(data.length / 2), data.length - 1];
    labelIdxs.forEach(function (i) {
      var t = svgEl('text', {
        x: xAt(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : (i === lastIdx ? 'end' : 'middle'),
        'font-size': '9', fill: cssVar('--text-muted'), 'font-family': 'var(--font-body)'
      });
      t.textContent = data[i].label;
      svg.appendChild(t);
    });

    // hover hit layer
    var hoverDot = svgEl('circle', { r: 5, fill: seriesColor, stroke: surface, 'stroke-width': 2 });
    hoverDot.style.opacity = '0';
    svg.appendChild(hoverDot);

    container.appendChild(svg);

    var tooltip = el('div', 'chart-tooltip');
    tooltip.innerHTML = '<div class="tt-label"></div><div class="tt-row"><span class="tt-key" style="background:' + seriesColor + '"></span><span class="tt-value"></span></div>';
    container.style.position = 'relative';
    container.appendChild(tooltip);

    function handleMove(clientX, clientY) {
      var rect = svg.getBoundingClientRect();
      var relX = ((clientX - rect.left) / rect.width) * W;
      var idx = Math.round((relX - padL) / (xStep || 1));
      idx = Math.max(0, Math.min(data.length - 1, idx));
      var d = data[idx];

      crosshair.setAttribute('x1', xAt(idx));
      crosshair.setAttribute('x2', xAt(idx));
      crosshair.classList.add('visible');

      hoverDot.setAttribute('cx', xAt(idx));
      hoverDot.setAttribute('cy', yAt(d.value));
      hoverDot.style.opacity = '1';

      tooltip.querySelector('.tt-label').textContent = d.label;
      tooltip.querySelector('.tt-value').textContent = opts.formatValue(d.value);
      var leftPct = (xAt(idx) / W) * 100;
      var topPct = (yAt(d.value) / H) * 100;
      tooltip.style.left = leftPct + '%';
      tooltip.style.top = topPct + '%';
      tooltip.classList.add('visible');
    }

    svg.addEventListener('pointermove', function (e) { handleMove(e.clientX, e.clientY); });
    svg.addEventListener('pointerleave', function () {
      crosshair.classList.remove('visible');
      hoverDot.style.opacity = '0';
      tooltip.classList.remove('visible');
    });
  }

  function buildBarChart(container, data, opts) {
    container.innerHTML = '';
    var W = 560, H = 200, padL = 8, padR = 8, padT = 16, padB = 26;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' });

    var max = Math.max.apply(null, data.map(function (d) { return d.value; })) * 1.15;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var slot = innerW / data.length;
    var barW = Math.min(24, slot * 0.5);

    var grid = cssVar('--grid-line');
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (innerH / 3) * g;
      svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: gy, y2: gy, stroke: grid, 'stroke-width': 1 }));
    }

    var color = opts.color;
    var surface = cssVar('--surface-1');
    var bars = [];

    data.forEach(function (d, i) {
      var cx = padL + slot * i + slot / 2;
      var barH = (d.value / max) * innerH;
      var y = padT + innerH - barH;
      var rectG = svgEl('g', { class: 'bar-hit' });

      // visible bar: 4px rounded top, square baseline
      var bar = svgEl('rect', {
        x: cx - barW / 2, y: y, width: barW, height: Math.max(barH, 2),
        rx: 4, ry: 4, fill: color
      });
      // mask bottom corners square by overlaying a square patch (simpler than clipPath for this scale)
      rectG.appendChild(bar);
      if (barH > 4) {
        rectG.appendChild(svgEl('rect', { x: cx - barW / 2, y: y + barH - 4, width: barW, height: 4, fill: color }));
      }

      // invisible larger hit target
      var hit = svgEl('rect', { x: cx - slot / 2, y: padT, width: slot, height: innerH, fill: 'transparent' });
      rectG.appendChild(hit);

      svg.appendChild(rectG);
      bars.push({ node: bar, cx: cx, y: y, d: d, hit: hit });
    });

    var labelIdxs = data.length <= 8
      ? data.map(function (_, i) { return i; })
      : [0, Math.floor(data.length / 2), data.length - 1];
    labelIdxs.forEach(function (i) {
      var d = data[i];
      var cx = padL + slot * i + slot / 2;
      var t = svgEl('text', {
        x: cx, y: H - 6, 'text-anchor': 'middle',
        'font-size': '9', fill: cssVar('--text-muted')
      });
      t.textContent = d.label;
      svg.appendChild(t);
    });

    container.appendChild(svg);

    var tooltip = el('div', 'chart-tooltip');
    tooltip.innerHTML = '<div class="tt-label"></div><div class="tt-row"><span class="tt-key" style="background:' + color + '"></span><span class="tt-value"></span></div>';
    container.style.position = 'relative';
    container.appendChild(tooltip);

    bars.forEach(function (b) {
      b.hit.addEventListener('pointerenter', function () { b.node.style.opacity = '0.75'; });
      b.hit.addEventListener('pointerleave', function () {
        b.node.style.opacity = '1';
        tooltip.classList.remove('visible');
      });
      b.hit.addEventListener('pointermove', function () {
        tooltip.querySelector('.tt-label').textContent = b.d.label;
        tooltip.querySelector('.tt-value').textContent = opts.formatValue(b.d.value);
        tooltip.style.left = ((b.cx) / W) * 100 + '%';
        tooltip.style.top = (b.y / H) * 100 + '%';
        tooltip.classList.add('visible');
      });
    });
  }

  function renderCharts() {
    var cfg = RANGE_CONFIG[currentRange];
    var revenueData = buildSeries(Math.max(cfg.days, 2), cfg.revBase, cfg.revSpread, 42);
    var bookingsData = buildSeries(Math.max(cfg.days, 2), cfg.bookBase, cfg.bookSpread, 99);

    var revTotal = revenueData.reduce(function (a, d) { return a + d.value; }, 0);
    var bookTotal = bookingsData.reduce(function (a, d) { return a + d.value; }, 0);
    document.getElementById('revenue-total').textContent = fmtMoney(revTotal);
    document.getElementById('bookings-total').textContent = Math.round(bookTotal).toLocaleString('en-US');

    buildLineChart(document.getElementById('revenue-chart-wrap'), revenueData, {
      color: cssVar('--series-revenue'),
      fillColor: cssVar('--series-revenue-fill'),
      formatValue: fmtMoney
    });

    buildBarChart(document.getElementById('bookings-chart-wrap'), bookingsData, {
      color: cssVar('--series-bookings'),
      formatValue: function (v) { return Math.round(v) + ' sessions'; }
    });
  }

  /* ------------------------------------------------------------------------
     11. FILTER CHIPS (date range) — re-render everything range-dependent
     ------------------------------------------------------------------------ */
  document.querySelectorAll('.filter-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      currentRange = parseInt(chip.getAttribute('data-range'), 10);
      renderStatTiles();
      renderCharts();
    });
  });

  /* ------------------------------------------------------------------------
     12. INIT
     ------------------------------------------------------------------------ */
  renderStatTiles();
  renderCourts();
  renderUtilBars();
  renderSessionsTable();
  renderInvoicesTable();
  renderPeopleWidgets();
  renderActivity();
  renderCharts();

  window.addEventListener('resize', function () {
    clearTimeout(window.__bpResizeT);
    window.__bpResizeT = setTimeout(renderCharts, 150);
  });

})();
