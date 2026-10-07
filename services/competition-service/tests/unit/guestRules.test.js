const { normalizePhone, cleanName, validateGuest, MAX_NEW_GUESTS_PER_DAY, GUEST_SOURCE } = require('../../src/modules/player/domain/guest');

// Luật đồng đội chưa có tài khoản khi đăng ký online (plan 27, p1): chuẩn hoá SĐT / tên và kiểm đầu vào — thuần, không DB.

const LEVELS = ['beginner', 'weak', 'tb_minus', 'tb', 'tb_plus', 'kha'];

describe('normalizePhone — SĐT di động Việt Nam → 0xxxxxxxxx', () => {
  test.each([
    ['0912345678', '0912345678'],
    ['0912 345 678', '0912345678'],
    ['091.234.5678', '0912345678'],
    ['091-234-5678', '0912345678'],
    ['+84912345678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
    ['84912345678', '0912345678'],
    ['(+84) 912-345-678', '0912345678'],
    ['  0912345678  ', '0912345678']
  ])('%j → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  test.each([['12345'], ['09123456789'], ['091234567'], ['abcdefghij'], [''], [null], [undefined], ['+1 415 555 0100'], ['0912-345-67x'], ['+840912345678']])(
    '%j → không hợp lệ (null)',
    (raw) => {
      expect(normalizePhone(raw)).toBeNull();
    }
  );

  test('cùng một số viết kiểu nào cũng ra cùng một khoá — dùng để nhận ra cùng một người ở lần đăng ký sau', () => {
    const keys = new Set(['0912345678', '+84 912 345 678', '091 234 5678', '84912345678'].map(normalizePhone));
    expect(keys.size).toBe(1);
  });
});

describe('cleanName', () => {
  test('gom khoảng trắng, bỏ khoảng trắng đầu / cuối', () => {
    expect(cleanName('  Lê   Văn \t Bình ')).toBe('Lê Văn Bình');
    expect(cleanName(null)).toBe('');
  });
});

describe('validateGuest', () => {
  const good = { name: '  Lê  Văn Bình ', phone: '0912 345 678', gender: 'male', level: 'tb' };

  test('hợp lệ → dạng chuẩn (tên gọn, SĐT 10 số, giới tính, nhãn)', () => {
    expect(validateGuest(good, LEVELS)).toEqual({ displayName: 'Lê Văn Bình', contactPhone: '0912345678', gender: 'male', level: 'tb' });
  });

  test.each([
    ["Nguyễn Thị Ánh Tuyết", true],
    ["Võ Thị Sáu", true],
    ["O'Brien", true],
    ['Trần-Lê Anh', true],
    ['An', true],
    ['A', false],
    ['', false],
    ['1234', false],
    ['Nguyễn <script>', false],
    ['Tên.Với@Ký*Tự', false],
    ['X'.repeat(101), false]
  ])('tên %j hợp lệ = %s', (name, valid) => {
    const call = () => validateGuest({ ...good, name }, LEVELS);
    if (valid) expect(call).not.toThrow();
    else expect(call).toThrow(/Thông tin đồng đội chưa đúng/);
  });

  test('sai nhiều chỗ → INVALID_GUEST (422) liệt kê đủ từng trường', () => {
    let error;
    try {
      validateGuest({ name: 'A', phone: '123', gender: 'other', level: 'pro' }, LEVELS);
    } catch (err) {
      error = err;
    }
    expect([error.code, error.status]).toEqual(['INVALID_GUEST', 422]);
    expect(error.errors.map((e) => e.field)).toEqual(['guest.name', 'guest.phone', 'guest.gender', 'guest.level']);
  });

  test('thiếu cả khối guest → vẫn là lỗi dữ liệu, không phải lỗi hệ thống', () => {
    expect(() => validateGuest(undefined, LEVELS)).toThrow(/Thông tin đồng đội chưa đúng/);
    expect(() => validateGuest(null, LEVELS)).toThrow(/Thông tin đồng đội chưa đúng/);
  });

  test('mức trình phải thuộc đúng danh sách cho phép (sáu nhãn chấm nhanh)', () => {
    for (const level of LEVELS) expect(validateGuest({ ...good, level }, LEVELS).level).toBe(level);
    expect(() => validateGuest({ ...good, level: 'tb ' }, LEVELS)).toThrow();
    expect(() => validateGuest({ ...good, level: 'pro' }, LEVELS)).toThrow();
  });
});

describe('hằng số', () => {
  test('giới hạn hồ sơ khách mới mỗi người mỗi ngày và nhãn nguồn', () => {
    expect(MAX_NEW_GUESTS_PER_DAY).toBe(5);
    expect(GUEST_SOURCE).toBe('online_guest');
  });
});
