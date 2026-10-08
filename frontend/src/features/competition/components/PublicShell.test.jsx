import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { NavItems } from './PublicShell';

// Thanh điều hướng của khu Thi đấu. Lỗi cũ: mục đầu tên "Trang chủ" nhưng trỏ về /thi-dau, nên người đang ở Thi đấu thấy
// "Trang chủ" sáng còn bấm vào lại không ra trang chủ thật.
const ACTIVE = 'bg-emerald-500/15';
const nav = (location, isCustomer = false) =>
  renderToStaticMarkup(<StaticRouter location={location}><NavItems isCustomer={isCustomer} /></StaticRouter>);

// Lấy thẻ <a> theo nhãn hiển thị: { href, active }
const link = (html, label) => {
  const m = new RegExp(`<a ([^>]*)>${label}</a>`).exec(html);
  if (!m) return null;
  return { href: /href="([^"]*)"/.exec(m[1])[1], active: m[1].includes(ACTIVE) };
};

describe('NavItems — khu Thi đấu', () => {
  test('"Trang chủ" trỏ về trang chủ của cả site và KHÔNG sáng, kể cả khi đang ở /thi-dau', () => {
    for (const where of ['/thi-dau', '/thi-dau/giai/abc', '/thi-dau/giao-luu/xyz', '/rankings']) {
      expect(link(nav(where), 'Trang chủ')).toEqual({ href: '/', active: false });
    }
  });

  test('ở trang tổng quan /thi-dau thì mục "Thi đấu" sáng, không mục nào khác', () => {
    const html = nav('/thi-dau');
    expect(link(html, 'Thi đấu')).toEqual({ href: '/thi-dau', active: true });
    for (const other of ['Trang chủ', 'Giải đấu', 'Giao lưu', 'Xếp hạng']) expect(link(html, other).active).toBe(false);
  });

  test('trang chi tiết giải sáng "Giải đấu", chi tiết buổi sáng "Giao lưu"; "Thi đấu" nhường lại', () => {
    const giai = nav('/thi-dau/giai/abc');
    expect(link(giai, 'Giải đấu').active).toBe(true);
    expect(link(giai, 'Giao lưu').active).toBe(false);
    expect(link(giai, 'Thi đấu').active).toBe(false);

    const gl = nav('/thi-dau/giao-luu/xyz');
    expect(link(gl, 'Giao lưu').active).toBe(true);
    expect(link(gl, 'Giải đấu').active).toBe(false);
  });

  test('/rankings sáng "Xếp hạng"', () => {
    expect(link(nav('/rankings'), 'Xếp hạng')).toEqual({ href: '/rankings', active: true });
  });

  test('"Giải của tôi" chỉ hiện với khách hàng', () => {
    expect(nav('/thi-dau', false)).not.toContain('Giải của tôi');
    expect(link(nav('/my-tournaments', true), 'Giải của tôi')).toEqual({ href: '/my-tournaments', active: true });
  });
});
