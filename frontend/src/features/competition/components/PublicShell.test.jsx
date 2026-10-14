import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';

// Khung khu Thi đấu. Hai lỗi cũ cần giữ chặn (nay do header chung đảm nhiệm, test chi tiết ở components/site):
//  - mục "Trang chủ" vừa sáng ở /thi-dau vừa không dẫn về trang chủ thật;
//  - tên thương hiệu bị chữ "THI ĐẤU" thay chỗ.
// Ở đây kiểm khung dùng đúng header chung và vẫn xử lý trạng thái đang tải / tính năng tắt như trước.
const state = vi.hoisted(() => ({ value: { enabled: true, loading: false } }));
vi.mock('../context/CompetitionContext', () => ({ useCompetition: () => state.value }));
vi.mock('../../../components/site/SiteHeader', () => ({ default: () => <header data-site-header-stub /> }));
vi.mock('../../../components/site/SiteFooter', () => ({ default: () => <footer data-site-footer-stub /> }));

import PublicShell from './PublicShell';

const render = (props = {}) =>
  renderToStaticMarkup(
    <StaticRouter location="/thi-dau">
      <PublicShell {...props}><p>NOI-DUNG-GIAI</p></PublicShell>
    </StaticRouter>
  );

beforeEach(() => { state.value = { enabled: true, loading: false }; });

describe('PublicShell — khung khu Thi đấu', () => {
  test('dùng header chung thay vì header riêng (không còn chữ THI ĐẤU thay tên thương hiệu)', () => {
    const html = render();
    expect(html).toMatch(/data-site-header-stub/);
    expect(html).not.toMatch(/THI ĐẤU|Thi đấu — trang chủ/);
  });

  test('bật tính năng: hiện nội dung; có tiêu đề và mô tả nếu truyền vào', () => {
    const html = render({ title: 'Bảng xếp hạng', subtitle: 'Theo trình độ' });
    expect(html).toMatch(/NOI-DUNG-GIAI/);
    expect(html).toMatch(/<h1[^>]*>Bảng xếp hạng<\/h1>/);
    expect(html).toMatch(/Theo trình độ/);
  });

  test('tính năng tắt: báo chưa bật, không hiện nội dung', () => {
    state.value = { enabled: false, loading: false };
    const html = render();
    expect(html).toMatch(/Tính năng thi đấu chưa được bật/);
    expect(html).not.toMatch(/NOI-DUNG-GIAI/);
  });

  test('đang kiểm tra: hiện thông báo đang tải, chưa hiện nội dung', () => {
    state.value = { enabled: true, loading: true };
    const html = render();
    expect(html).toMatch(/Đang kiểm tra tính năng thi đấu/);
    expect(html).not.toMatch(/NOI-DUNG-GIAI/);
  });

  test('dùng chân trang chung (liên kết và chỗ cho thanh tab dưới do SiteFooter lo, test ở components/site)', () => {
    const html = render();
    expect(html).toMatch(/data-site-footer-stub/);
    expect(html).not.toMatch(/Giải đấu &amp; giao lưu cầu lông của sân/);
    expect(html).toMatch(/<main[^>]*pb-28/);
  });
});
