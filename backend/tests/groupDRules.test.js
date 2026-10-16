// Nhóm D (kế hoạch 37): R15 (giới hạn 3 giờ cho khách ở server) và R14a (ghim GitHub Actions theo SHA).
const fs = require('fs');
const path = require('path');

const BookingService = require('../src/services/BookingService');
const { CUSTOMER_MAX_BOOKING_HOURS } = require('../src/utils/daySlots');

describe('R15 — BookingService.durationViolation', () => {
  const v = (startTime, endTime, maxHours) => BookingService.durationViolation({ startTime, endTime, maxHours });

  test('giới hạn mặc định là 3 giờ, khớp MAX_BOOKING_HOURS của trang Đặt sân', () => {
    expect(CUSTOMER_MAX_BOOKING_HOURS).toBe(3);
    const front = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Booking', 'lib', 'daySelection.js'), 'utf8');
    expect(front).toMatch(/MAX_BOOKING_HOURS\s*=\s*3\b/);
  });

  test.each([['08:00', '09:00'], ['08:00', '10:30'], ['17:00', '20:00'], ['05:00', '07:59:00'.slice(0, 5)]])(
    '%s–%s hợp lệ', (s, e) => expect(v(s, e)).toBeNull()
  );

  test.each([['08:00', '11:01'], ['08:00', '14:00'], ['05:00', '23:00']])('%s–%s vượt giới hạn', (s, e) => {
    expect(v(s, e)).toMatch(/tối đa 3 giờ/);
  });

  test('maxHours truyền vào được tôn trọng', () => {
    expect(v('08:00', '10:00', 1)).toMatch(/tối đa 1 giờ/);
    expect(v('08:00', '10:00', 2)).toBeNull();
  });

  test('chỉ vai customer bị áp: createBooking gọi kiểm tra trong nhánh customer', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'BookingService.js'), 'utf8');
    const createStart = src.indexOf('static async createBooking');
    const customerBranch = src.indexOf('context.actor?.role?.name === "customer"', createStart);
    const call = src.indexOf('BookingService.durationViolation(', createStart);
    expect(customerBranch).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(customerBranch);
    // và không có lời gọi nào trong updateBooking (PUT chỉ dành cho nhân viên)
    const updateStart = src.indexOf('static async updateBooking');
    expect(src.indexOf('BookingService.durationViolation(', updateStart)).toBe(-1);
  });
});

describe('R14a — GitHub Actions ghim theo commit SHA', () => {
  const dir = path.join(__dirname, '..', '..', '.github', 'workflows');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];

  test('có file workflow để kiểm', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)('%s: mọi `uses:` ngoài repo đều trỏ tới SHA 40 ký tự', (file) => {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/);
    const loose = [];
    lines.forEach((line, i) => {
      const m = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/);
      if (!m) return;
      const ref = m[1];
      if (ref.startsWith('./')) return; // action nội bộ
      if (!/@[0-9a-f]{40}$/.test(ref)) loose.push(`${file}:${i + 1} ${ref}`);
    });
    expect(loose).toEqual([]);
  });
});
