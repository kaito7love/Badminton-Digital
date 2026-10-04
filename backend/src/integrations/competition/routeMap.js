// Danh sách cho phép của cổng: không có trong danh sách thì không chuyển tiếp (404 ngay tại app chính), nên
// `/v1/events`, `/v1/ops/*`, `…/assessments/ai` và mọi đường lạ không bao giờ tới được service.
// Cách làm: tiền tố tài nguyên + method (service tự kiểm scope từng route) — không phải sửa hai nơi mỗi khi thêm route.

const RESOURCES = new Set(['me', 'players', 'rubrics', 'assessments', 'leaderboards', 'matchmaking', 'matches', 'tournaments', 'sessions']);
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_PATH = /^\/[A-Za-z0-9._~:@%!$&()*+,;=-]+(?:\/[A-Za-z0-9._~:@%!$&()*+,;=-]+)*$/;

/** `path` là phần sau `/api/v1/competition`, vd `/tournaments/123/matches`. Trả `null` nếu không được chuyển tiếp. */
const matchRoute = (method, path) => {
  const verb = String(method || '').toUpperCase();
  if (!METHODS.has(verb) || typeof path !== 'string' || !SAFE_PATH.test(path)) return null;
  const segments = path.split('/').slice(1);
  // Dấu chấm / gạch chéo mã hoá để lách (`%2e%2e`, `%2f`) — không có route hợp lệ nào cần đến.
  if (segments.some((s) => s === '.' || s === '..' || /%2e|%2f|%5c/i.test(s))) return null;
  if (!RESOURCES.has(segments[0])) return null;
  // Đường nội bộ của dịch vụ phân tích video — chỉ scope assessment:submit-ai, cổng không cấp.
  if (segments.includes('ai')) return null;

  const isStream = verb === 'GET' && segments[segments.length - 1] === 'stream';
  const isPublic = verb === 'GET' && (
    (segments[0] === 'leaderboards' && segments.length === 2 && ['rating', 'points'].includes(segments[1]))
    || (segments[0] === 'players' && segments.length === 3 && segments[2] === 'public')
  );
  return { resource: segments[0], isStream, isPublic };
};

module.exports = { matchRoute, RESOURCES };
