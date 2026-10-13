import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { MyRatingCardView } from './MyRatingCard';
import { ratingSummary } from '../lib/customer';

const render = (player) => renderToStaticMarkup(<StaticRouter location="/account"><MyRatingCardView summary={ratingSummary(player)} /></StaticRouter>);
const rated = { ratings: { singles: { rating: 3.11, level: 'TB', ratedMatches: 3, provisional: true }, doubles: { rating: 3.46, level: 'TB', ratedMatches: 0, provisional: false } } };

describe('MyRatingCardView — thẻ ở trang Tài khoản', () => {
  test('chưa chấm trình: mời tự chấm, trỏ sang trang chấm, không có điểm và không có "Xem chi tiết"', () => {
    const html = render({ ratings: { singles: null, doubles: null } });
    expect(html).toMatch(/Bạn chưa chấm trình/);
    expect(html).toMatch(/<a [^>]*href="\/my-rating\/assess"[^>]*>Tự chấm trình<\/a>/);
    expect(html).not.toMatch(/Xem chi tiết/);
  });

  test('đã chấm: chỉ hiện điểm Đơn và Đôi, chi tiết dẫn sang /my-rating', () => {
    const html = render(rated);
    expect(html).toMatch(/Đơn/);
    expect(html).toMatch(/3\.11/);
    expect(html).toMatch(/Đôi/);
    expect(html).toMatch(/3\.46/);
    expect(html).toMatch(/<a [^>]*href="\/my-rating"[^>]*>\s*Xem chi tiết/);
    expect(html).not.toMatch(/Tự chấm trình/);
  });

  test('ghi rõ số trận tính điểm và tạm tính', () => {
    const html = render(rated);
    expect(html).toMatch(/3 trận tính điểm · tạm tính/);
    expect(html).toMatch(/Chưa có trận tính điểm/);
  });
});
