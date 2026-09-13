const fs = require('fs');
const path = require('path');
const { assertDemoSeedAllowed } = require('../src/utils/demoSeedGuard');

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
