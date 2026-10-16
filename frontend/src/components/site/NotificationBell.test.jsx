import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import NotificationBell from './NotificationBell';
import SiteHeaderView from './SiteHeaderView';
import { buildSiteNav } from './siteNav';

const NOW = new Date('2026-10-16T10:00:00Z');
const items = [
  { id: 2, type: 'booking.expired', title: 'Lịch đặt sân đã bị huỷ', body: 'Sân số 1 · 16/10/2026 · 19:00–20:00 đã bị huỷ.', readAt: null, createdAt: '2026-10-16T09:55:00Z' },
  { id: 1, type: 'booking.confirmed', title: 'Lịch đã được xác nhận', body: 'Sân số 2 · 17/10/2026 · 08:00–09:00.', readAt: '2026-10-15T00:00:00Z', createdAt: '2026-10-14T10:00:00Z' }
];

const inRouter = (node) => renderToStaticMarkup(<StaticRouter location="/">{node}</StaticRouter>);
const customer = { id: 7, fullName: 'Nguyễn Văn Khách', role: 'customer' };
const header = (props = {}) => inRouter(
  <SiteHeaderView nav={buildSiteNav({ user: customer })} location={{ pathname: '/', hash: '', search: '' }} {...props} />
);

describe('NotificationBell', () => {
  test('đóng: chỉ nút chuông có chấm số chưa đọc và nhãn cho trình đọc màn hình', () => {
    const html = inRouter(<NotificationBell tone="dark" unreadCount={3} items={items} open={false} />);
    expect(html).toContain('aria-label="Thông báo, 3 chưa đọc"');
    expect(html).toContain('data-testid="notification-badge"');
    expect(html).toContain('>3<');
    expect(html).not.toContain('id="site-notification-panel"');
  });

  test('không có thông báo chưa đọc: không có chấm đỏ', () => {
    const html = inRouter(<NotificationBell tone="dark" unreadCount={0} items={[]} open={false} />);
    expect(html).not.toContain('notification-badge');
    expect(html).toContain('aria-label="Thông báo"');
  });

  test('mở: liệt kê thông báo, dòng chưa đọc có chấm, có "Đánh dấu đã đọc hết" và "Xem tất cả"', () => {
    const html = inRouter(<NotificationBell tone="auto" unreadCount={1} items={items} open now={NOW} />);
    expect(html).toContain('Lịch đặt sân đã bị huỷ');
    expect(html).toContain('5 phút trước');
    expect(html).toContain('aria-label="chưa đọc"');
    expect(html).toContain('Đánh dấu đã đọc hết');
    expect(html).toMatch(/href="\/notifications"[^>]*>Xem tất cả</);
    expect(html).toMatch(/href="\/my-bookings"/);
  });

  test('mở nhưng trống: nói rõ chưa có thông báo, không có nút đánh dấu', () => {
    const html = inRouter(<NotificationBell tone="auto" unreadCount={0} items={[]} open />);
    expect(html).toContain('Chưa có thông báo nào.');
    expect(html).not.toContain('Đánh dấu đã đọc hết');
  });

  test('variant link (điện thoại): liên kết tới /notifications, không có bảng', () => {
    const html = inRouter(<NotificationBell variant="link" tone="dark" unreadCount={2} />);
    expect(html).toMatch(/<a [^>]*href="\/notifications"/);
    expect(html).not.toContain('id="site-notification-panel"');
  });

  test('tông auto có đủ cả hai nửa class sáng/tối ở bảng', () => {
    const auto = inRouter(<NotificationBell tone="auto" unreadCount={1} items={items} open />);
    expect(auto).toMatch(/dark:/);
  });
});

describe('SiteHeaderView + chuông', () => {
  test('khách đăng nhập: chuông có ở thanh máy tính và thanh điện thoại (hai lần), trước giỏ hàng', () => {
    const html = header({ notifications: { unreadCount: 4, items, markRead() {}, markAllRead() {} } });
    expect((html.match(/aria-label="Thông báo, 4 chưa đọc"/g) || []).length).toBe(2);
    expect(html.indexOf('Thông báo, 4 chưa đọc')).toBeLessThan(html.indexOf('Giỏ hàng'));
  });

  test('không truyền notifications (chưa đăng nhập / nhân viên): không có chuông', () => {
    expect(header()).not.toContain('Thông báo');
  });
});
