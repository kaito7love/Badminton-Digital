import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';

const state = vi.hoisted(() => ({ value: { enabled: true, loading: false } }));
vi.mock('../../features/competition/context/CompetitionContext', () => ({ useCompetition: () => state.value }));

import SiteFooter, { SiteFooterView, FOOTER_TAGLINE } from './SiteFooter';
import { buildSiteNav } from './siteNav';

const view = (props) =>
  renderToStaticMarkup(
    <StaticRouter location="/">
      <SiteFooterView links={buildSiteNav({}).footerLinks} {...props} />
    </StaticRouter>
  );
const connected = (props) =>
  renderToStaticMarkup(
    <StaticRouter location="/">
      <SiteFooter {...props} />
    </StaticRouter>
  );
const hrefs = (html) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);

describe('SiteFooterView — chân trang chung (chuẩn là footer /thi-dau)', () => {
  test('một dòng bản quyền chung và các liên kết chính, không còn khối logo hay "NIKE KINETIC EDITION"', () => {
    const html = view();
    expect(html).toContain(FOOTER_TAGLINE);
    expect(hrefs(html)).toEqual([
      ['/', 'Trang chủ'],
      ['/dat-san', 'Đặt sân'],
      ['/shop', 'Cửa hàng'],
      ['/thi-dau', 'Thi đấu']
    ]);
    expect(html).not.toMatch(/NIKE KINETIC|BADMINTON <span|⚡/i);
  });

  test('"Đặt sân" dẫn tới trang Đặt sân, không phải lịch sử đặt (lỗi cũ của footer /thi-dau)', () => {
    expect(hrefs(view())).toContainEqual(['/dat-san', 'Đặt sân']);
    expect(view()).not.toContain('href="/my-bookings"');
  });

  test('bố cục như chuẩn: chừa chỗ cho thanh tab dưới trên điện thoại, cùng bề rộng và lề với header', () => {
    const html = view();
    expect(html).toMatch(/<footer[^>]*pb-24/);
    expect(html).toMatch(/max-w-7xl[^"]*px-5[^"]*sm:px-6/);
    expect(html).toMatch(/<nav aria-label="Liên kết chân trang"/);
  });

  test('clearBottomBar chừa chỗ cho thanh cố định của /dat-san (pb-56 thay pb-24), từ lg vẫn gọn', () => {
    const plain = view();
    expect(plain).toMatch(/<footer[^>]*pb-24/);
    expect(plain).not.toMatch(/pb-56/);
    const clear = view({ clearBottomBar: true });
    expect(clear).toMatch(/<footer[^>]*pb-56[^>]*lg:py-6/);
    expect(clear).not.toMatch(/pb-24/);
  });

  test("tone 'auto' có cặp sáng / tối; tone 'dark' luôn tối và không phụ thuộc lớp `dark` của <html>", () => {
    const auto = view({ tone: 'auto' });
    expect(auto).toMatch(/bg-white/);
    expect(auto).toMatch(/dark:bg-slate-950/);
    const dark = view({ tone: 'dark' });
    expect(dark).toMatch(/bg-slate-950/);
    expect(dark).not.toMatch(/dark:/);
    expect(dark).not.toMatch(/bg-white/);
  });
});

describe('SiteFooter — nối context', () => {
  test('dịch vụ thi đấu bật: có mục Thi đấu', () => {
    state.value = { enabled: true, loading: false };
    expect(hrefs(connected()).map((l) => l[1])).toEqual(['Trang chủ', 'Đặt sân', 'Cửa hàng', 'Thi đấu']);
  });

  test('dịch vụ thi đấu tắt: mục Thi đấu biến mất, không để liên kết chết', () => {
    state.value = { enabled: false, loading: false };
    expect(hrefs(connected()).map((l) => l[1])).toEqual(['Trang chủ', 'Đặt sân', 'Cửa hàng']);
    expect(connected()).not.toContain('/thi-dau');
  });
});
