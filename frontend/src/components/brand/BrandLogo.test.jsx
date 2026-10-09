import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import BrandLogo, { BrandTile, BrandWordmark } from './BrandLogo';

const render = (el) => renderToStaticMarkup(<StaticRouter location="/thi-dau">{el}</StaticRouter>);
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

describe('BrandLogo — một kiểu cho cả ba header', () => {
  test('luôn ghi BADMINTON DIGITAL và luôn trỏ về trang chủ, kể cả khi đang ở khu Thi đấu', () => {
    const html = render(<BrandLogo />);
    expect(text(html)).toBe('BADMINTON DIGITAL');
    expect(html).toMatch(/href="\/"/);
    expect(html).not.toMatch(/THI ĐẤU|Thi đấu/);
  });

  test('ô logo 44 px, chữ 18 px (24 px từ sm) — cùng cỡ ở mọi nơi dùng', () => {
    const html = render(<BrandLogo />);
    expect(html).toMatch(/h-11 w-11/);
    expect(html).toMatch(/text-lg/);
    expect(html).toMatch(/sm:text-2xl/);
  });

  test('bản tự động có cặp màu sáng / tối; bản dark chỉ có màu tối', () => {
    const auto = render(<BrandWordmark />);
    expect(auto).toMatch(/text-slate-900 dark:text-white/);
    expect(auto).toMatch(/dark:bg-\[linear-gradient/);
    const dark = render(<BrandWordmark tone="dark" />);
    expect(dark).toMatch(/text-white/);
    expect(dark).not.toMatch(/dark:/);
  });

  test('ô logo có cây vợt', () => {
    expect(render(<BrandTile />)).toMatch(/<svg/);
  });

  test('bản sáng: nền ô trắng, vợt xanh rừng, cán xanh chanh đậm; bản tối giữ nền tối', () => {
    const auto = render(<BrandTile />);
    expect(auto).toMatch(/bg-white dark:bg-slate-950/);
    expect(auto).toMatch(/text-emerald-700 dark:text-emerald-400/);
    expect(auto).toMatch(/stroke-lime-600 dark:stroke-\[#CCFF00\]/);
    const dark = render(<BrandTile tone="dark" />);
    expect(dark).toMatch(/bg-slate-950/);
    expect(dark).not.toMatch(/bg-white|dark:/);
    expect(dark).toMatch(/stroke="#CCFF00"/);
  });
});
