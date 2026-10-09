import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import SiteHeaderView from './SiteHeaderView';
import { buildSiteNav } from './siteNav';

const customer = { id: 7, fullName: 'Nguyễn Văn Khách', role: 'customer' };

const render = (path, props = {}, navCtx = {}) => {
  const [pathname, hash = ''] = path.split('#');
  const location = { pathname, hash: hash ? `#${hash}` : '', search: '' };
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <SiteHeaderView nav={buildSiteNav(navCtx)} location={location} {...props} />
    </StaticRouter>
  );
};
const text = (html) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

describe('SiteHeaderView — thanh trên', () => {
  test('thứ tự: logo, Trang chủ, Đặt sân, Cửa hàng, Thi đấu; không còn nút Instant Book', () => {
    const t = text(render('/'));
    const at = (s) => t.indexOf(s);
    expect(at('BADMINTON')).toBeLessThan(at('Trang chủ'));
    expect(at('Trang chủ')).toBeLessThan(at('Đặt sân'));
    expect(at('Đặt sân')).toBeLessThan(at('Cửa hàng'));
    expect(at('Cửa hàng')).toBeLessThan(at('Thi đấu'));
    expect(t).not.toMatch(/Instant/i);
  });

  test('chỉ Trang chủ, Cửa hàng, Thi đấu có nút ▾; Đặt sân là liên kết thường tới trang Đặt sân', () => {
    const html = render('/');
    expect((html.match(/aria-label="Mở menu (Trang chủ|Cửa hàng|Thi đấu)"/g) || []).length).toBe(3);
    expect(html).toMatch(/<a [^>]*href="\/dat-san"[^>]*>Đặt sân<\/a>/);
  });

  test('khách: Đăng nhập là nút nổi bật (dải xanh), Đăng ký là nút viền', () => {
    const html = render('/');
    expect(html).toMatch(/from-\[#00ff66\][^>]*>Đăng nhập</);
    expect(html).toMatch(/border[^>]*>Đăng ký</);
    expect(html).not.toMatch(/from-\[#00ff66\][^>]*>Đăng ký</);
  });

  test('"Trang chủ" không bao giờ sáng ở khu Thi đấu; "Thi đấu" sáng', () => {
    const html = render('/thi-dau');
    expect(html).toMatch(/aria-current="page"[^>]*>Thi đấu</);
    expect(html).not.toMatch(/aria-current="page"[^>]*>Trang chủ</);
  });

  test('trang /dat-san sáng Đặt sân, không sáng Trang chủ', () => {
    const html = render('/dat-san');
    expect(html).toMatch(/aria-current="page"[^>]*>Đặt sân</);
    expect(html).not.toMatch(/aria-current="page"[^>]*>Trang chủ</);
  });

  test('menu thả xuống đóng sẵn (chưa rê chuột thì không có mục con trong DOM)', () => {
    const t = text(render('/'));
    expect(t).not.toMatch(/Vợt|Lịch trống|Giao lưu/);
  });

  test('khách hàng: nút tên thay cho Đăng nhập / Đăng ký; đủ ký tự đầu', () => {
    const html = render('/', {}, { user: customer });
    expect(html).toMatch(/NK/);
    expect(html).not.toMatch(/>Đăng nhập</);
  });

  test('giỏ hàng có số khi có hàng, kể cả ở trang Thi đấu', () => {
    expect(render('/thi-dau', { cartCount: 3 })).toMatch(/aria-label="Giỏ hàng, 3 sản phẩm"/);
    expect(render('/thi-dau', { cartCount: 0 })).toMatch(/aria-label="Giỏ hàng"/);
  });

  test('nút đổi giao diện chỉ hiện khi được bật (Trang chủ không bật)', () => {
    expect(render('/', { showThemeToggle: true, theme: 'dark' })).toMatch(/Chuyển sang giao diện sáng/);
    expect(render('/', { showThemeToggle: false, theme: 'dark' })).not.toMatch(/Chuyển sang giao diện/);
  });

  test('dịch vụ thi đấu tắt: không còn mục Thi đấu ở thanh trên lẫn thanh tab', () => {
    const t = text(render('/shop', {}, { competitionOn: false }));
    expect(t).not.toMatch(/Thi đấu/);
  });
});

describe('SiteHeaderView — kiểu và thanh tab', () => {
  test('thanh tab dưới luôn có 5 ô, ở cả Trang chủ và Thi đấu', () => {
    for (const path of ['/', '/thi-dau', '/shop']) {
      const html = render(path);
      const tabs = /aria-label="Điều hướng nhanh"[\s\S]*<\/nav>/.exec(html)[0];
      expect(text(tabs)).toMatch(/Trang chủ\|.*Cửa hàng\|.*Đặt sân\|.*Thi đấu\|.*Profile/);
    }
  });

  test('ô tab của khu đang đứng sáng', () => {
    const tabs = /aria-label="Điều hướng nhanh"[\s\S]*<\/nav>/.exec(render('/thi-dau'))[0];
    expect(tabs).toMatch(/aria-current="page"[^>]*>[\s\S]*?Thi đấu</);
  });

  test('overlay (Trang chủ): cố định, trong suốt ở đầu trang, đặc khi đã cuộn', () => {
    expect(render('/', { overlay: true, scrolled: false, tone: 'dark' })).toMatch(/fixed inset-x-0 top-0[^"]*bg-transparent/);
    expect(render('/', { overlay: true, scrolled: true, tone: 'dark' })).toMatch(/fixed inset-x-0 top-0[^"]*bg-slate-950\/90/);
    expect(render('/shop')).toMatch(/sticky top-0/);
  });

  test('tone dark không phụ thuộc lớp dark: (Trang chủ có thể không có html.dark); tone auto có cặp sáng / tối', () => {
    const dark = /<header[\s\S]*<\/header>/.exec(render('/', { tone: 'dark' }))[0];
    expect(dark).not.toMatch(/dark:/);
    const auto = /<header[\s\S]*<\/header>/.exec(render('/shop'))[0];
    expect(auto).toMatch(/dark:bg-slate-950\/90/);
    expect(auto).toMatch(/text-slate-900/);
  });
});
