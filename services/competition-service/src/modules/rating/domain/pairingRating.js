const { round3 } = require('../../../shared/numbers');
const config = require('./ratingConfig');

// Chống "giấu trình" (docs/03 mục 4): điểm dùng để ghép cặp / chia bảng / xét
// điều kiện giải không thấp hơn đỉnh 12 tháng quá 0.5. Không dùng để tính Elo.
const pairingRating = (rating, peakInWindow) => {
  if (peakInWindow === null || peakInWindow === undefined) return rating;
  return round3(Math.max(rating, peakInWindow - config.ANTI_SANDBAG_DROP));
};

module.exports = { pairingRating };
