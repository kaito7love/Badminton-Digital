import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BrandMark from './BrandMark';

// Logo thương hiệu: cây vợt (không còn là mũi tên lên). Nút "Scroll to top" ở trang chủ cố ý giữ mũi tên riêng, nên
// đoạn path mũi tên cũ không được quay lại trong thành phần logo dùng chung.
describe('BrandMark', () => {
  test('vẽ cây vợt: mặt vợt (elip) + dây + phần bọc cán xanh chanh', () => {
    const svg = renderToStaticMarkup(<BrandMark />);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('#CCFF00');
  });

  test('không còn mũi tên cũ của logo', () => {
    const svg = renderToStaticMarkup(<BrandMark />);
    expect(svg).not.toContain('M50 18 L68 45');
    expect(svg).not.toContain('<circle');
  });

  test('cỡ và màu do nơi gọi quyết định qua className; là hình trang trí nên ẩn khỏi trình đọc màn hình', () => {
    const svg = renderToStaticMarkup(<BrandMark className="w-6 h-6 text-emerald-400" />);
    expect(svg).toContain('class="w-6 h-6 text-emerald-400"');
    expect(svg).toContain('aria-hidden="true"');
  });
});
