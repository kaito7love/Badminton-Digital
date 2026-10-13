const {
  DEFAULT_OPERATING_HOURS,
  normalizeOperatingHours,
  operatingHoursViolation
} = require('../src/utils/operatingHours');
const BookingService = require('../src/services/BookingService');

/**
 * `operating_hours.open`/`close` là khung giờ DUY NHẤT nhận đặt sân. Hai trường
 * này nằm trong DB từ seeder đầu tiên nhưng trước đây không ai đọc, nên booking
 * nhận mọi giờ trong ngày — kể cả 02:00 sáng.
 */
describe('normalizeOperatingHours — đọc setting đã lưu', () => {
  test('dạng seeder ghi ({ open, close, peak_* }) đọc đúng', () => {
    expect(normalizeOperatingHours({ open: '05:00', close: '23:00', peak_start: '17:00', peak_end: '21:00' }))
      .toEqual({ open: '05:00', close: '23:00', openMinutes: 300, closeMinutes: 1380 });
  });

  test('nhận HH:mm:ss, trả về HH:mm', () => {
    expect(normalizeOperatingHours({ open: '06:30:00', close: '22:15:00' }))
      .toEqual({ open: '06:30', close: '22:15', openMinutes: 390, closeMinutes: 1335 });
  });

  test.each([
    ['thiếu hẳn setting', null],
    ['undefined', undefined],
    ['object rỗng', {}],
    ['chuỗi rác', 'mo cua ca ngay'],
    ['giờ sai định dạng', { open: '5h', close: '11h dem' }],
    ['giờ ngoài 00:00–23:59', { open: '-01:00', close: '25:00' }],
    ['số thay vì chuỗi', { open: 5, close: 23 }],
    ['thiếu close', { open: '05:00' }],
    ['đóng trước khi mở', { open: '22:00', close: '06:00' }],
    ['đóng đúng lúc mở', { open: '08:00', close: '08:00' }]
  ])('%s → rơi về mặc định %s, KHÔNG trả khung rỗng', (_label, stored) => {
    const hours = normalizeOperatingHours(stored);
    expect({ open: hours.open, close: hours.close }).toEqual({ ...DEFAULT_OPERATING_HOURS });
    // Khung rỗng sẽ chặn sạch mọi lịch đặt chỉ vì một ô setting gõ sai.
    expect(hours.closeMinutes).toBeGreaterThan(hours.openMinutes);
  });

  test('mặc định là 05:00–23:00', () => {
    expect(DEFAULT_OPERATING_HOURS).toEqual({ open: '05:00', close: '23:00' });
  });

  test('dạng mảng theo ngày → lấy khung rộng nhất', () => {
    // Dạng trang Cài đặt đang hiển thị. Chặn oan giờ quán thật sự có mở là mất
    // khách, nên lấy rộng nhất chứ không lấy phần giao.
    const hours = normalizeOperatingHours([
      { day: 'Monday - Friday', open: '06:00', close: '22:00' },
      { day: 'Saturday - Sunday', open: '05:00', close: '23:00' }
    ]);
    expect({ open: hours.open, close: hours.close }).toEqual({ open: '05:00', close: '23:00' });
  });

  test('mảng có phần tử rác thì bỏ phần tử đó, không bỏ cả mảng', () => {
    const hours = normalizeOperatingHours([{ day: 'x' }, { open: '07:00', close: '21:00' }]);
    expect({ open: hours.open, close: hours.close }).toEqual({ open: '07:00', close: '21:00' });
  });
});

describe('operatingHoursViolation — lịch phải nằm trọn trong giờ mở cửa', () => {
  const hours = { open: '05:00', close: '23:00' };
  const check = (startTime, endTime, h = hours) => operatingHoursViolation({ startTime, endTime, hours: h });

  test('nằm trọn trong khung → hợp lệ', () => {
    expect(check('05:00', '07:00')).toBeNull();
    expect(check('21:00', '23:00')).toBeNull();
    expect(check('12:00', '14:00')).toBeNull();
  });

  test('biên: đúng giờ mở và đúng giờ đóng vẫn hợp lệ', () => {
    expect(check('05:00', '23:00')).toBeNull();
  });

  test('bắt đầu sớm hơn giờ mở → chặn', () => {
    expect(check('04:00', '06:00')).toContain('05:00–23:00');
    expect(check('02:00', '04:00')).not.toBeNull();
    expect(check('00:00', '01:00')).not.toBeNull();
  });

  test('kết thúc muộn hơn giờ đóng → chặn', () => {
    // Đúng ca "không thể đặt quá 23h".
    expect(check('21:00', '23:30')).not.toBeNull();
    expect(check('22:00', '23:01')).not.toBeNull();
    expect(check('23:00', '23:59')).not.toBeNull();
  });

  test('thông điệp nêu rõ khung giờ nhận đặt, không chỉ nói "không hợp lệ"', () => {
    expect(check('03:00', '04:00')).toBe('Quán chỉ nhận đặt sân trong khung 05:00–23:00');
    expect(check('03:00', '04:00', { open: '06:00', close: '22:00' }))
      .toBe('Quán chỉ nhận đặt sân trong khung 06:00–22:00');
  });

  test('đổi setting là đổi luật, không phải sửa code', () => {
    const hepHon = { open: '08:00', close: '20:00' };
    expect(check('06:00', '08:00', hepHon)).not.toBeNull();
    expect(check('19:00', '21:00', hepHon)).not.toBeNull();
    expect(check('08:00', '10:00', hepHon)).toBeNull();
  });

  test('setting rác thì áp mặc định 05:00–23:00, vẫn chặn đúng', () => {
    expect(check('04:00', '06:00', null)).toContain('05:00–23:00');
    expect(check('21:00', '23:30', 'rác')).toContain('05:00–23:00');
    expect(check('06:00', '08:00', {})).toBeNull();
  });

  test('giờ không đọc được thì bỏ qua — để validator ở route báo lỗi định dạng', () => {
    expect(check('xx:yy', '10:00')).toBeNull();
    expect(check('10:00', null)).toBeNull();
    expect(check(undefined, undefined)).toBeNull();
  });

  test('nhận lại chính object đã normalize (gọi hai lần không đổi kết quả)', () => {
    const daChuan = normalizeOperatingHours({ open: '06:00', close: '22:00' });
    expect(check('05:00', '07:00', daChuan)).not.toBeNull();
    expect(check('06:00', '08:00', daChuan)).toBeNull();
  });
});

describe('UNAVAILABLE có lý do ngoài giờ mở cửa', () => {
  // Danh sách lý do đầy đủ do bookingPastSlot.test.js khẳng định — ở đây chỉ
  // kiểm phần thuộc về giờ mở cửa, để thêm lý do mới không làm vỡ hai file.
  test('OUTSIDE_OPERATING_HOURS có mặt và nói đúng nguyên nhân', () => {
    expect(BookingService.UNAVAILABLE.OUTSIDE_OPERATING_HOURS).toMatch(/giờ mở cửa/);
  });
});
