// R13 (kế hoạch 36): nâng bcrypt 5.1.1 → 6.x không được làm mất khả năng đăng nhập của mật khẩu đã lưu.
// Hai hash dưới đây được sinh bằng bcrypt 5.1.1 TRƯỚC khi nâng và nhúng cố định vào test.
const bcrypt = require('bcrypt');

const HASH_COST_10 = '$2b$10$uTdjUhEADozcUQq4Sygr0.UoAteVnkRZtNVelozDK45TCcJEPF/N2'; // 'Cu@123456'
const HASH_COST_12 = '$2b$12$Lft9lz.FKKdwjhV3mNQuYu09Vx2DtqKBH1nsUNfOF1lKA.IEQcOxG'; // 'Quan-Tri@2026'

describe('bcrypt — tương thích với mật khẩu đã lưu', () => {
  test('hash do bản cũ sinh vẫn so khớp đúng mật khẩu', async () => {
    expect(await bcrypt.compare('Cu@123456', HASH_COST_10)).toBe(true);
    expect(await bcrypt.compare('Quan-Tri@2026', HASH_COST_12)).toBe(true);
  });

  test('sai mật khẩu, thiếu ký tự hoặc hoa/thường khác đều bị từ chối', async () => {
    expect(await bcrypt.compare('Cu@12345', HASH_COST_10)).toBe(false);
    expect(await bcrypt.compare('cu@123456', HASH_COST_10)).toBe(false);
    expect(await bcrypt.compare('', HASH_COST_10)).toBe(false);
    expect(await bcrypt.compare('Quan-Tri@2026', HASH_COST_10)).toBe(false);
  });

  test('hash mới có đúng định dạng $2b$10$ (cost 10 như AuthService) và so khớp hai chiều', async () => {
    const hash = await bcrypt.hash('Moi@7654321', 10);
    expect(hash).toMatch(/^\$2b\$10\$[./A-Za-z0-9]{53}$/);
    expect(await bcrypt.compare('Moi@7654321', hash)).toBe(true);
    expect(await bcrypt.compare('Moi@7654322', hash)).toBe(false);
    expect(bcrypt.compareSync('Moi@7654321', hash)).toBe(true);
  });

  test('cùng mật khẩu hai lần ra hai hash khác nhau (có salt) nhưng cùng so khớp', async () => {
    const [a, b] = await Promise.all([bcrypt.hash('Muoi@1234567', 10), bcrypt.hash('Muoi@1234567', 10)]);
    expect(a).not.toBe(b);
    expect(await bcrypt.compare('Muoi@1234567', a)).toBe(true);
    expect(await bcrypt.compare('Muoi@1234567', b)).toBe(true);
  });

  test('không còn phụ thuộc chuỗi tar/node-pre-gyp (nguyên nhân R13)', () => {
    const pkg = require('bcrypt/package.json');
    const deps = Object.keys(pkg.dependencies || {});
    expect(deps).not.toContain('@mapbox/node-pre-gyp');
    expect(deps).not.toContain('tar');
  });
});
