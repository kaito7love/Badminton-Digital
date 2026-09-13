const {
  MIN_WEBHOOK_SECRET_LENGTH,
  getTransferAccount,
  isWebhookConfigured,
  isTransferEnabled,
  webhookSecretMatches,
  assertTransferEnabled
} = require('../src/utils/paymentConfig');
const { generateVietQRUrl } = require('../src/utils/vietqr');

const SECRET = 'w'.repeat(48);
const ACCOUNT = {
  PAYMENT_BANK_ID: 'MB',
  PAYMENT_BANK_ACCOUNT_NO: '0123456789',
  PAYMENT_BANK_ACCOUNT_NAME: 'CLB CAU LONG'
};
const FULL = { ...ACCOUNT, PAYMENT_WEBHOOK_SECRET: SECRET };
const PAYMENT_KEYS = Object.keys(FULL);

describe('tài khoản nhận chuyển khoản', () => {
  test('đủ ba biến thì trả về tài khoản, đã bỏ khoảng trắng thừa', () => {
    expect(getTransferAccount({ ...ACCOUNT, PAYMENT_BANK_ACCOUNT_NO: ' 0123456789 ' })).toEqual({
      bankId: 'MB',
      accountNo: '0123456789',
      accountName: 'CLB CAU LONG'
    });
  });

  test.each(Object.keys(ACCOUNT))('thiếu %s thì không có tài khoản nào — không rơi về tài khoản mặc định', (key) => {
    expect(getTransferAccount({ ...ACCOUNT, [key]: '   ' })).toBeNull();
    expect(getTransferAccount({ ...ACCOUNT, [key]: undefined })).toBeNull();
  });
});

describe('điều kiện bật chuyển khoản', () => {
  test(`secret webhook phải dài tối thiểu ${MIN_WEBHOOK_SECRET_LENGTH} ký tự`, () => {
    expect(isWebhookConfigured({ PAYMENT_WEBHOOK_SECRET: 'a'.repeat(MIN_WEBHOOK_SECRET_LENGTH - 1) })).toBe(false);
    expect(isWebhookConfigured({ PAYMENT_WEBHOOK_SECRET: 'a'.repeat(MIN_WEBHOOK_SECRET_LENGTH) })).toBe(true);
    expect(isWebhookConfigured({})).toBe(false);
  });

  test('chỉ bật khi có cả tài khoản lẫn webhook', () => {
    expect(isTransferEnabled(FULL)).toBe(true);
    expect(isTransferEnabled(ACCOUNT)).toBe(false);
    expect(isTransferEnabled({ PAYMENT_WEBHOOK_SECRET: SECRET })).toBe(false);
  });

  test('chưa bật thì chặn thanh toán chuyển khoản bằng lỗi 400 đọc được', () => {
    expect(() => assertTransferEnabled(ACCOUNT)).toThrow(/Chuyển khoản chưa được bật/);
    try {
      assertTransferEnabled({});
      throw new Error('lẽ ra phải ném lỗi');
    } catch (error) {
      expect(error.statusCode).toBe(400);
    }
    expect(() => assertTransferEnabled(FULL)).not.toThrow();
  });
});

describe('so secret webhook', () => {
  test('đúng secret thì khớp', () => {
    expect(webhookSecretMatches(SECRET, FULL)).toBe(true);
  });

  test('sai một ký tự, khác độ dài, thiếu header thì không khớp', () => {
    expect(webhookSecretMatches(`${SECRET.slice(0, -1)}x`, FULL)).toBe(false);
    expect(webhookSecretMatches(SECRET.slice(0, 10), FULL)).toBe(false);
    expect(webhookSecretMatches(undefined, FULL)).toBe(false);
    expect(webhookSecretMatches('', FULL)).toBe(false);
  });

  test('server chưa cấu hình secret thì không chuỗi nào khớp, kể cả chuỗi rỗng', () => {
    expect(webhookSecretMatches('', {})).toBe(false);
    expect(webhookSecretMatches('short', { PAYMENT_WEBHOOK_SECRET: 'short' })).toBe(false);
  });
});

describe('generateVietQRUrl chỉ trỏ vào tài khoản đã cấu hình', () => {
  let saved;
  beforeEach(() => {
    saved = Object.fromEntries(PAYMENT_KEYS.map((key) => [key, process.env[key]]));
  });
  afterEach(() => {
    for (const key of PAYMENT_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test('chuyển khoản chưa bật thì không dựng QR nào', () => {
    for (const key of PAYMENT_KEYS) delete process.env[key];
    Object.assign(process.env, ACCOUNT);
    expect(generateVietQRUrl({ amount: 150000, addInfo: 'HOA DON BD-1-00000001' })).toBeNull();
  });

  test('đã bật thì QR mang đúng tài khoản, số tiền và nội dung', () => {
    Object.assign(process.env, FULL);
    const url = generateVietQRUrl({ amount: 150000.4, addInfo: 'HOA DON BD-1-00000001' });

    expect(url).toContain('/MB-0123456789-compact2.png');
    expect(url).toContain('amount=150000');
    expect(url).toContain(`addInfo=${encodeURIComponent('HOA DON BD-1-00000001')}`);
    expect(url).toContain(`accountName=${encodeURIComponent('CLB CAU LONG')}`);
    expect(url).not.toContain('0987654321');
  });
});
