import { roleOf, isStaff, homePathForRole } from '../../utils/roles';

/**
 * Cấu hình điều hướng của header chung (kế hoạch 28, hướng b): các mục chính, mục con, menu tài khoản, thanh tab dưới
 * trên điện thoại và cách tìm mục đang đứng theo địa chỉ.
 *
 * Thuần (không React, không đọc context) để kiểm thử từng quy tắc. Giao diện chỉ vẽ lại những gì file này trả về, nên
 * Trang chủ, Cửa hàng và Thi đấu không thể lệch menu nhau như trước. Thêm / dời một mục thì sửa ở đây, không sửa ở khung trang.
 *
 * Đang làm UX/UI: liên kết chỉ dẫn tới trang đã có (hoặc kèm tham số địa chỉ); dữ liệu và bộ lọc làm sau.
 */

export const NAV_KEYS = { home: 'home', book: 'book', shop: 'shop', comp: 'comp', profile: 'profile' };

// id khớp với <section id> / <div id> trong HomePage.
const HOME_SECTIONS = [
  ['courts', 'Sân'],
  ['availability', 'Lịch trống'],
  ['facilities', 'Tiện ích'],
  ['pricing', 'Bảng giá'],
  ['services', 'Dụng cụ'],
  ['faq', 'Hỏi đáp']
];

const SHOP_CATEGORIES = [
  ['vot', 'Vợt', 'Vợt cầu lông'],
  ['giay', 'Giày', 'Giày thi đấu và tập luyện'],
  ['phu-kien', 'Phụ kiện', 'Cầu, quấn cán, túi, dây cước']
];

const inBase = (pathname, bases) => bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));

const COMP_BASES = ['/thi-dau', '/rankings', '/players', '/my-rating', '/my-tournaments', '/my-matches'];
const PROFILE_BASES = ['/account', '/login', '/register', '/forgot-password', '/reset-password'];

/** Mục chính đang đứng theo địa chỉ hiện tại (null nếu không thuộc mục nào). */
export function resolveActive(location) {
  const pathname = (location && location.pathname) || '/';
  if (pathname === '/') return NAV_KEYS.home;
  if (inBase(pathname, ['/dat-san', '/my-bookings'])) return NAV_KEYS.book;
  if (inBase(pathname, ['/shop', '/cart', '/checkout', '/orders'])) return NAV_KEYS.shop;
  if (inBase(pathname, COMP_BASES)) return NAV_KEYS.comp;
  if (inBase(pathname, PROFILE_BASES)) return NAV_KEYS.profile;
  return null;
}

// Mục con đang đứng: dùng để tô sáng trong menu thả xuống.
const homeChild = ([id, label]) => ({
  key: id,
  label,
  to: `/#${id}`,
  isActive: (loc) => loc.pathname === '/' && loc.hash === `#${id}`
});

const shopChild = ([slug, label, hint]) => ({
  key: slug,
  label,
  hint,
  to: `/shop?category=${slug}`,
  isActive: (loc) => loc.pathname === '/shop' && new URLSearchParams(loc.search || '').get('category') === slug
});

const compChildren = [
  {
    key: 'overview',
    label: 'Tổng quan',
    hint: 'Giải và buổi giao lưu đang mở',
    to: '/thi-dau',
    isActive: (loc) => loc.pathname === '/thi-dau' && loc.hash !== '#giai' && loc.hash !== '#giao-luu'
  },
  {
    key: 'tournaments',
    label: 'Giải đấu',
    hint: 'Đăng ký cả cặp trong một lần',
    to: '/thi-dau#giai',
    isActive: (loc) => (loc.pathname === '/thi-dau' && loc.hash === '#giai') || inBase(loc.pathname, ['/thi-dau/giai'])
  },
  {
    key: 'sessions',
    label: 'Giao lưu',
    hint: 'Báo trước buổi chơi chung',
    to: '/thi-dau#giao-luu',
    isActive: (loc) => (loc.pathname === '/thi-dau' && loc.hash === '#giao-luu') || inBase(loc.pathname, ['/thi-dau/giao-luu'])
  },
  // Hồ sơ người chơi mở từ bảng xếp hạng nên coi như nằm dưới "Xếp hạng".
  {
    key: 'rankings',
    label: 'Xếp hạng',
    hint: 'Bảng trình độ và thành tích',
    to: '/rankings',
    isActive: (loc) => inBase(loc.pathname, ['/rankings', '/players'])
  },
  {
    key: 'history',
    label: 'Lịch sử thi đấu',
    hint: 'Các giải và buổi giao lưu đã tham gia',
    to: '/my-tournaments',
    audience: 'customer',
    isActive: (loc) => inBase(loc.pathname, ['/my-tournaments', '/my-matches', '/my-rating'])
  }
];

