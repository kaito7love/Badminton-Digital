require('dotenv').config();

// `timezone: '+00:00'` — BẮT BUỘC, đi kèm migration 20260821400001.
// Không đặt thì driver ghi/đọc DATETIME theo giờ LOCAL của tiến trình Node,
// khiến cột chỉ lưu "20:00" mà không kèm múi giờ: dời server sang múi giờ khác
// là toàn bộ dữ liệu cũ bị hiểu sai. Ghim UTC ở tầng lưu trữ, còn việc hiển
// thị và gộp báo cáo thì đổi sang múi giờ của CHI NHÁNH (`branches.timezone`)
// — nhờ vậy server đặt ở đâu cũng cho cùng kết quả, và chi nhánh ở múi giờ
// khác vẫn hiện đúng giờ của nó.
const TIMEZONE = '+00:00';

module.exports = {
  development: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME || 'badminton_digital_management',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    timezone: TIMEZONE,
    logging: console.log,
    define: {
      timestamps: true,
      underscored: true
    },
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
  },
  // CẢNH BÁO: nhánh này CỐ TÌNH không đọc `DB_NAME`.
  //
  // Trước đây là `process.env.DB_NAME || '..._test'`. Vì mọi `.env` thật đều
  // có DB_NAME, vế mặc định không bao giờ chạy tới — `NODE_ENV=test` im lặng
  // trỏ thẳng vào CSDL đang dùng hằng ngày. Hiện chưa nổ vì bộ Jest chỉ là
  // unit test không chạm DB, nhưng Phase 6 đang định thêm integration test
  // bằng Supertest: ngày đó `npm test` sẽ ghi đè dữ liệu thật.
  //
  // Muốn đổi tên CSDL test (vd trên CI) thì đặt biến RIÊNG `DB_NAME_TEST`.
  test: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME_TEST || 'badminton_digital_management_test',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    timezone: TIMEZONE,
    logging: false,
    define: {
      timestamps: true,
      underscored: true
    },
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    timezone: TIMEZONE,
    logging: false,
    define: {
      timestamps: true,
      underscored: true
    },
    // max cao hơn dev vì đây là môi trường có nhiều request đồng thời thật;
    // acquire là thời gian chờ tối đa để "xin" 1 kết nối từ pool trước khi
    // báo lỗi thay vì client bị treo vô thời hạn.
    pool: { max: 20, min: 2, acquire: 30000, idle: 10000 }
  }
};

// Chốt chặn cuối: nếu ai đó đặt DB_NAME_TEST trùng luôn CSDL đang chạy thật
// thì dừng ngay, đừng để `npm test` hay `db:migrate:undo` chạy vào đó rồi mới
// biết. Chỉ so khi cả hai cùng được khai báo — trên CI thường không có DB_NAME.
const testDb = module.exports.test.database;
if (process.env.DB_NAME && testDb === process.env.DB_NAME) {
  throw new Error(
    `Cấu hình nguy hiểm: CSDL test ("${testDb}") trùng với DB_NAME đang dùng thật. ` +
    'Đặt DB_NAME_TEST sang một tên khác trước khi chạy ở NODE_ENV=test.'
  );
}
