// Luật BXH trình độ (docs/05 mục 3.1).

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_RATED_MATCHES = 5;
const ACTIVE_WINDOW_DAYS = 365;

// Hạng mục BXH trình độ. Đôi nam nữ dùng chung điểm Đôi nên không có bảng trình độ riêng.
const RATING_CATEGORIES = Object.freeze({
  MS: { discipline: 'singles', gender: 'male', label: 'Đơn nam' },
  WS: { discipline: 'singles', gender: 'female', label: 'Đơn nữ' },
  MD: { discipline: 'doubles', gender: 'male', label: 'Đôi nam' },
  WD: { discipline: 'doubles', gender: 'female', label: 'Đôi nữ' }
});

const categoryFor = (discipline, gender) =>
  Object.keys(RATING_CATEGORIES).find(
    (code) => RATING_CATEGORIES[code].discipline === discipline && RATING_CATEGORIES[code].gender === gender
  ) || null;

// ≥ 5 trận tính điểm HOẶC đã được xác nhận trình, VÀ có trận trong 12 tháng.
const isEligible = ({ ratedMatches, verified, lastMatchAt }, now = new Date()) => {
  if (!(ratedMatches >= MIN_RATED_MATCHES || verified)) return false;
  if (!lastMatchAt) return false;
  return now.getTime() - new Date(lastMatchAt).getTime() <= ACTIVE_WINDOW_DAYS * DAY_MS;
};

// Xếp hạng kiểu thi đấu (1, 2, 2, 4): điểm (so tới 0.01) giảm dần, bằng điểm thì
// nhiều trận tính điểm hơn xếp trên, vẫn bằng thì đồng hạng.
const rankRows = (rows) => {
  const sorted = [...rows].sort((a, b) => {
    const ra = Math.round(a.rating * 100);
    const rb = Math.round(b.rating * 100);
    if (rb !== ra) return rb - ra;
    if (b.ratedMatches !== a.ratedMatches) return b.ratedMatches - a.ratedMatches;
    return String(a.playerId).localeCompare(String(b.playerId));
  });
  let prev = null;
  return sorted.map((row, i) => {
    const key = `${Math.round(row.rating * 100)}|${row.ratedMatches}`;
    const rank = prev && prev.key === key ? prev.rank : i + 1;
    prev = { key, rank };
    return { ...row, rank };
  });
};

// Vị trí dự kiến của người chưa đủ điều kiện: đứng sau mọi người có điểm cao hơn.
const projectedRank = (ranked, rating) => ranked.filter((r) => Math.round(r.rating * 100) > Math.round(rating * 100)).length + 1;

module.exports = { RATING_CATEGORIES, MIN_RATED_MATCHES, ACTIVE_WINDOW_DAYS, categoryFor, isEligible, rankRows, projectedRank };
