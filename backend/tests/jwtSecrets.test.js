const crypto = require('crypto');

const randomSecret = () => crypto.randomBytes(48).toString('hex');

// jwt.js kiểm secret ngay lúc require — đặt cặp secret hợp lệ trước khi nạp.
process.env.JWT_ACCESS_SECRET = randomSecret();
process.env.JWT_REFRESH_SECRET = randomSecret();
const {
  findJwtSecretProblems,
  generateRefreshToken,
  generateResetToken,
  hashRefreshToken,
  refreshTokenMatches
} = require('../src/utils/jwt');

const ACCESS_PLACEHOLDER = 'thay_bang_chuoi_ngau_nhien_rieng_cho_access_token_32ky_tu';
const REFRESH_PLACEHOLDER = 'thay_bang_chuoi_ngau_nhien_rieng_cho_refresh_token_32ky_tu';

describe('kiểm tra secret JWT lúc khởi động', () => {
  const good = { JWT_ACCESS_SECRET: randomSecret(), JWT_REFRESH_SECRET: randomSecret() };

  test('cặp secret ngẫu nhiên, khác nhau thì hợp lệ', () => {
    expect(findJwtSecretProblems(good)).toEqual([]);
  });

  test('thiếu hoặc ngắn hơn 32 ký tự thì từ chối', () => {
    expect(findJwtSecretProblems({ ...good, JWT_ACCESS_SECRET: undefined })).toHaveLength(1);
    expect(findJwtSecretProblems({ ...good, JWT_REFRESH_SECRET: 'a'.repeat(31) })).toHaveLength(1);
    // Chuỗi mẫu cũ trong README ngắn hơn 32 ký tự nên rơi vào nhánh này.
    expect(findJwtSecretProblems({ JWT_ACCESS_SECRET: 'change_me', JWT_REFRESH_SECRET: 'change_me_too' })).toHaveLength(2);
  });

  test.each([
    ['JWT_ACCESS_SECRET', ACCESS_PLACEHOLDER],
    ['JWT_REFRESH_SECRET', REFRESH_PLACEHOLDER]
  ])('%s là chuỗi mẫu công khai trong .env.example thì từ chối dù đủ dài', (key, placeholder) => {
    const problems = findJwtSecretProblems({ ...good, [key]: placeholder });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/chuỗi mẫu/);
  });

  test('hai secret giống nhau thì từ chối', () => {
    const same = randomSecret();
    expect(findJwtSecretProblems({ JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same }).join(' ')).toMatch(/phải khác nhau/);
  });

  test('module jwt.js không nạp được khi .env còn chuỗi mẫu', () => {
    const savedAccess = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = ACCESS_PLACEHOLDER;
    try {
      jest.isolateModules(() => {
        expect(() => require('../src/utils/jwt')).toThrow(/chuỗi mẫu/);
      });
    } finally {
      process.env.JWT_ACCESS_SECRET = savedAccess;
    }
  });
});

describe('refresh token chỉ lưu dạng hash', () => {
  test('hash là sha256 hex 64 ký tự, không chứa token gốc', () => {
    const token = generateRefreshToken({ id: 1 });
    const hash = hashRefreshToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  test('chỉ đúng token đã phát mới khớp với hash đã lưu', () => {
    const token = generateRefreshToken({ id: 1 });
    const otherUsersToken = generateRefreshToken({ id: 2 });
    const stored = hashRefreshToken(token);

    expect(refreshTokenMatches(token, stored)).toBe(true);
    expect(refreshTokenMatches(otherUsersToken, stored)).toBe(false);
  });

  test('token thô còn trong DB từ trước khi đổi sang hash không dùng được nữa', () => {
    const token = generateRefreshToken({ id: 1 });

    expect(refreshTokenMatches(token, token)).toBe(false);
    expect(refreshTokenMatches(token, null)).toBe(false);
    expect(refreshTokenMatches(undefined, hashRefreshToken(token))).toBe(false);
  });
});

describe('reset token cần passwordHash', () => {
  test('user nạp theo default scope (không có passwordHash) thì báo lỗi, không ký link hỏng', () => {
    expect(() => generateResetToken({ id: 1 })).toThrow(/withSecrets/);
    expect(generateResetToken({ id: 1, passwordHash: '$2b$10$hash' })).toEqual(expect.any(String));
  });
});
