import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import BookingCta, { lowestOffpeakPrice } from './BookingCta';

const render = (props) =>
  renderToStaticMarkup(
    <StaticRouter location="/">
      <BookingCta operatingHours={{ open: '05:00', close: '23:00' }} fromPrice={60000} error={null} {...props} />
    </StaticRouter>
  );

describe('lowestOffpeakPrice', () => {
  test('lấy giá giờ thường thấp nhất trong các sân đang nhận đặt', () => {
    expect(
      lowestOffpeakPrice([
        { bookable: true, offpeakPricePerHour: 80000 },
        { bookable: true, offpeakPricePerHour: 60000 },
        { bookable: true, offpeakPricePerHour: 100000 }
      ])
    ).toBe(60000);
  });

  test('bỏ qua sân đang bảo trì — không hứa giá của sân không đặt được', () => {
    expect(
      lowestOffpeakPrice([
        { bookable: false, offpeakPricePerHour: 30000 },
        { bookable: true, offpeakPricePerHour: 70000 }
      ])
    ).toBe(70000);
  });

  test('chưa có sân nào (đang tải, lỗi, tất cả bảo trì) thì null', () => {
    expect(lowestOffpeakPrice([])).toBeNull();
    expect(lowestOffpeakPrice(undefined)).toBeNull();
    expect(lowestOffpeakPrice([{ bookable: false, offpeakPricePerHour: 60000 }])).toBeNull();
    expect(lowestOffpeakPrice([{ bookable: true, offpeakPricePerHour: 'abc' }])).toBeNull();
  });
});

describe('BookingCta — thẻ dẫn sang trang Đặt sân', () => {
  test('một nút duy nhất, là liên kết tới /dat-san', () => {
    const html = render();
    expect(html).toMatch(/<a [^>]*href="\/dat-san"[^>]*>ĐẶT SÂN/);
    expect((html.match(/<a /g) || []).length).toBe(1);
    // Không còn form, ô nhập hay nút gửi của ô đặt nhanh cũ.
    expect(html).not.toMatch(/<form|<input|<select|type="submit"/);
  });

  test('hiện giờ nhận đặt và giá từ', () => {
    const html = render();
    expect(html).toContain('Nhận đặt sân 05:00–23:00 hằng ngày');
    expect(html).toContain('từ 60.000đ/giờ');
  });

  test('chưa biết giá thì hiện gạch ngang, không hiện 0đ', () => {
    const html = render({ fromPrice: null });
    expect(html).not.toContain('0đ');
    expect(html).toMatch(/>—</);
  });

  test('lỗi tải danh mục được hiện ra, không im lặng', () => {
    expect(render({ error: 'Chưa tải được danh sách sân.' })).toContain('Chưa tải được danh sách sân.');
  });
});
