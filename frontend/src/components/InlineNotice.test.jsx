import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InlineNotice from './InlineNotice';

describe('InlineNotice', () => {
  test('không có thông điệp thì không vẽ gì', () => {
    expect(renderToStaticMarkup(<InlineNotice message="" />)).toBe('');
    expect(renderToStaticMarkup(<InlineNotice message={null} />)).toBe('');
  });

  test('có thông điệp: role=alert, có nút đóng khi truyền onClose, đủ cả hai nửa class sáng/tối', () => {
    const html = renderToStaticMarkup(<InlineNotice message="Khung giờ này đã có người đặt" onClose={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Khung giờ này đã có người đặt');
    expect(html).toContain('aria-label="Đóng thông báo"');
    expect(html).toMatch(/text-rose-800[^"]*dark:text-rose-300/);
  });

  test('chữ HTML trong thông điệp bị escape, không thành thẻ', () => {
    const html = renderToStaticMarkup(<InlineNotice message="<img src=x onerror=alert(1)>" />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
