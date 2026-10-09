import { describe, test, expect } from 'vitest';
import { buildSiteNav, buildAccountMenu, resolveActive, resolveActiveChild, NAV_KEYS } from './siteNav';

const customer = { id: 7, fullName: 'Nguyễn Văn Khách', role: { name: 'customer' } };
const admin = { id: 1, fullName: 'Quản Trị', role: 'admin' };
const employee = { id: 2, fullName: 'Nhân Viên', role: 'employee' };
const loc = (pathname, hash = '', search = '') => ({ pathname, hash, search });

describe('buildSiteNav — các mục chính', () => {
  test('bốn mục theo đúng thứ tự: Trang chủ, Đặt sân, Cửa hàng, Thi đấu', () => {
    const { items } = buildSiteNav({ user: null });
    expect(items.map((i) => i.label)).toEqual(['Trang chủ', 'Đặt sân', 'Cửa hàng', 'Thi đấu']);
  });

  test('Đặt sân là liên kết thường: không có mục con, trỏ tới ô đặt nhanh ở Trang chủ', () => {
    const book = buildSiteNav({ user: customer }).items.find((i) => i.key === NAV_KEYS.book);
    expect(book.children).toEqual([]);
    expect(book.to).toBe('/#booking-widget');
  });

  test('Trang chủ có 6 mốc tiếng Việt, id khớp các <section> của HomePage', () => {
    const home = buildSiteNav({}).items[0];
    expect(home.children.map((c) => c.label)).toEqual(['Sân', 'Lịch trống', 'Tiện ích', 'Bảng giá', 'Dụng cụ', 'Hỏi đáp']);
    expect(home.children.map((c) => c.to)).toEqual(['/#courts', '/#availability', '/#facilities', '/#pricing', '/#services', '/#faq']);
  });

  test('Cửa hàng theo danh mục Vợt, Giày, Phụ kiện', () => {
    const shop = buildSiteNav({}).items.find((i) => i.key === NAV_KEYS.shop);
    expect(shop.children.map((c) => c.label)).toEqual(['Vợt', 'Giày', 'Phụ kiện']);
    expect(shop.children.map((c) => c.to)).toEqual(['/shop?category=vot', '/shop?category=giay', '/shop?category=phu-kien']);
  });

  test('Thi đấu: khách chưa đăng nhập không thấy Lịch sử thi đấu, khách hàng thấy', () => {
    const labels = (user) => buildSiteNav({ user }).items.find((i) => i.key === NAV_KEYS.comp).children.map((c) => c.label);
    expect(labels(null)).toEqual(['Tổng quan', 'Giải đấu', 'Giao lưu', 'Xếp hạng']);
    expect(labels(customer)).toEqual(['Tổng quan', 'Giải đấu', 'Giao lưu', 'Xếp hạng', 'Lịch sử thi đấu']);
    // nhân viên không có "của tôi" trong khu khách
    expect(labels(admin)).toEqual(['Tổng quan', 'Giải đấu', 'Giao lưu', 'Xếp hạng']);
  });

  test('dịch vụ thi đấu tắt: mục Thi đấu và ô tab Thi đấu biến mất, không để liên kết chết', () => {
    const nav = buildSiteNav({ user: customer, competitionOn: false });
    expect(nav.items.map((i) => i.key)).toEqual(['home', 'book', 'shop']);
    expect(nav.tabs.map((t) => t.key)).toEqual(['home', 'shop', 'book', 'profile']);
    expect(nav.account.menu.map((m) => m.key)).not.toContain('history');
  });
});

describe('thanh tab dưới', () => {
  test('5 ô: Trang chủ, Cửa hàng, Đặt sân, Thi đấu, Profile', () => {
    expect(buildSiteNav({}).tabs.map((t) => t.label)).toEqual(['Trang chủ', 'Cửa hàng', 'Đặt sân', 'Thi đấu', 'Profile']);
  });

  test('Profile đi tới đúng chỗ theo vai trò', () => {
    const target = (user) => buildSiteNav({ user }).tabs.at(-1).to;
    expect(target(null)).toBe('/login');
    expect(target(customer)).toBe('/account');
    expect(target(admin)).toBe('/dashboard');
    expect(target(employee)).toBe('/courts');
  });
});

