/**
 * Event bus dùng chung cho mọi luồng realtime (SSE) — bọc EventEmitter có
 * sẵn của Node, không cần thư viện ngoài, chỉ 1 module dùng chung giữa nơi
 * phát sự kiện (services, sau khi transaction commit) và nơi lắng nghe
 * (route SSE). Cùng khuôn với `frontend/src/services/authEvents.js`.
 *
 * CHỈ hoạt động đúng khi có đúng 1 tiến trình backend đang chạy (khớp
 * docker-compose hiện tại — 1 container backend). Nếu sau này chạy nhiều
 * bản sao song song để chịu tải cao hơn, thiết bị A thao tác trúng bản sao
 * 1 nhưng thiết bị B giữ kết nối SSE với bản sao 2 sẽ KHÔNG nhận được sự
 * kiện — phải đổi sang cơ chế phát sự kiện dùng chung giữa các tiến trình
 * (VD Redis pub/sub) trước khi scale ngang.
 */
const { EventEmitter } = require('events');

const bus = new EventEmitter();
// Mỗi kết nối SSE đang mở là 1 listener — không giới hạn số kết nối đồng
// thời bằng cảnh báo MaxListeners mặc định (10) của Node.
bus.setMaxListeners(0);

/** Bắn sự kiện — chỉ gọi SAU KHI transaction đã commit thành công. */
const emit = (eventName, payload) => {
  bus.emit(eventName, payload);
};

/** Đăng ký lắng nghe — trả về hàm huỷ đăng ký, gọi khi kết nối SSE đóng. */
const subscribe = (eventName, handler) => {
  bus.on(eventName, handler);
  return () => bus.off(eventName, handler);
};

module.exports = { emit, subscribe };
