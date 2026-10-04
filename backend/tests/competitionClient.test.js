const { createCompetitionClient, CompetitionUnavailableError } = require('../src/integrations/competition/client');

const silent = { warn: jest.fn(), error: jest.fn() };
const response = (status) => ({ status, headers: new Headers() });

describe('client gọi competition-service', () => {
  test('trả nguyên response của service', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200));
    const client = createCompetitionClient({ fetchImpl, logger: silent });
    const res = await client.request({ url: 'http://x/v1/me', method: 'GET', headers: {} });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('lỗi mạng → 503 COMPETITION_UNAVAILABLE, không thử lại', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    const client = createCompetitionClient({ fetchImpl, logger: silent });
    await expect(client.request({ url: 'http://x', method: 'POST', headers: {} })).rejects.toMatchObject({ statusCode: 503, code: 'COMPETITION_UNAVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('quá thời gian → 504', async () => {
    const fetchImpl = jest.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    const client = createCompetitionClient({ fetchImpl, timeoutMs: 20, logger: silent });
    await expect(client.request({ url: 'http://x', method: 'GET', headers: {} })).rejects.toMatchObject({ statusCode: 504 });
  });

  test('luồng SSE không có timeout; trình duyệt đóng thì dừng và không tính là lỗi service', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    const client = createCompetitionClient({ fetchImpl, timeoutMs: 5, logger: silent });
    const pending = client.request({ url: 'http://x', method: 'GET', headers: {}, stream: true, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 30)); // lâu hơn timeoutMs mà chưa bị cắt
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(CompetitionUnavailableError);
    expect(client.state().failures).toBe(0);
  });

  describe('ngắt mạch', () => {
    let clock;
    const now = () => clock;
    beforeEach(() => { clock = 1_000_000; });

    test('5 lần lỗi liên tiếp → ngắt 30 giây không gọi service, hết hạn thì thử lại và đóng nếu thành công', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(response(503));
      const client = createCompetitionClient({ fetchImpl, now, logger: silent });
      for (let i = 0; i < 5; i += 1) await client.request({ url: 'http://x', method: 'GET', headers: {} });
      expect(client.state().open).toBe(true);

      await expect(client.request({ url: 'http://x', method: 'GET', headers: {} })).rejects.toBeInstanceOf(CompetitionUnavailableError);
      expect(fetchImpl).toHaveBeenCalledTimes(5); // lần thứ 6 bị chặn, không gọi

      clock += 30_001;
      fetchImpl.mockResolvedValue(response(200));
      await client.request({ url: 'http://x', method: 'GET', headers: {} });
      expect(client.state()).toEqual({ open: false, failures: 0 });
      expect(fetchImpl).toHaveBeenCalledTimes(6);
    });

    test('500 và 4xx của một request không tính là service hỏng', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(response(500));
      const client = createCompetitionClient({ fetchImpl, now, logger: silent });
      for (let i = 0; i < 10; i += 1) await client.request({ url: 'http://x', method: 'GET', headers: {} });
      expect(client.state().open).toBe(false);
    });

    test('một lần thành công xoá bộ đếm lỗi', async () => {
      const fetchImpl = jest.fn();
      const client = createCompetitionClient({ fetchImpl, now, logger: silent });
      for (let i = 0; i < 4; i += 1) { fetchImpl.mockResolvedValueOnce(response(502)); await client.request({ url: 'http://x', method: 'GET', headers: {} }); }
      fetchImpl.mockResolvedValueOnce(response(200));
      await client.request({ url: 'http://x', method: 'GET', headers: {} });
      for (let i = 0; i < 4; i += 1) { fetchImpl.mockResolvedValueOnce(response(502)); await client.request({ url: 'http://x', method: 'GET', headers: {} }); }
      expect(client.state().open).toBe(false);
    });
  });
});
