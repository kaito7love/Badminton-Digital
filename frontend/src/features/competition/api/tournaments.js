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
  result: (id, body, version) => api.put(`/matches/${id}/result`, body, { etag: version }).then(data),
  /** Kết thúc trận không nhập tỉ số (buổi giao lưu). */
  end: (id) => api.post(`/matches/${id}/end`).then(data),
  cancel: (id) => api.post(`/matches/${id}/cancel`).then(data)
};

// Bấm điểm trực tiếp (docs/02 mục 2.5, 06 mục 1.5): mọi lần đổi gửi kèm `revision` đã thấy — lệch → 409 LIVE_CONFLICT (máy khác vừa bấm).
export const liveApi = {
  get: (id) => api.get(`/matches/${id}/live`).then(data),
  rally: (id, side, revision) => api.post(`/matches/${id}/live/rallies`, { side, revision }).then(data),
  undo: (id, revision) => api.post(`/matches/${id}/live/undo`, { revision }).then(data),
  setServer: (id, firstServer, revision) => api.put(`/matches/${id}/live/server`, { firstServer, revision }).then(data),
  confirm: (id, revision) => api.post(`/matches/${id}/live/confirm`, { revision }).then(data),
  /** Đội `side` không đánh tiếp được (chỉ nhân viên, trận giải). */
  retire: (id, side, revision) => api.post(`/matches/${id}/live/retire`, { side, revision }).then(data)
};

export const playersApi = {
  /** Tìm: `search`, `flag` (unverified | needs_verification | quick), `discipline`, `status`, `page`, `limit`. */
  list: (params = { limit: 100, status: 'active' }) => api.get('/players', { params }).then(data),
  get: (id) => api.get(`/players/${id}`).then(data),
  /** Sổ điểm (để hiện "vì sao điểm đổi" / vẽ biểu đồ). */
  history: (id, discipline, params = {}) => api.get(`/players/${id}/rating-history`, { params: { ...(discipline ? { discipline } : {}), ...params } }).then(data),
  matches: (id, params = { limit: 10 }) => api.get(`/players/${id}/matches`, { params }).then(data),
  partners: (id) => api.get(`/players/${id}/partners`).then(data),
  stats: (id) => api.get(`/players/${id}/stats`).then(data),
  /** Chấm nhanh một nhãn — chỉ cho người chưa có điểm. */
  quickAssessment: (id, body) => api.post(`/players/${id}/assessments/quick`, body).then(data),
  /** Nhân viên chấm đủ form (không trần 4.5). Người đã có trận tính điểm: chỉ quản lý (`rating:assess:any`), điểm không đổi. */
  assess: (id, body) => api.post(`/players/${id}/assessments`, body).then(data),
  verify: (id, discipline) => api.post(`/players/${id}/verify`, { discipline }).then(data),
  /** Chỉnh điểm tay (quản lý): `{ discipline, newRating, reason }`, lý do ≥ 10 ký tự. */
  adjust: (id, body) => api.post(`/players/${id}/rating-adjustments`, body).then(data)
};

/** Chấm trình: bộ tiêu chí (frontend không chép lại), tính thử, hàng chờ duyệt. */
export const ratingApi = {
  rubric: () => api.get('/rubrics/current').then(data),
  /** Tính thử, không lưu. `source`: self | staff. */
  preview: (body) => api.post('/assessments/preview', body).then(data),
  /** Hàng chờ duyệt (quản lý): `status` (pending_review), `flag` (needs_verification). */
  assessments: (params = {}) => api.get('/assessments', { params: { limit: 50, ...params } }).then(data),
  /** `{ decision: 'approve'|'reject', answers?, note? }` — duyệt kèm sửa / điền nốt tiêu chí thì gửi `answers`. */
  review: (id, body) => api.post(`/assessments/${id}/review`, body).then(data),
  /** Tự chấm của khách (c5). */
  submitSelf: (body) => api.post('/me/assessments', body).then(data)
};

export const sessionsApi = {
  list: (params = { limit: 50 }) => api.get('/sessions', { params }).then(data),
  get: (id) => api.get(`/sessions/${id}`).then(data),
  create: (body) => api.post('/sessions', body).then(data),
  /** Sửa buổi (tên, sân, luật điểm, cách xếp…). `version` = `session.version` (If-Match). */
  update: (id, body, version) => api.patch(`/sessions/${id}`, body, { etag: version }).then(data),
  players: (id) => api.get(`/sessions/${id}/players`).then(data),
  /** Điểm danh. Chưa có điểm → 422 NEEDS_ASSESSMENT (gửi lại kèm `quickLevel`); đang ở buổi khác → 409 PRESENT_ELSEWHERE. */
  checkIn: (id, playerId, quickLevel) => api.post(`/sessions/${id}/players`, quickLevel ? { playerId, quickLevel } : { playerId }).then(data),
  leave: (id, playerId) => api.del(`/sessions/${id}/players/${playerId}`).then(data),
  fillPreview: (id, seed) => api.post(`/sessions/${id}/fill-courts/preview`, seed ? { seed } : {}).then(data),
  fill: (id, body) => api.post(`/sessions/${id}/fill-courts`, body).then(data),
  matches: (id) => api.get(`/sessions/${id}/matches`).then(data),
  /** Dữ liệu màn hình lớn (TV): sân, hàng chờ, sắp vào sân, kết quả gần nhất. */
  board: (id) => api.get(`/sessions/${id}/board`).then(data),
  closePreview: (id) => api.get(`/sessions/${id}/close-preview`).then(data),
  close: (id) => api.post(`/sessions/${id}/close`).then(data),
  cancel: (id) => api.post(`/sessions/${id}/cancel`).then(data)
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
