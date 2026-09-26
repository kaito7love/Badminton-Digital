const { round3, clamp } = require('../../../shared/numbers');

// Điểm BXH thành tích (docs/05 mục 3.2):
//   điểm = điểm_thứ_hạng × hệ_số_cấp_giải × hệ_số_quy_mô × hệ_số_sức_mạnh   (làm tròn)
//   tổng BXH = 6 kết quả tốt nhất trong 52 tuần

const TIER_FACTOR = Object.freeze({ club: 1, open: 2, chain: 3 });
const MIN_TEAMS = 4;
const BEST_RESULTS = 6;
const WINDOW_DAYS = 364;
const REFERENCE_RATING = 3.5;

// Hạng mục theo nội dung giải; giải "mở" xếp theo thành phần thật của đội.
const categoryFor = ({ discipline, genderRule, genders }) => {
  if (discipline === 'singles') {
    const g = genderRule === 'men' ? 'male' : genderRule === 'women' ? 'female' : genders[0];
    return g === 'male' ? 'MS' : g === 'female' ? 'WS' : null;
  }
  if (genderRule === 'mixed') return 'XD';
  if (genderRule === 'men') return 'MD';
  if (genderRule === 'women') return 'WD';
  const males = genders.filter((g) => g === 'male').length;
  const females = genders.filter((g) => g === 'female').length;
  if (males === 2) return 'MD';
  if (females === 2) return 'WD';
  if (males === 1 && females === 1) return 'XD';
  return null;
};

// Điểm thứ hạng. Ở thể thức vòng bảng + loại trực tiếp, đội bị loại ở vòng bảng
// nhận "còn lại" dù số thứ tự nhỏ (vd hạng 7 nhưng chưa vào vòng trong).
const basePoints = ({ from, reachedKnockout, format, wins }) => {
  const rest = Math.min(8 + 4 * wins, 19);
  if (format === 'groups_knockout' && !reachedKnockout) return rest;
  if (from === 1) return 100;
  if (from === 2) return 70;
  if (from <= 4) return 50;
  if (from <= 8) return 32;
  if (from <= 16) return 20;
  return rest;
};

const sizeFactor = (teams) => round3(clamp(0.5 + teams / 32, 0.6, 1.25));
const strengthFactor = (avgRating) => round3(clamp(avgRating / REFERENCE_RATING, 0.6, 1.4));

const pointsFor = ({ placement, format, tier, teams, avgRating }) => {
  const base = basePoints({ ...placement, format });
  const tierF = TIER_FACTOR[tier];
  const sizeF = sizeFactor(teams);
  const strengthF = strengthFactor(avgRating);
  return { base, tierFactor: tierF, sizeFactor: sizeF, strengthFactor: strengthF, points: Math.round(base * tierF * sizeF * strengthF) };
};

module.exports = { TIER_FACTOR, MIN_TEAMS, BEST_RESULTS, WINDOW_DAYS, categoryFor, basePoints, sizeFactor, strengthFactor, pointsFor };
