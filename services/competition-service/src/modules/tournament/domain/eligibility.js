const { DomainError } = require('../../../shared/domainError');

// Điều kiện đăng ký (docs/06 mục 4.2). Điều kiện trình tính trên pairingRating
// (điểm chống giấu trình), không phải điểm hiện tại.

const GENDER_LABEL = { male: 'nam', female: 'nữ' };

const checkPlayer = ({ tournament, player, rating }) => {
  if (player.status !== 'active') {
    throw new DomainError('NOT_ELIGIBLE', 'Hồ sơ người chơi không còn hoạt động', [{ field: 'playerId', message: player.status }]);
  }
  if (!rating) {
    throw new DomainError('NEEDS_ASSESSMENT', `${player.displayName} chưa có điểm ${tournament.discipline === 'singles' ? 'Đơn' : 'Đôi'} — cần chấm trình trước`, [
      { field: 'playerId', message: 'Chưa có điểm ở nội dung của giải' }
    ]);
  }
  const errors = [];
  const rule = tournament.genderRule;
  if (rule === 'men' && player.gender !== 'male') errors.push({ field: 'gender', message: 'Nội dung chỉ dành cho nam' });
  if (rule === 'women' && player.gender !== 'female') errors.push({ field: 'gender', message: 'Nội dung chỉ dành cho nữ' });
  if (rule === 'mixed' && !player.gender) errors.push({ field: 'gender', message: 'Đôi nam nữ cần khai giới tính' });
  const rr = tournament.ratingRule;
  if (rr && rr.scope === 'player') {
    if (rr.min !== undefined && rr.min !== null && rating.pairingRating < rr.min) {
      errors.push({ field: 'rating', message: `Điểm xét ${rating.pairingRating} thấp hơn mức tối thiểu ${rr.min}` });
    }
    if (rr.max !== undefined && rr.max !== null && rating.pairingRating > rr.max) {
      errors.push({ field: 'rating', message: `Điểm xét ${rating.pairingRating} vượt mức tối đa ${rr.max}` });
    }
  }
  if (errors.length) throw new DomainError('NOT_ELIGIBLE', `${player.displayName} không đủ điều kiện: ${errors[0].message}`, errors);
};

// Cặp cố định: đúng thành phần giới + tổng trình cặp (nếu luật là team_sum).
const checkPair = ({ tournament, a, b, ratingA, ratingB }) => {
  if (a.id === b.id) throw new DomainError('NOT_ELIGIBLE', 'Một người không thể tự đứng cặp với chính mình');
  const errors = [];
  if (tournament.genderRule === 'mixed' && !((a.gender === 'male' && b.gender === 'female') || (a.gender === 'female' && b.gender === 'male'))) {
    errors.push({ field: 'partnerPlayerId', message: 'Cặp đôi nam nữ phải gồm 1 nam + 1 nữ' });
  }
  const rr = tournament.ratingRule;
  if (rr && rr.scope === 'team_sum') {
    const sum = Math.round((ratingA.pairingRating + ratingB.pairingRating) * 1000) / 1000;
    if (rr.min !== undefined && rr.min !== null && sum < rr.min) errors.push({ field: 'rating', message: `Tổng trình cặp ${sum} thấp hơn ${rr.min}` });
    if (rr.max !== undefined && rr.max !== null && sum > rr.max) errors.push({ field: 'rating', message: `Tổng trình cặp ${sum} vượt ${rr.max}` });
  }
  if (errors.length) throw new DomainError('NOT_ELIGIBLE', `Cặp không đủ điều kiện: ${errors[0].message}`, errors);
};

const validateRatingRule = (rule, { pairingMode, discipline }) => {
  if (!rule) return null;
  const errors = [];
  if (!['player', 'team_sum'].includes(rule.scope)) errors.push({ field: 'ratingRule.scope', message: 'player hoặc team_sum' });
  if (rule.scope === 'team_sum' && !(discipline === 'doubles' && pairingMode === 'fixed')) {
    errors.push({ field: 'ratingRule.scope', message: 'Tổng trình cặp chỉ dùng cho đánh đôi cặp đăng ký sẵn' });
  }
  if ((rule.min ?? null) === null && (rule.max ?? null) === null) errors.push({ field: 'ratingRule', message: 'Cần min hoặc max' });
  if (rule.min != null && rule.max != null && rule.min > rule.max) errors.push({ field: 'ratingRule', message: 'min > max' });
  if (errors.length) throw new DomainError('INVALID_TOURNAMENT', 'Điều kiện trình không hợp lệ', errors);
  return { scope: rule.scope, min: rule.min ?? null, max: rule.max ?? null };
};

module.exports = { checkPlayer, checkPair, validateRatingRule, GENDER_LABEL };
