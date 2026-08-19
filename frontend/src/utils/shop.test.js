import { describe, test, expect } from 'vitest';
import { formatVnd, lookFor, priceLabel, uniqueValues, variantLabel } from './shop';

describe('formatVnd', () => {
  test('định dạng số theo kiểu Việt Nam kèm ký hiệu đ', () => {
    expect(formatVnd(250000)).toBe('250.000đ');
  });

  test('giá trị thiếu thì hiện 0đ, không phải NaN', () => {
    expect(formatVnd(null)).toBe('0đ');
    expect(formatVnd(undefined)).toBe('0đ');
  });
});

describe('lookFor', () => {
  test('mẫu hẹp thắng mẫu rộng: "túi đựng vợt" ra cái túi, không phải cây vợt', () => {
    expect(lookFor('Túi Đựng Vợt Yonex 6 Ngăn').icon).toBe('🎒');
  });

  test('"quấn cán vợt" ra cái quấn, không phải cây vợt', () => {
    expect(lookFor('Quấn Cán Vợt Yonex').icon).toBe('🧤');
  });

  test('tên đúng nghĩa vẫn nhận icon vợt', () => {
    expect(lookFor('Vợt Yonex Astrox 100ZZ').icon).toBe('🏸');
  });

  test('tên không khớp gì thì rơi xuống danh mục kế tiếp trong danh sách tham số', () => {
    expect(lookFor('Sản phẩm lạ', 'Áo thi đấu').icon).toBe('👕');
  });

  test('không khớp gì cả thì dùng icon mặc định', () => {
    expect(lookFor('Sản phẩm hoàn toàn lạ').icon).toBe('🛍️');
  });

  test('nhận chuỗi rỗng/undefined mà không văng lỗi', () => {
    expect(lookFor().icon).toBe('🛍️');
    expect(lookFor(undefined, null, '').icon).toBe('🛍️');
  });
});

describe('priceLabel', () => {
  test('chưa có biến thể nào thì mời liên hệ quầy', () => {
    expect(priceLabel({ priceFrom: null, priceTo: null })).toBe('Liên hệ quầy');
    expect(priceLabel({})).toBe('Liên hệ quầy');
  });

  test('mọi biến thể cùng giá thì hiện một con số', () => {
    expect(priceLabel({ priceFrom: 250000, priceTo: 250000 })).toBe('250.000đ');
  });

  test('giá khác nhau thì hiện khoảng giá', () => {
    expect(priceLabel({ priceFrom: 250000, priceTo: 280000 })).toBe('250.000đ – 280.000đ');
  });

  test('priceFrom = 0 vẫn là một mức giá thật, không phải "chưa có giá"', () => {
    expect(priceLabel({ priceFrom: 0, priceTo: 0 })).toBe('0đ');
  });
});

describe('variantLabel', () => {
  test('ghép size và màu bằng dấu chấm giữa', () => {
    expect(variantLabel({ size: 'M', color: 'Đỏ' })).toBe('M • Đỏ');
  });

  test('chỉ có một trong hai thì không để dư dấu ngăn cách', () => {
    expect(variantLabel({ size: 'M', color: null })).toBe('M');
    expect(variantLabel({ size: null, color: 'Đỏ' })).toBe('Đỏ');
  });

  test('không có size lẫn màu thì gọi là mẫu tiêu chuẩn', () => {
    expect(variantLabel({})).toBe('Mẫu tiêu chuẩn');
    expect(variantLabel(undefined)).toBe('Mẫu tiêu chuẩn');
  });
});

describe('uniqueValues', () => {
  test('loại trùng và giữ đúng thứ tự xuất hiện lần đầu', () => {
    const variants = [{ size: 'M' }, { size: 'L' }, { size: 'M' }];
    expect(uniqueValues(variants, 'size')).toEqual(['M', 'L']);
  });

  test('bỏ qua giá trị rỗng/null (biến thể không có size, ví dụ vợt)', () => {
    const variants = [{ color: 'Đen' }, { color: null }, { color: '' }];
    expect(uniqueValues(variants, 'color')).toEqual(['Đen']);
  });

  test('mảng rỗng hoặc thiếu thì trả về mảng rỗng, không văng lỗi', () => {
    expect(uniqueValues([], 'size')).toEqual([]);
    expect(uniqueValues(undefined, 'size')).toEqual([]);
  });
});
