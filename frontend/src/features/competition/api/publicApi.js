import { api } from './competitionApi';

// Khu công khai "Thi đấu" (plan 27): xem giải / buổi giao lưu không cần đăng nhập (`/public/*`), khách tự đăng ký (`/me/...`, cần đăng nhập).
// Mỗi hàm trả phần `data` của envelope. Tên người chơi do service quyết định theo quyền riêng tư (người bị che: `{ id: null, name: 'Thành viên A3F2', masked: true }`).

const data = (res) => res.data;

export const publicTournamentsApi = {
  /** `status` một hoặc nhiều (open, drawn, in_progress, finalized — cách nhau dấu phẩy), `organizerRef`, `q`, `order` asc|desc, `page`, `limit`. */
  list: (params = { limit: 12 }) => api.get('/public/tournaments', { params }).then(data),
  get: (id) => api.get(`/public/tournaments/${id}`).then(data),
  entries: (id) => api.get(`/public/tournaments/${id}/entries`).then(data),
  matches: (id) => api.get(`/public/tournaments/${id}/matches`).then(data),
  standings: (id) => api.get(`/public/tournaments/${id}/standings`).then(data),
  bracket: (id) => api.get(`/public/tournaments/${id}/bracket`).then(data),
  placements: (id) => api.get(`/public/tournaments/${id}/placements`).then(data),

  // Khách đăng nhập (scope entry:self). Đôi cặp cố định: body `{ partner: { playerId } | { guest: { name, phone, gender, level } } }`.
  register: (id, body) => api.post(`/me/tournaments/${id}/entries`, body || {}).then(data),
  withdraw: (id) => api.del(`/me/tournaments/${id}/entries`).then(data)
};

export const publicSessionsApi = {
  list: (params = { limit: 12 }) => api.get('/public/sessions', { params }).then(data),
  get: (id) => api.get(`/public/sessions/${id}`).then(data),
  board: (id) => api.get(`/public/sessions/${id}/board`).then(data),
  signups: (id) => api.get(`/public/sessions/${id}/signups`).then(data),

  signUp: (id) => api.post(`/me/sessions/${id}/signup`).then(data),
  cancel: (id) => api.del(`/me/sessions/${id}/signup`).then(data),
  /** Buổi đang mở mà mình đã đăng ký (giữ chỗ / chờ). */
  mine: () => api.get('/me/sessions').then(data)
};

/** Tìm đồng đội khi đăng ký giải đôi (≥ 2 ký tự): chỉ người mà thành viên được thấy. */
export const partnersApi = {
  search: (search, limit = 8) => api.get('/me/partners', { params: { search, limit } }).then(data)
};

const optional = (promise) => promise.catch(() => null);

/**
 * Tải trang một giải công khai: giải (+ `registration`, `me`) và danh sách đăng ký là bắt buộc; lịch, bảng, sơ đồ, thứ hạng tuỳ giai đoạn
 * và là phần phụ — lỗi thì bỏ qua (null) để phần còn lại vẫn xem được.
 */
export const loadPublicTournament = async (id) => {
  const t = await publicTournamentsApi.get(id);
  const drawn = t.status !== 'open';
  const [entries, matches, standings, bracket, placements] = await Promise.all([
    publicTournamentsApi.entries(id),
    drawn ? optional(publicTournamentsApi.matches(id)) : null,
    drawn && t.format !== 'knockout' ? optional(publicTournamentsApi.standings(id)) : null,
    drawn && t.format !== 'round_robin' ? optional(publicTournamentsApi.bracket(id)) : null,
    t.status === 'finalized' ? optional(publicTournamentsApi.placements(id)) : null
  ]);
  return {
    t,
    entries: entries ? entries.items : [],
    matches: matches ? matches.items : [],
    standings: standings ? standings.groups : [],
    bracket: bracket ? bracket.rounds : [],
    placements: placements ? placements.items : []
  };
};

/** Tải trang một buổi giao lưu công khai: buổi (+ `signup`, `me`), bảng sân, danh sách đăng ký (hai phần sau lỗi thì bỏ qua). */
export const loadPublicSession = async (id) => {
  const s = await publicSessionsApi.get(id);
  const [board, signups] = await Promise.all([optional(publicSessionsApi.board(id)), optional(publicSessionsApi.signups(id))]);
  return { s, board, signups: signups ? signups.items : [] };
};

/**
 * Trang chủ: giải đang mở đăng ký, đang diễn ra / sắp thi đấu, vừa kết thúc; buổi giao lưu đang mở và vừa đóng. Một phần lỗi thì phần đó rỗng
 * (không trắng cả trang) — chỉ khi TẤT CẢ lỗi mới ném lỗi.
 */
export const loadHub = async ({ organizerRef } = {}) => {
  const org = organizerRef ? { organizerRef } : {};
  const results = await Promise.allSettled([
    publicTournamentsApi.list({ status: 'open', order: 'asc', limit: 12, ...org }),
    publicTournamentsApi.list({ status: 'drawn,in_progress', order: 'asc', limit: 12, ...org }),
    publicTournamentsApi.list({ status: 'finalized', order: 'desc', limit: 6, ...org }),
    publicSessionsApi.list({ status: 'open', order: 'asc', limit: 12, ...org }),
    publicSessionsApi.list({ status: 'closed', order: 'desc', limit: 4, ...org })
  ]);
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  const items = (r) => (r.status === 'fulfilled' && r.value ? r.value.items : []);
  return {
    open: items(results[0]),
    live: items(results[1]),
    done: items(results[2]),
    sessionsOpen: items(results[3]),
    sessionsDone: items(results[4]),
    partial: results.some((r) => r.status === 'rejected')
  };
};
