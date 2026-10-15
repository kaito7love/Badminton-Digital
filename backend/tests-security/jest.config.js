// Kiểm thử bảo mật cần DB (kế hoạch 32 §11.2, tầng 2). KHÔNG chạy trong `npm test`.
// Chạy: DB_NAME_TEST=<db đã migrate + seed, tên có chữ "test"> npm run test:security
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/*.security.test.js'],
  setupFiles: ['<rootDir>/env.js'],
  testTimeout: 60000,
  maxWorkers: 1
};
