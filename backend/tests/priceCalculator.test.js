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
