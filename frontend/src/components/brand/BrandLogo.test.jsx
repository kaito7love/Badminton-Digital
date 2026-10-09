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

  test('ô logo 40 px, chữ 16 px (20 px từ sm) — cùng cỡ ở mọi nơi dùng', () => {
    const html = render(<BrandLogo />);
    expect(html).toMatch(/h-10 w-10/);
    expect(html).toMatch(/text-base/);
    expect(html).toMatch(/sm:text-xl/);
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
});
