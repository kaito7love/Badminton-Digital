const { DomainError } = require('../../../shared/domainError');

// Luật hồ sơ người chơi (docs/05 mục 1).

const AGE_GROUPS = ['U18', '18-34', '35-44', '45-54', '55+'];

const ageGroup = (birthYear, now = new Date()) => {
  if (!birthYear) return null;
  const age = now.getUTCFullYear() - birthYear;
  if (age < 18) return 'U18';
  if (age < 35) return '18-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
};

// Tên hiển thị trên BXH công khai: tên thi đấu, chưa đặt thì "Tên + chữ cái đầu của họ".
// "Nguyễn Văn An" → "An N."
const publicName = (player) => {
  if (player.nickname) return player.nickname;
  const parts = String(player.displayName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Người chơi';
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]} ${parts[0].charAt(0).toUpperCase()}.`;
};

// Ai đang xem: nhân viên (có rating:read) / thành viên đã đăng nhập / khách chưa đăng nhập.
// Gateway ký `sub = "anonymous"` cho người chưa đăng nhập.
const viewerKind = (auth) => {
  if (auth.scopes.has('rating:read')) return 'staff';
  if (!auth.sub || auth.sub === 'anonymous') return 'public';
  return 'member';
};

const canViewProfile = (player, viewer, isSelf) => {
  if (isSelf || viewer === 'staff') return true;
  if (player.status !== 'active') return false;
  if (player.visibility === 'public') return true;
  if (player.visibility === 'members') return viewer === 'member';
  return false;
};

const NICKNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,28}[\p{L}\p{N}.]$/u;

// Kiểm tra các trường hồ sơ người dùng được sửa. Trả về object đã chuẩn hoá
// (tên trường theo camelCase của model).
const validateProfilePatch = (patch, now = new Date()) => {
  const year = now.getUTCFullYear();
  const errors = [];
  const out = {};
  const intIn = (field, min, max) => {
    const v = patch[field];
    if (v === undefined) return;
    if (v === null) {
      out[field] = null;
      return;
    }
    if (!Number.isInteger(v) || v < min || v > max) errors.push({ field, message: `Phải là số nguyên từ ${min} đến ${max}` });
    else out[field] = v;
  };
  const oneOf = (field, values) => {
    const v = patch[field];
    if (v === undefined) return;
    if (v !== null && !values.includes(v)) errors.push({ field, message: `Một trong ${values.join(', ')}` });
    else out[field] = v;
  };

  if (patch.nickname !== undefined) {
    if (patch.nickname === null || patch.nickname === '') out.nickname = null;
    else if (typeof patch.nickname !== 'string' || !NICKNAME_PATTERN.test(patch.nickname.trim())) {
      errors.push({ field: 'nickname', message: 'Tên thi đấu 2–30 ký tự: chữ, số, khoảng trắng, . _ -' });
    } else out.nickname = patch.nickname.trim();
  }
  oneOf('gender', ['male', 'female']);
  intIn('birthYear', 1930, year);
  oneOf('dominantHand', ['right', 'left']);
  intIn('playingSinceYear', 1950, year);
  intIn('sessionsPerWeek', 0, 14);
  oneOf('preferredPlay', ['singles', 'doubles', 'both']);
  oneOf('doublesPosition', ['front', 'back', 'both']);
  oneOf('visibility', ['public', 'members', 'hidden']);
  if (patch.homeOrganizerRef !== undefined) {
    if (patch.homeOrganizerRef !== null && (typeof patch.homeOrganizerRef !== 'string' || patch.homeOrganizerRef.length > 64)) {
      errors.push({ field: 'homeOrganizerRef', message: 'Chuỗi tối đa 64 ký tự' });
    } else out.homeOrganizerRef = patch.homeOrganizerRef;
  }
  if (out.birthYear && out.playingSinceYear && out.playingSinceYear < out.birthYear) {
    errors.push({ field: 'playingSinceYear', message: 'Năm bắt đầu chơi không thể trước năm sinh' });
  }
  if (errors.length) throw new DomainError('INVALID_PROFILE', 'Thông tin hồ sơ không hợp lệ', errors);
  return out;
};

module.exports = { AGE_GROUPS, ageGroup, publicName, viewerKind, canViewProfile, validateProfilePatch };
