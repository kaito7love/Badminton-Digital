// Chạy trước mọi test: ép môi trường test, cổng ngẫu nhiên, tắt SMTP, và từ chối chạy nếu DB không giống DB thử.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.MAIL_HOST = '127.0.0.1';
process.env.MAIL_PORT = '2';
const dbName = process.env.DB_NAME_TEST || 'badminton_digital_management_test';
if (!/test/i.test(dbName)) {
  throw new Error(`tests-security từ chối chạy: DB "${dbName}" không có chữ "test" trong tên (các test này tạo/sửa dữ liệu).`);
}
