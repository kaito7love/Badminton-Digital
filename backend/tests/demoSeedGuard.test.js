const fs = require('fs');
const path = require('path');
const { assertDemoSeedAllowed, resolveDemoAdminPassword } = require('../src/utils/demoSeedGuard');
const { findResetProblems } = require('../scripts/demo-reset');

const STRONG = 'mat-khau-admin-bi-mat-2026';

describe('resolveDemoAdminPassword — admin của bản demo công khai', () => {
  test('máy dev giữ Admin@123 (trang đăng nhập dev in sẵn)', () => {
    expect(resolveDemoAdminPassword({ NODE_ENV: 'development' })).toBe('Admin@123');
    expect(resolveDemoAdminPassword({})).toBe('Admin@123');
  });

  test('production bắt buộc DEMO_ADMIN_PASSWORD bí mật', () => {
    expect(() => resolveDemoAdminPassword({ NODE_ENV: 'production' })).toThrow(/DEMO_ADMIN_PASSWORD/);
    expect(() => resolveDemoAdminPassword({ NODE_ENV: 'production', DEMO_ADMIN_PASSWORD: 'ngan' })).toThrow(/12 ký tự/);
    expect(() => resolveDemoAdminPassword({ NODE_ENV: 'production', DEMO_ADMIN_PASSWORD: 'Admin@123' })).toThrow();
    expect(() => resolveDemoAdminPassword({ NODE_ENV: 'production', DEMO_ADMIN_PASSWORD: 'MANAGER@123' })).toThrow();
    expect(resolveDemoAdminPassword({ NODE_ENV: 'production', DEMO_ADMIN_PASSWORD: STRONG })).toBe(STRONG);
  });
});

describe('demo-reset — chặn xoá nhầm DB', () => {
  const ok = { NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true', DEMO_RESET_CONFIRM: 'demo_db', DEMO_ADMIN_PASSWORD: STRONG };

  test('đủ điều kiện thì chạy', () => {
    expect(findResetProblems(ok, 'demo_db')).toEqual([]);
  });

  test('thiếu ALLOW_DEMO_SEED', () => {
    expect(findResetProblems({ ...ok, ALLOW_DEMO_SEED: undefined }, 'demo_db')).toHaveLength(1);
  });

  test('DEMO_RESET_CONFIRM không khớp tên DB thật sự sẽ bị xoá', () => {
    expect(findResetProblems({ ...ok, DEMO_RESET_CONFIRM: 'db_khac' }, 'demo_db').join()).toMatch(/demo_db/);
    expect(findResetProblems({ ...ok, DEMO_RESET_CONFIRM: undefined }, 'demo_db')).toHaveLength(1);
    expect(findResetProblems(ok, undefined)).toHaveLength(1);
  });

  test('mật khẩu admin yếu bị phát hiện TRƯỚC khi xoá bảng', () => {
    expect(findResetProblems({ ...ok, DEMO_ADMIN_PASSWORD: 'Admin@123' }, 'demo_db')).toHaveLength(1);
  });
});

const SEEDERS_DIR = path.join(__dirname, '../src/seeders');

describe('demoSeedGuard — chặn seed dữ liệu demo lên production', () => {
  test('dev/test chạy bình thường', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertDemoSeedAllowed({})).not.toThrow();
  });

  test('production không bật cờ thì chặn, kèm hướng dẫn tạo admin', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production' })).toThrow(/npm run create-admin/);
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'false' })).toThrow(/ALLOW_DEMO_SEED=true/);
  });

  test('production bật cờ có ý thức thì cho chạy', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' })).not.toThrow();
  });

  describe('mọi seeder đều dừng trước khi chạm DB', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED };

    beforeAll(() => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_DEMO_SEED;
    });

    afterAll(() => {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.ALLOW_DEMO_SEED === undefined) delete process.env.ALLOW_DEMO_SEED;
      else process.env.ALLOW_DEMO_SEED = saved.ALLOW_DEMO_SEED;
    });

    // queryInterface giả: seeder nào đụng tới nó trước khi gọi guard là test đỏ.
    const untouchable = new Proxy({}, {
      get: (_, prop) => {
        throw new Error(`seeder chạm queryInterface.${String(prop)} trước khi kiểm tra môi trường`);
      }
    });

    const seederFiles = fs.readdirSync(SEEDERS_DIR).filter((file) => file.endsWith('.js'));

    test.each(seederFiles)('%s', async (file) => {
      const seeder = require(path.join(SEEDERS_DIR, file));
      await expect(seeder.up(untouchable, {})).rejects.toThrow(/ALLOW_DEMO_SEED=true/);
    });
  });
});
