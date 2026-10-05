import { describe, test, expect, vi, beforeEach } from 'vitest';

// apiClient kéo axios + localStorage — thay bằng bản giả để kiểm cách ta dựng request và dịch lỗi.
const request = vi.fn();
const get = vi.fn();
vi.mock('../../../services/apiClient', () => ({ default: { request: (...a) => request(...a), get: (...a) => get(...a) }, refreshAccessToken: vi.fn() }));
vi.mock('../../../services/realtimeClient', () => ({ nextBackoffMs: vi.fn(), tokenExpiresWithin: vi.fn(), isConnectionSilent: vi.fn() }));

const { buildRequest, quoteEtag, competitionRequest, api, fetchStatus, newKey } = await import('./competitionApi');
const { buildStreamUrl } = await import('../realtime/competitionStream');
const { decideOnBoard } = await import('../hooks/useLiveResource');
const { CompetitionError } = await import('../lib/errors');

beforeEach(() => { request.mockReset(); get.mockReset(); });

describe('dựng request tới cổng', () => {
  test('đường dẫn có tiền tố /competition; GET không có Idempotency-Key', () => {
    const cfg = buildRequest('get', '/tournaments', { params: { status: 'open' } });
    expect(cfg).toMatchObject({ method: 'GET', url: '/competition/tournaments', params: { status: 'open' } });
    expect(cfg.paramsSerializer.serialize({ search: 'thanh nhan', page: 2, skip: undefined, empty: '' })).toBe('search=thanh%20nhan&page=2');
    expect(cfg.headers['Idempotency-Key']).toBeUndefined();
  });

  test.each(['POST', 'PUT', 'PATCH'])('%s luôn gửi Idempotency-Key (mỗi lần khác nhau, hoặc đúng khoá truyền vào)', (method) => {
    const a = buildRequest(method, '/x', { body: {} });
    const b = buildRequest(method, '/x', { body: {} });
    expect(a.headers['Idempotency-Key']).toMatch(/\S{8,}/);
    expect(a.headers['Idempotency-Key']).not.toBe(b.headers['Idempotency-Key']);
    expect(buildRequest(method, '/x', { key: 'khoa-1' }).headers['Idempotency-Key']).toBe('khoa-1');
  });

  test('DELETE không tự thêm khoá; If-Match được đặt nháy', () => {
    expect(buildRequest('delete', '/x').headers['Idempotency-Key']).toBeUndefined();
    expect(buildRequest('put', '/x', { etag: 7 }).headers['If-Match']).toBe('"7"');
    expect(buildRequest('put', '/x', { etag: '"7"' }).headers['If-Match']).toBe('"7"');
    expect(quoteEtag(null)).toBeUndefined();
    expect(quoteEtag('W/"3"')).toBe('W/"3"');
  });

  test('newKey ra chuỗi khác nhau', () => {
    expect(newKey()).not.toBe(newKey());
  });
});

describe('competitionRequest', () => {
  test('trả phần data của envelope + etag + cờ replayed', async () => {
    request.mockResolvedValue({ status: 200, data: { success: true, data: { id: 't1' }, message: 'OK' }, headers: { etag: '"4"', 'idempotent-replayed': 'true' } });
    const res = await api.post('/tournaments', { name: 'A' });
    expect(res).toEqual({ data: { id: 't1' }, message: 'OK', etag: '"4"', status: 200, replayed: true });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/competition/tournaments', data: { name: 'A' } }));
  });

  test('lỗi HTTP → CompetitionError đã dịch', async () => {
    request.mockRejectedValue({ response: { status: 409, data: { code: 'LIVE_CONFLICT', message: 'x' } } });
    const err = await api.post('/matches/m/live/rallies', { side: 'A', revision: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(CompetitionError);
    expect(err).toMatchObject({ status: 409, code: 'LIVE_CONFLICT', reload: true });
    expect(err.message).toMatch(/Máy khác vừa bấm/);
  });

  test('mạng chết → unavailable', async () => {
    request.mockRejectedValue(new Error('Network Error'));
    await expect(competitionRequest('GET', '/me')).rejects.toMatchObject({ code: 'NETWORK', unavailable: true });
  });

  test('truyền signal để huỷ khi rời trang', async () => {
    request.mockResolvedValue({ status: 200, data: { data: null }, headers: {} });
    const controller = new AbortController();
    await api.get('/me', { signal: controller.signal });
    expect(request.mock.calls[0][0].signal).toBe(controller.signal);
  });
});

describe('fetchStatus', () => {
  test('đọc enabled / available', async () => {
    get.mockResolvedValue({ data: { data: { enabled: true, available: false } } });
    expect(await fetchStatus()).toEqual({ enabled: true, available: false });
    expect(get).toHaveBeenCalledWith('/competition/status');
  });

  test('thiếu dữ liệu → tắt', async () => {
    get.mockResolvedValue({ data: {} });
    expect(await fetchStatus()).toEqual({ enabled: false, available: false });
  });
});

describe('luồng SSE', () => {
  test('URL có token, branchId (admin) và mã hoá id', () => {
    expect(buildStreamUrl({ kind: 'tournaments', id: 'abc', token: 't.k.n' })).toBe('/api/v1/competition/tournaments/abc/stream?token=t.k.n');
    expect(buildStreamUrl({ kind: 'sessions', id: 'a/b', token: 'x', branchId: 3 })).toBe('/api/v1/competition/sessions/a%2Fb/stream?token=x&branchId=3');
  });

  test('sự kiện board khi trang đang bận thì hoãn (không mất thao tác dở), rảnh thì tải lại', () => {
    expect(decideOnBoard({ busy: true })).toBe('defer');
    expect(decideOnBoard({ busy: false })).toBe('reload');
  });
});
