import apiClient from '../../../services/apiClient';
import { toCompetitionError } from '../lib/errors';

// Mọi lời gọi tới competition-service đi qua cổng /api/v1/competition/* của app chính (plan 23) và qua apiClient chung — nên
// token, X-Branch-Id (admin) và refresh khi 401 do apiClient lo; không tạo instance axios mới.

const PREFIX = '/competition';
const WRITE = new Set(['POST', 'PUT', 'PATCH']);

export const newKey = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2)}`);

/** ETag của service là chuỗi có nháy ("3"); chấp nhận cả số trần lẫn chuỗi đã có nháy. */
export const quoteEtag = (etag) => {
  if (etag === null || etag === undefined || etag === '') return undefined;
  const s = String(etag);
  return s.startsWith('"') || s.startsWith('W/') ? s : `"${s}"`;
};

/** Dựng cấu hình axios — hàm thuần để test. */
export const buildRequest = (method, path, { params, body, etag, key } = {}) => {
  const verb = method.toUpperCase();
  const headers = {};
  // Ghi một lần: bấm hai lần / mạng chập chờn gửi lại vẫn chỉ có hiệu lực một lần (service khử trùng theo khoá).
  if (WRITE.has(verb)) headers['Idempotency-Key'] = key || newKey();
  const ifMatch = quoteEtag(etag);
  if (ifMatch) headers['If-Match'] = ifMatch;
  return { method: verb, url: `${PREFIX}${path}`, params, data: body, headers };
};

/**
 * Gọi một endpoint thi đấu. Trả `{ data, message, etag, status, replayed }` (data là phần `data` của envelope).
 * Ném `CompetitionError` (đã dịch sang tiếng Việt, có `code`, `fields`, `reload`, `unavailable`).
 */
export const competitionRequest = async (method, path, options = {}) => {
  const { signal } = options;
  try {
    const res = await apiClient.request({ ...buildRequest(method, path, options), signal });
    return {
      data: res.data?.data ?? null,
      message: res.data?.message ?? null,
      etag: res.headers?.etag ?? null,
      status: res.status,
      replayed: res.headers?.['idempotent-replayed'] === 'true'
    };
  } catch (err) {
    throw toCompetitionError(err);
  }
};

export const api = {
  get: (path, options) => competitionRequest('GET', path, options),
  post: (path, body, options) => competitionRequest('POST', path, { ...options, body }),
  put: (path, body, options) => competitionRequest('PUT', path, { ...options, body }),
  patch: (path, body, options) => competitionRequest('PATCH', path, { ...options, body }),
  del: (path, options) => competitionRequest('DELETE', path, options)
};

/** Công khai, không cần đăng nhập, không gọi service: có hiện menu thi đấu không (plan 25 mục 2.1). */
export const fetchStatus = async () => {
  const res = await apiClient.get(`${PREFIX}/status`);
  const data = res.data?.data || {};
  return { enabled: Boolean(data.enabled), available: Boolean(data.available) };
};
