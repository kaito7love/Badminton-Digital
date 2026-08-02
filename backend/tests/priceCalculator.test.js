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