const forAudience = (children, isCustomer) => children.filter((c) => !c.audience || (c.audience === 'customer' && isCustomer));

const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
};

/** Menu của nút tên: khách hàng và nhân viên khác nhau; `action: 'logout'` do giao diện xử lý. */
export function buildAccountMenu(user, competitionOn = true) {
  if (!user) return [];
  if (isStaff(user)) {
    return [
      { key: 'workspace', label: 'Bàn làm việc', to: homePathForRole(user) },
      { key: 'logout', label: 'Đăng xuất', action: 'logout' }
    ];
  }
  return [
    { key: 'account', label: 'Tài khoản', to: '/account' },
    { key: 'orders', label: 'Đơn mua', to: '/orders' },
    { key: 'bookings', label: 'Lịch đặt', to: '/my-bookings' },
    ...(competitionOn ? [{ key: 'history', label: 'Lịch sử thi đấu', to: '/my-tournaments' }] : []),
    { key: 'logout', label: 'Đăng xuất', action: 'logout' }
  ];
}

/**
 * Toàn bộ cấu hình cho một người xem.
 * @param {{ user?: object|null, competitionOn?: boolean }} ctx  competitionOn: dịch vụ thi đấu có bật không
 *   (tắt thì mục Thi đấu biến mất, không để lại liên kết chết).
 */
export function buildSiteNav({ user = null, competitionOn = true } = {}) {
  const isCustomer = roleOf(user) === 'customer';

  const items = [
    { key: NAV_KEYS.home, label: 'Trang chủ', to: '/', children: HOME_SECTIONS.map(homeChild) },
    { key: NAV_KEYS.book, label: 'Đặt sân', to: '/dat-san', children: [] },
    { key: NAV_KEYS.shop, label: 'Cửa hàng', to: '/shop', children: SHOP_CATEGORIES.map(shopChild) }
  ];
  if (competitionOn) {
    items.push({ key: NAV_KEYS.comp, label: 'Thi đấu', to: '/thi-dau', children: forAudience(compChildren, isCustomer) });
  }

  // Thanh tab dưới trên điện thoại: mỗi mục chính một ô + Profile (khách chưa đăng nhập đi tới đăng nhập).
  const tabs = [
    { key: NAV_KEYS.home, label: 'Trang chủ', icon: '🏠', to: '/' },
    { key: NAV_KEYS.shop, label: 'Cửa hàng', icon: '🛍️', to: '/shop' },
    { key: NAV_KEYS.book, label: 'Đặt sân', icon: '🎟️', to: '/dat-san' }
  ];
  if (competitionOn) tabs.push({ key: NAV_KEYS.comp, label: 'Thi đấu', icon: '🏆', to: '/thi-dau' });
  tabs.push({
    key: NAV_KEYS.profile,
    label: 'Profile',
    icon: '👤',
    to: !user ? '/login' : isStaff(user) ? homePathForRole(user) : '/account'
  });

  return {
    items,
    tabs,
    account: user
      ? { name: user.fullName || user.email || '', initials: initialsOf(user.fullName || user.email), menu: buildAccountMenu(user, competitionOn) }
      : null
  };
}

/** Mục con nào của `item` đang sáng theo địa chỉ (key, hoặc null). */
export function resolveActiveChild(item, location) {
  const loc = { pathname: '/', hash: '', search: '', ...(location || {}) };
  const child = (item.children || []).find((c) => c.isActive && c.isActive(loc));
  return child ? child.key : null;
}