describe('menu tài khoản', () => {
  test('khách chưa đăng nhập: không có menu', () => {
    expect(buildAccountMenu(null)).toEqual([]);
    expect(buildSiteNav({}).account).toBeNull();
  });

  test('khách hàng: Tài khoản, Đơn mua, Lịch đặt, Lịch sử thi đấu, Đăng xuất', () => {
    expect(buildAccountMenu(customer).map((m) => m.label)).toEqual(['Tài khoản', 'Đơn mua', 'Lịch đặt', 'Lịch sử thi đấu', 'Đăng xuất']);
    expect(buildAccountMenu(customer).at(-1)).toMatchObject({ action: 'logout' });
  });

  test('nhân viên: chỉ Bàn làm việc (đúng trang của vai trò) và Đăng xuất', () => {
    expect(buildAccountMenu(admin).map((m) => m.to || m.action)).toEqual(['/dashboard', 'logout']);
    expect(buildAccountMenu(employee)[0].to).toBe('/courts');
  });

  test('chữ cái đầu của tên để vẽ ảnh đại diện', () => {
    expect(buildSiteNav({ user: customer }).account.initials).toBe('NK');
    expect(buildSiteNav({ user: { fullName: 'Nam' } }).account.initials).toBe('N');
  });
});

describe('resolveActive — mục chính đang đứng', () => {
  test('Trang chủ chỉ sáng ở "/", và KHÔNG bao giờ sáng ở khu Thi đấu (lỗi cũ: "Trang chủ" sáng ở /thi-dau)', () => {
    expect(resolveActive(loc('/'))).toBe('home');
    for (const p of ['/thi-dau', '/thi-dau/giai/abc', '/rankings', '/players/9']) expect(resolveActive(loc(p))).toBe('comp');
  });

  test('"/" kèm #booking-widget là Đặt sân; trang Lịch đặt cũng là Đặt sân', () => {
    expect(resolveActive(loc('/', '#booking-widget'))).toBe('book');
    expect(resolveActive(loc('/', '#pricing'))).toBe('home');
    expect(resolveActive(loc('/my-bookings'))).toBe('book');
  });

  test('khu Cửa hàng gồm giỏ, thanh toán, đơn mua', () => {
    for (const p of ['/shop', '/shop/12', '/cart', '/checkout', '/orders', '/orders/3']) expect(resolveActive(loc(p))).toBe('shop');
  });

  test('khu Thi đấu gồm các trang "của tôi"', () => {
    for (const p of ['/my-rating', '/my-rating/assess', '/my-tournaments', '/my-matches/5/score']) expect(resolveActive(loc(p))).toBe('comp');
  });

  test('tài khoản và đăng nhập thuộc Profile; địa chỉ lạ không sáng mục nào', () => {
    for (const p of ['/account', '/login', '/register']) expect(resolveActive(loc(p))).toBe('profile');
    expect(resolveActive(loc('/khong-co'))).toBeNull();
  });

  test('không truyền địa chỉ thì coi như "/"', () => {
    expect(resolveActive(undefined)).toBe('home');
  });
});

describe('resolveActiveChild — mục con đang sáng', () => {
  const comp = buildSiteNav({ user: customer }).items.find((i) => i.key === 'comp');
  const shop = buildSiteNav({}).items.find((i) => i.key === 'shop');
  const home = buildSiteNav({}).items[0];

  test('Thi đấu: tổng quan, #giai, #giao-luu, trang chi tiết và bảng xếp hạng', () => {
    expect(resolveActiveChild(comp, loc('/thi-dau'))).toBe('overview');
    expect(resolveActiveChild(comp, loc('/thi-dau', '#giai'))).toBe('tournaments');
    expect(resolveActiveChild(comp, loc('/thi-dau/giai/abc'))).toBe('tournaments');
    expect(resolveActiveChild(comp, loc('/thi-dau', '#giao-luu'))).toBe('sessions');
    expect(resolveActiveChild(comp, loc('/thi-dau/giao-luu/xyz'))).toBe('sessions');
    expect(resolveActiveChild(comp, loc('/rankings'))).toBe('rankings');
    expect(resolveActiveChild(comp, loc('/players/4'))).toBe('rankings');
    expect(resolveActiveChild(comp, loc('/my-tournaments'))).toBe('history');
  });

  test('Cửa hàng theo ?category=; Trang chủ theo #mốc', () => {
    expect(resolveActiveChild(shop, loc('/shop', '', '?category=giay'))).toBe('giay');
    expect(resolveActiveChild(shop, loc('/shop'))).toBeNull();
    expect(resolveActiveChild(home, loc('/', '#pricing'))).toBe('pricing');
    expect(resolveActiveChild(home, loc('/'))).toBeNull();
  });
});
