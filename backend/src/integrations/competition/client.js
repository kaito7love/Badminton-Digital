// Gọi competition-service: timeout, ngắt mạch, không tự thử lại request ghi (thử lại mù có thể ghi hai lần;
// frontend gửi Idempotency-Key nên người dùng bấm lại vẫn an toàn).
// Chỉ lỗi mạng / timeout / 502 / 503 / 504 tính là "service hỏng" — 500 của riêng một request không làm ngắt cả cổng.

class CompetitionUnavailableError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
    this.code = 'COMPETITION_UNAVAILABLE';
  }
}

const createCompetitionClient = ({
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
  timeoutMs = 10000,
  failureThreshold = 5,
  openMs = 30000,
  logger = console
} = {}) => {
  let failures = 0;
  let openUntil = 0;

  const fail = () => {
    failures += 1;
    if (failures >= failureThreshold) {
      openUntil = now() + openMs;
      failures = 0;
      logger.warn(`[competition] Ngắt mạch ${openMs / 1000} giây: service lỗi liên tiếp.`);
    }
  };
  const succeed = () => { failures = 0; };

  /** `signal` (tuỳ chọn) để dừng khi trình duyệt đóng; `stream` bỏ timeout vì luồng SSE sống lâu. */
  const request = async ({ url, method, headers, body, stream = false, signal }) => {
    if (now() < openUntil) throw new CompetitionUnavailableError('Dịch vụ thi đấu đang tạm ngưng, thử lại sau ít phút.');
    const signals = [];
    if (signal) signals.push(signal);
    if (!stream) signals.push(AbortSignal.timeout(timeoutMs));
    let res;
    try {
      res = await fetchImpl(url, { method, headers, body, signal: signals.length ? AbortSignal.any(signals) : undefined });
    } catch (err) {
      if (signal && signal.aborted) throw err;
      fail();
      const timedOut = err && err.name === 'TimeoutError';
      throw new CompetitionUnavailableError(
        timedOut ? 'Dịch vụ thi đấu phản hồi quá chậm.' : 'Không kết nối được dịch vụ thi đấu.',
        timedOut ? 504 : 503
      );
    }
    if ([502, 503, 504].includes(res.status)) fail();
    else succeed();
    return res;
  };

  return { request, state: () => ({ open: now() < openUntil, failures }) };
};

module.exports = { createCompetitionClient, CompetitionUnavailableError };
