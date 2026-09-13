const { calculateCourtFee, calculateInvoiceTotals } = require('../src/utils/priceCalculator');

describe('Price Calculator Utility Unit Tests', () => {
  test('should calculate off-peak court fee accurately', () => {
    const startTime = new Date('2026-07-23T08:00:00Z');
    const endTime = new Date('2026-07-23T09:30:00Z'); // 1.5 hours
    const peakRate = 120000;
    const offpeakRate = 80000;

    const result = calculateCourtFee(startTime, endTime, peakRate, offpeakRate);
    expect(result.durationSeconds).toBe(5400); // 90 minutes
    expect(result.courtFee).toBe(120000); // 1.5 * 80000 = 120,000
  });

  // Khung giờ cao điểm là giờ treo tường TẠI CHI NHÁNH. Trước đây hàm đọc
  // `getHours()` (giờ máy chủ) nên chỉ đúng khi server tình cờ cùng múi giờ
  // với chi nhánh — dời server hoặc mở chi nhánh khác múi giờ là tính sai
  // tiền khách. Các ca dưới đây chốt lại hành vi đúng.
  describe('khung giờ cao điểm tính theo múi giờ chi nhánh', () => {
    // 11:00–12:00 UTC = 18:00–19:00 giờ VN (cao điểm) = 07:00–08:00 giờ New
    // York mùa hè (thấp điểm). Cùng một mốc thời gian tuyệt đối.
    const start = new Date('2026-07-23T11:00:00Z');
    const end = new Date('2026-07-23T12:00:00Z');
    const peakRate = 120000;
    const offpeakRate = 80000;

    test('chi nhánh Việt Nam: 18:00 là cao điểm', () => {
      const r = calculateCourtFee(start, end, peakRate, offpeakRate, 17, 22, 'Asia/Ho_Chi_Minh');
      expect(r.courtFee).toBe(120000);
    });

    test('chi nhánh New York: cùng mốc đó mới 07:00 sáng nên là thấp điểm', () => {
      const r = calculateCourtFee(start, end, peakRate, offpeakRate, 17, 22, 'America/New_York');
      expect(r.courtFee).toBe(80000);
    });

    test('không truyền múi giờ thì mặc định giờ Việt Nam', () => {
      const r = calculateCourtFee(start, end, peakRate, offpeakRate, 17, 22);
      expect(r.courtFee).toBe(120000);
    });

    test('cắt đúng khi phiên chơi vắt qua mốc bắt đầu cao điểm', () => {
      // 09:30–10:30 UTC = 16:30–17:30 giờ VN: nửa tiếng thấp điểm + nửa tiếng
      // cao điểm = 40.000 + 60.000 = 100.000.
      const r = calculateCourtFee(
        new Date('2026-07-23T09:30:00Z'),
        new Date('2026-07-23T10:30:00Z'),
        peakRate, offpeakRate, 17, 22, 'Asia/Ho_Chi_Minh'
      );
      expect(r.courtFee).toBe(100000);
    });
  });

  // Tính theo phần giao nhau với khung cao điểm thay cho các lát 5 phút: lát
  // cũ lấy giá của phút đầu lát cho cả lát nên lệch quanh mốc 17:00/22:00, và
  // một phiên bị bỏ quên nhiều ngày phải lặp hàng nghìn lần.
  describe('tính theo khoảng thời gian', () => {
    const peakRate = 120000;
    const offpeakRate = 80000;

    test('cắt đúng ở phút lẻ quanh mốc cao điểm', () => {
      // 16:53–17:07 giờ VN: 7 phút thấp điểm (9.333,33) + 7 phút cao điểm (14.000)
      // = 23.333,33 -> 23.000đ. Lát 5 phút cũ tính cả lát 16:58–17:03 là thấp điểm -> 21.000đ.
      const r = calculateCourtFee(
        new Date('2026-07-23T09:53:00Z'),
        new Date('2026-07-23T10:07:00Z'),
        peakRate, offpeakRate, 17, 22, 'Asia/Ho_Chi_Minh'
      );
      expect(r.courtFee).toBe(23000);
      expect(r.rawFee).toBeCloseTo(23333.33, 2);
    });

    test('phiên qua nửa đêm cộng đủ khung cao điểm của cả hai ngày', () => {
      // 21:30 ngày 23 -> 18:30 ngày 24 giờ VN: cao điểm 0,5h + 1,5h, thấp điểm 19h
      // = 60.000 + 180.000 + 1.520.000.
      const r = calculateCourtFee(
        new Date('2026-07-23T14:30:00Z'),
        new Date('2026-07-24T11:30:00Z'),
        peakRate, offpeakRate, 17, 22, 'Asia/Ho_Chi_Minh'
      );
      expect(r.durationSeconds).toBe(21 * 3600);
      expect(r.courtFee).toBe(1760000);
    });

    test('phiên bị bỏ quên 30 ngày vẫn tính xong dưới 50 ms', () => {
      const started = performance.now();
      const r = calculateCourtFee(
        new Date('2026-07-01T00:00:00Z'),
        new Date('2026-07-31T00:00:00Z'),
        peakRate, offpeakRate, 17, 22, 'Asia/Ho_Chi_Minh'
      );
      const elapsedMs = performance.now() - started;

      // Mỗi 24h (07:00–07:00 giờ VN) có đúng 5h cao điểm: 150h × 120k + 570h × 80k.
      expect(r.courtFee).toBe(63600000);
      expect(elapsedMs).toBeLessThan(50);
    });

    test('chi nhánh ở múi giờ có DST: khung cao điểm theo giờ treo tường cả sau khi đổi giờ', () => {
      // New York đổi sang giờ mùa hè lúc 02:00 ngày 08/03/2026. Phiên 16:00 ngày 7 (EST)
      // tới 18:00 ngày 8 (EDT) = 25h: cao điểm 5h ngày 7 + 1h ngày 8. Dùng lệch cố định
      // của ngày 7 thì khung ngày 8 bị dời một tiếng và mất 1h cao điểm (2.200.000đ).
      const r = calculateCourtFee(
        new Date('2026-03-07T21:00:00Z'),
        new Date('2026-03-08T22:00:00Z'),
        peakRate, offpeakRate, 17, 22, 'America/New_York'
      );
      expect(r.durationSeconds).toBe(25 * 3600);
      expect(r.courtFee).toBe(2240000);
    });

    test('kết thúc không sau lúc bắt đầu thì không tính tiền', () => {
      const t = new Date('2026-07-23T10:00:00Z');
      expect(calculateCourtFee(t, t, peakRate, offpeakRate)).toEqual({ durationSeconds: 0, courtFee: 0, rawFee: 0 });
    });
  });

  test('should calculate invoice totals with percentage discount', () => {
    const courtFee = 100000;
    const sessionExtras = [
      { quantity: 2, unitPrice: 15000 }, // 30,000
      { quantity: 1, unitPrice: 20000 }  // 20,000
    ];
    // Total before discount = 150,000. 10% discount = 15,000 -> Total = 135,000

    const totals = calculateInvoiceTotals(courtFee, sessionExtras, 10, true);
    expect(totals.totalBeforeDiscount).toBe(150000);
    expect(totals.discountAmount).toBe(15000);
    expect(totals.totalAmount).toBe(135000);
  });
});
