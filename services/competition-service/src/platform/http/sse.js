// Luồng Server-Sent Events cho màn hình TV (plan 19, docs/02 mục 2.9). Cách chạy giống SSE
// của app chính (backend/src/controllers/realtimeController.js):
//  - `ping` 25 giây một lần: proxy không cắt kết nối im lặng, client biết kết nối còn sống;
//  - ĐÓNG KHI TOKEN HẾT HẠN (≤ 5 phút): EventSource tự nối lại, gateway ký token mới → không
//    giữ một kết nối sống mãi bằng quyền của lúc mở;
//  - đóng mọi luồng khi tắt service (server.close chờ hết kết nối rồi mới thoát).
// Không lỡ sự kiện lúc mở: nghe kênh TRƯỚC, tính `snapshot` SAU; sự kiện đến trong lúc đó được
// giữ lại rồi gửi ngay sau snapshot (client bỏ `score` có revision cũ hơn cái đang có).

const HEARTBEAT_MS = 25 * 1000;

const createSse = ({ realtime, heartbeatMs = HEARTBEAT_MS, now = () => Date.now() }) => {
  const connections = new Set();

  const open = async (req, res, { channel, snapshot }) => {
    const pending = [];
    let streaming = false;
    let closed = false;
    let heartbeat = null;
    let expiry = null;
    const write = (event, data) => {
      if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const unsubscribe = realtime.subscribe(channel, (event, data) => (streaming ? write(event, data) : pending.push([event, data])));
    const conn = {};
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(expiry);
      unsubscribe();
      connections.delete(conn);
    };
    conn.close = () => {
      cleanup();
      if (!res.writableEnded) res.end();
    };
    // Nghe `close` của RESPONSE (kết nối đóng / client ngắt), không phải của request: từ Node 16,
    // request có thể phát `close` ngay sau khi đọc xong body, trong khi luồng vẫn đang mở.
    res.on('close', cleanup);

    let first;
    try {
      first = await snapshot();
    } catch (err) {
      cleanup();
      throw err;
    }
    if (closed) return; // client đã ngắt trong lúc tính snapshot

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tắt đệm nếu chạy sau Nginx (gateway / proxy) — như SSE của app chính.
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    write('snapshot', first);
    streaming = true;
    for (const [event, data] of pending.splice(0)) write(event, data);

    heartbeat = setInterval(() => write('ping', {}), heartbeatMs);
    if (req.auth && req.auth.exp) expiry = setTimeout(conn.close, Math.max(0, req.auth.exp * 1000 - now()));
    connections.add(conn);
  };

  const closeAll = () => {
    for (const conn of [...connections]) conn.close();
  };

  return { open, closeAll, size: () => connections.size };
};

module.exports = { createSse, HEARTBEAT_MS };
