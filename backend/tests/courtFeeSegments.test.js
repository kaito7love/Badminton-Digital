const { calculateCourtFee, calculateSessionCourtFee } = require('../src/utils/priceCalculator');
const PaymentService = require('../src/services/PaymentService');

const VN = { peakStartHour: 17, peakEndHour: 22, timezone: 'Asia/Ho_Chi_Minh' };
// Giờ Việt Nam (UTC+7) của ngày 23/07/2026 -> mốc UTC.
const vn = (hhmm, day = 23) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 6, day, h - 7, m));
};

const regular = { peakPricePerHour: 100000, offpeakPricePerHour: 60000 };
const mid = { peakPricePerHour: 140000, offpeakPricePerHour: 100000 };
const vip = { peakPricePerHour: 250000, offpeakPricePerHour: 150000 };

/** Mô phỏng đúng việc CourtService.transferCourt ghi vào phiên. */
const transfer = (session, fromCourt, at) => {
  const segment = calculateCourtFee(session.billedFrom || session.startTime, at, fromCourt.peakPricePerHour, fromCourt.offpeakPricePerHour, VN.peakStartHour, VN.peakEndHour, VN.timezone);
  return {
    ...session,
    billedFrom: at,
    accruedCourtFee: (Math.round((Number(session.accruedCourtFee || 0) + segment.rawFee) * 100) / 100).toFixed(2)
  };
};

describe('calculateSessionCourtFee — tiền sân theo từng đoạn khi chuyển sân', () => {
  test('phiên chưa chuyển sân tính như cũ từ giờ mở sân', () => {
    const session = { startTime: vn('15:00'), billedFrom: null, accruedCourtFee: '0.00' };
    const direct = calculateCourtFee(vn('15:00'), vn('18:00'), regular.peakPricePerHour, regular.offpeakPricePerHour, 17, 22, VN.timezone);

    expect(calculateSessionCourtFee(session, regular, vn('18:00'), VN)).toEqual(direct);
  });

  test('chơi 17–19h sân thường rồi sang VIP tới 20h: mỗi đoạn theo giá sân của đoạn đó', () => {
    // 2h × 100k + 1h × 250k = 450.000đ. Trước đây cả 3 giờ theo giá VIP = 750.000đ.
    const session = transfer({ startTime: vn('17:00'), billedFrom: null, accruedCourtFee: '0.00' }, regular, vn('19:00'));
    const fee = calculateSessionCourtFee(session, vip, vn('20:00'), VN);

    expect(session.accruedCourtFee).toBe('200000.00');
    expect(fee.courtFee).toBe(450000);
    expect(fee.durationSeconds).toBe(3 * 3600);
  });

  test('chuyển hai lần qua mốc cao điểm vẫn cộng đúng từng đoạn', () => {
    // 15:00–16:30 sân thường thấp điểm 90.000 + 16:30–17:30 sân giữa (50.000 thấp + 70.000 cao)
    // + 17:30–18:00 VIP cao điểm 125.000 = 335.000đ.
    let session = { startTime: vn('15:00'), billedFrom: null, accruedCourtFee: '0.00' };
    session = transfer(session, regular, vn('16:30'));
    session = transfer(session, mid, vn('17:30'));

    expect(calculateSessionCourtFee(session, vip, vn('18:00'), VN).courtFee).toBe(335000);
  });

  test('chỉ làm tròn nghìn một lần ở cuối, không làm tròn từng đoạn rồi cộng', () => {
    // Ba đoạn 10 phút × 100k/giờ = 16.666,67đ mỗi đoạn. Làm tròn từng đoạn ra 51.000đ; đúng là 50.000đ.
    const court = { peakPricePerHour: 100000, offpeakPricePerHour: 100000 };
    let session = { startTime: vn('09:00'), billedFrom: null, accruedCourtFee: '0.00' };
    session = transfer(session, court, vn('09:10'));
    session = transfer(session, court, vn('09:20'));

    expect(calculateSessionCourtFee(session, court, vn('09:30'), VN).courtFee).toBe(50000);
  });
});

describe('PaymentService.resolveCheckoutEndTime — chốt giờ kết thúc theo số đã xem trước', () => {
  const now = vn('18:00');
  const session = { startTime: vn('16:00'), billedFrom: null };
  const statusOf = (fn) => {
    try {
      fn();
      return null;
    } catch (error) {
      return error.statusCode;
    }
  };

  test('không gửi endTime thì là bây giờ', () => {
    expect(PaymentService.resolveCheckoutEndTime(session, null, now)).toBe(now);
  });

  test('endTime của bản xem trước trong vòng 10 phút thì dùng đúng mốc đó', () => {
    const preview = new Date(now.getTime() - 9 * 60 * 1000);
    expect(PaymentService.resolveCheckoutEndTime(session, preview.toISOString(), now).getTime()).toBe(preview.getTime());
  });

  test('cũ hơn 10 phút, ở tương lai, trước giờ mở sân hoặc không phải ngày giờ thì 400', () => {
    expect(statusOf(() => PaymentService.resolveCheckoutEndTime(session, new Date(now.getTime() - 11 * 60 * 1000).toISOString(), now))).toBe(400);
    expect(statusOf(() => PaymentService.resolveCheckoutEndTime(session, new Date(now.getTime() + 60 * 1000).toISOString(), now))).toBe(400);
    expect(statusOf(() => PaymentService.resolveCheckoutEndTime({ startTime: now, billedFrom: null }, vn('17:59').toISOString(), now))).toBe(400);
    expect(statusOf(() => PaymentService.resolveCheckoutEndTime(session, 'khong-phai-ngay', now))).toBe(400);
  });

  test('phiên vừa chuyển sân sau lúc xem trước thì phải tính lại', () => {
    const moved = { startTime: vn('16:00'), billedFrom: vn('17:58') };
    expect(statusOf(() => PaymentService.resolveCheckoutEndTime(moved, vn('17:55').toISOString(), now))).toBe(400);
  });
});
