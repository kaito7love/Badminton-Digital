import { api } from './competitionApi';

// Endpoint giải đấu / trận / người chơi (docs/02). Mỗi hàm trả phần `data` của envelope (hoặc cả `{data, etag}` khi cần ETag).

const data = (res) => res.data;

export const tournamentsApi = {
  list: (params = { limit: 50 }) => api.get('/tournaments', { params }).then(data),
  get: (id) => api.get(`/tournaments/${id}`).then(data),
  create: (body) => api.post('/tournaments', body).then(data),
  advice: (body) => api.post('/tournaments/advice', body).then(data),
  /** Chuyển trạng thái: open | reopen | cancel | finalize | unfinalize. */
  action: (id, name, body) => api.post(`/tournaments/${id}/${name}`, body).then(data),

  entries: (id) => api.get(`/tournaments/${id}/entries`).then(data),
  register: (id, body) => api.post(`/tournaments/${id}/entries`, body).then(data),
  withdraw: (id, entryId) => api.del(`/tournaments/${id}/entries/${entryId}`).then(data),
  checkIn: (id, entryId, present = true) => (present
    ? api.post(`/tournaments/${id}/entries/${entryId}/check-in`).then(data)
    : api.del(`/tournaments/${id}/entries/${entryId}/check-in`).then(data)),
  changePartner: (id, entryId, partnerPlayerId) => api.put(`/tournaments/${id}/entries/${entryId}/partner`, { partnerPlayerId }).then(data),

  matches: (id) => api.get(`/tournaments/${id}/matches`).then(data),
  standings: (id) => api.get(`/tournaments/${id}/standings`).then(data),
  bracket: (id) => api.get(`/tournaments/${id}/bracket`).then(data),
  placements: (id) => api.get(`/tournaments/${id}/placements`).then(data),
  nextMatches: (id, limit = 10) => api.get(`/tournaments/${id}/next-matches`, { params: { limit } }).then(data),
  teams: (id) => api.get(`/tournaments/${id}/teams`).then(data),
  addMatch: (id, body) => api.post(`/tournaments/${id}/matches`, body).then(data),
  setCourts: (id, courtRefs) => api.put(`/tournaments/${id}/courts`, { courtRefs }).then(data),

  noShows: (id) => api.get(`/tournaments/${id}/no-shows`).then(data),
  resolveNoShows: (id, teamIds) => api.post(`/tournaments/${id}/no-shows`, { teamIds }).then(data),

  drawPreview: (id, body = {}) => api.post(`/tournaments/${id}/draw/preview`, body).then(data),
  draw: (id, body) => api.post(`/tournaments/${id}/draw`, body).then(data),
  knockoutPreview: (id) => api.post(`/tournaments/${id}/knockout/preview`).then(data),
  lockKnockout: (id, positions) => api.post(`/tournaments/${id}/knockout`, positions ? { positions } : {}).then(data),
  finalizePreview: (id) => api.get(`/tournaments/${id}/finalize-preview`).then(data)
};

export const matchesApi = {
  get: (id) => api.get(`/matches/${id}`).then(data),
  call: (id, courtRef) => api.post(`/matches/${id}/call`, { courtRef }).then(data),
  /** Ghi / sửa kết quả. `version` = `match.version` (If-Match) để hai máy không đè nhau. */
  result: (id, body, version) => api.put(`/matches/${id}/result`, body, { etag: version }).then(data)
};

export const playersApi = {
  list: (params = { limit: 100, status: 'active' }) => api.get('/players', { params }).then(data),
  quickAssessment: (id, body) => api.post(`/players/${id}/assessments/quick`, body).then(data)
};

export const sessionsApi = {
  list: (params = { limit: 50 }) => api.get('/sessions', { params }).then(data),
  players: (id) => api.get(`/sessions/${id}/players`).then(data)
};

/**
 * Tải mọi thứ trang một giải cần trong một lượt: giải + đăng ký (+ trận, bảng, sơ đồ, thứ hạng, trận kế tiếp tuỳ giai đoạn).
 * Giải / đăng ký / trận lỗi thì ném lỗi (không có chúng thì không vẽ được trang); bảng xếp hạng, sơ đồ, thứ hạng, gợi ý trận kế tiếp
 * là phần phụ — lỗi thì bỏ qua (null) để phần còn lại vẫn dùng được.
 */
export const loadTournamentBundle = async (id) => {
  const t = await tournamentsApi.get(id);
  const drawn = !['draft', 'open', 'cancelled'].includes(t.status);
  const live = ['drawn', 'in_progress'].includes(t.status);
  const optional = (promise) => promise.catch(() => null);
  const [entries, matches, standings, bracket, placements, next] = await Promise.all([
    t.status === 'cancelled' ? null : tournamentsApi.entries(id),
    drawn ? tournamentsApi.matches(id) : null,
    drawn && t.format !== 'knockout' ? optional(tournamentsApi.standings(id)) : null,
    drawn && t.format !== 'round_robin' ? optional(tournamentsApi.bracket(id)) : null,
    t.status === 'finalized' ? optional(tournamentsApi.placements(id)) : null,
    live ? optional(tournamentsApi.nextMatches(id, 10)) : null
  ]);
  return { t, entries: entries ? entries.items : null, matches: matches ? matches.items : null, standings, bracket, placements, next };
};
