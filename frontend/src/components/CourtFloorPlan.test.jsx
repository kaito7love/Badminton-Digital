import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CourtFloorPlan from './CourtFloorPlan';

// Dựng bằng react-dom/server (repo không dùng jsdom): kiểm cấu trúc, trạng thái, và hai bảng lớp
// ("dark" cho Trang chủ — không đổi so với trước; "auto" cho /dat-san — có cặp sáng / tối).
const layout = {
  canvas: { width: 800, height: 500 },
  zones: [
    { x: 10, y: 300, w: 200, h: 80, cls: 'parking', label: 'BÃI XE KHÁCH' },
    { x: 300, y: 300, w: 200, h: 80, cls: 'khong-co-loai-nay', label: 'KHU KHÁC' }
  ],
  courts: [
    { courtName: 'Sân số 1', x: 20, y: 20 },
    { courtName: 'Sân số 2', x: 220, y: 20 },
    { courtName: 'Sân đã đổi tên', x: 420, y: 20 }
  ]
};
const courts = [
  { id: 1, name: 'Sân số 1', bookable: true, offpeakPricePerHour: 65000 },
  { id: 2, name: 'Sân số 2', bookable: false, offpeakPricePerHour: 65000 }
];
const render = (props = {}) => renderToStaticMarkup(<CourtFloorPlan layout={layout} courts={courts} {...props} />);
const buttons = (html) => html.match(/<button[^>]*>/g) || [];
const classLiterals = (html) => [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);

describe('CourtFloorPlan', () => {
  test('không có sơ đồ thì không vẽ gì', () => {
    expect(renderToStaticMarkup(<CourtFloorPlan layout={null} courts={courts} />)).toBe('');
  });

  test('chỉ vẽ sân khớp tên với sân thật, kèm giá và trạng thái; tên không khớp bị bỏ', () => {
    const html = render();
    expect(buttons(html)).toHaveLength(2);
    expect(html).toContain('Sân số 1');
    expect(html).toContain('65.000đ/giờ');
    expect(html).toContain('Sẵn sàng');
    expect(html).toContain('Bảo trì');
    expect(html).not.toContain('Sân đã đổi tên');
    expect(html).toContain('BÃI XE KHÁCH');
  });

  test('sân bảo trì không bấm được, sân sẵn sàng bấm được', () => {
    const [first, second] = buttons(render());
    expect(first).not.toContain('disabled');
    expect(second).toContain('disabled');
  });

  test('khu vực có loại lạ vẫn vẽ (dùng kiểu "custom")', () => {
    expect(render()).toContain('KHU KHÁC');
  });
});

describe('CourtFloorPlan — hai bảng lớp', () => {
  test('mặc định là "dark" (Trang chủ): luôn tối, không phụ thuộc lớp dark của <html>', () => {
    const html = render();
    expect(html).toContain('nike-card ');
    expect(html).toContain('bg-slate-950/60');
    expect(html).toContain('text-white');
    expect(html).not.toMatch(/dark:/);
  });

  test('"auto" (trang Đặt sân): thẻ tĩnh, mọi màu chữ / nền tối đều kèm cặp sáng', () => {
    const html = render({ tone: 'auto' });
    expect(html).toContain('nike-card-static');
    expect(html).toMatch(/dark:/);
    const offenders = [];
    for (const literal of classLiterals(html)) {
      if (/(^|\s)text-white(\s|$)/.test(literal)) offenders.push(literal);
      if (/(^|\s)bg-slate-950(\/\d+)?(\s|$)/.test(literal)) offenders.push(literal);
      // chữ tên / giá sân phải có biến thể sáng riêng
      if (/(^|\s)text-emerald-300(\s|$)/.test(literal)) offenders.push(literal);
    }
    expect(offenders).toEqual([]);
  });

  test('tone lạ rơi về "dark"', () => {
    expect(render({ tone: 'khong-co' })).toBe(render());
  });
});
