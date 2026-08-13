/**
 * Price Calculator Helper
 */

/**
 * Calculate court fee based on start time, end time, and court rates.
 * @param {Date} startTime 
 * @param {Date} endTime 
 * @param {number} peakRate - Court peak price per hour
 * @param {number} offpeakRate - Court offpeak price per hour
 * @param {number} peakStartHour - Default 17 (17:00)
 * @param {number} peakEndHour - Default 22 (22:00)
 */
const calculateCourtFee = (startTime, endTime, peakRate, offpeakRate, peakStartHour = 17, peakEndHour = 22) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  
  if (totalSeconds <= 0) {
    return { durationSeconds: 0, courtFee: 0 };
  }

  // Calculate hour by hour or per minute slice for precision
  let current = new Date(start);
  let totalFee = 0;

  const minuteIncrement = 5; // 5 minute increments for accurate calculation
  while (current < end) {
    const nextMinute = new Date(current.getTime() + minuteIncrement * 60 * 1000);
    const sliceEnd = nextMinute > end ? end : nextMinute;
    const sliceDurationHours = (sliceEnd - current) / (1000 * 3600);

    const hour = current.getHours();
    const isPeak = hour >= peakStartHour && hour < peakEndHour;
    const rate = isPeak ? Number(peakRate) : Number(offpeakRate);

    totalFee += sliceDurationHours * rate;
    current = sliceEnd;
  }

  // Round to nearest 1,000 VND
  const roundedFee = Math.round(totalFee / 1000) * 1000;

  return {
    durationSeconds: totalSeconds,
    courtFee: roundedFee
  };
};

/**
 * Calculate invoice total amounts
 */
const calculateInvoiceTotals = (courtFee = 0, sessionExtras = [], discountInput = 0, isDiscountPercent = false) => {
  const numCourtFee = Number(courtFee) || 0;
  
  const extrasFee = sessionExtras.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = item.unitPrice != null ? Number(item.unitPrice)
                : (item.Extra?.price != null ? Number(item.Extra.price) : 0);
    return sum + (qty * price);
  }, 0);

  const totalBeforeDiscount = numCourtFee + extrasFee;

  let discountAmount = 0;
  if (isDiscountPercent) {
    discountAmount = (totalBeforeDiscount * (Number(discountInput) || 0)) / 100;
  } else {
    discountAmount = Number(discountInput) || 0;
  }

  discountAmount = Math.min(totalBeforeDiscount, Math.max(0, discountAmount));
  const totalAmount = Math.max(0, totalBeforeDiscount - discountAmount);

  return {
    courtFee: numCourtFee,
    extrasFee,
    totalBeforeDiscount,
    discountAmount,
    totalAmount
  };
};

module.exports = {
  calculateCourtFee,
  calculateInvoiceTotals
};
