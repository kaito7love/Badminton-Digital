const { subscribe } = require('../utils/realtimeBus');

// Đóng chủ động sau ~20 phút — khớp vòng đời access token (15 phút) cộng
// biên an toàn, buộc client tự mở lại bằng token mới thay vì giữ 1 kết nối
// sống mãi bằng quyền của lúc mở kết nối (mục (d), RealtimeCourtSync.md).
const MAX_CONNECTION_MS = 20 * 60 * 1000;

/**
 * SSE dùng chung cho mọi loại sự kiện realtime, lọc theo branchId của kết
 * nối — không route riêng cho từng loại sự kiện, thêm loại mới (đặt sân,
 * kho...) chỉ cần bên phát sự kiện gọi `realtimeBus.emit(tênMới, payload)`,
 * không cần sửa gì ở đây.
 */
const stream = (req, res) => {
  if (!req.branchId) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Không xác định được chi nhánh để theo dõi realtime.',
      errors: null
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // Tắt buffering nếu sau này chạy sau Nginx — không có tác dụng gì khi
    // chạy trực tiếp (dev/docker-compose hiện tại), vô hại để sẵn ở đây.
    'X-Accel-Buffering': 'no'
  });
  // Dòng comment SSE (bắt đầu bằng ':') mở kết nối ngay lập tức thay vì im
  // lặng chờ sự kiện đầu tiên — tránh timeout ở proxy/trình duyệt.
  res.write(':ok\n\n');

  const branchId = req.branchId;
  const send = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const unsubscribeCourtUpdated = subscribe('court:updated', (payload) => {
    if (payload.branchId === branchId) send('court:updated', payload);
  });

  const closeTimer = setTimeout(() => res.end(), MAX_CONNECTION_MS);

  req.on('close', () => {
    clearTimeout(closeTimer);
    unsubscribeCourtUpdated();
  });
};

module.exports = { stream };
