// Giữ số luồng SSE CÔNG KHAI đang mở trong giới hạn (plan 27). Mỗi luồng giữ một kết nối tới service và một ít RAM của gói
// free; người xem công khai không cần đăng nhập nên một địa chỉ không được mở hàng trăm luồng (nhiều tab, hoặc cố ý).
// `perIp` chặn từng địa chỉ, `total` chặn cả hệ thống. Không biết địa chỉ (req.ip rỗng) thì chỉ tính vào `total`.
// Chạy trong bộ nhớ của MỘT process — đúng với cách chạy hiện nay (một container).

const createStreamGuard = ({ perIp = 8, total = 300 } = {}) => {
  const byIp = new Map();
  let open = 0;

  /** Trả hàm `release` (gọi mấy lần cũng chỉ trả chỗ một lần), hoặc null nếu hết chỗ. */
  const acquire = (ip) => {
    const key = ip || null;
    if (open >= total) return null;
    if (key && (byIp.get(key) || 0) >= perIp) return null;
    open += 1;
    if (key) byIp.set(key, (byIp.get(key) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      open -= 1;
      if (key) {
        const left = (byIp.get(key) || 1) - 1;
        if (left <= 0) byIp.delete(key);
        else byIp.set(key, left);
      }
    };
  };

  return { acquire, size: () => open, sizeFor: (ip) => byIp.get(ip) || 0 };
};

module.exports = { createStreamGuard };
