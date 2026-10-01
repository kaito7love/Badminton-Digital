// Phát / nghe sự kiện realtime cho màn hình TV (plan 19, docs/01 mục 9). Mỗi kênh là một
// ngữ cảnh trận: (tenant, giải | buổi giao lưu, id). Sự kiện:
//   score — tỉ số một trận vừa đổi (bấm điểm / hoàn tác)
//   board — sân / trận / hàng chờ vừa đổi → client tải lại màn hình lớn
//
// GIỚI HẠN: phát trong bộ nhớ của MỘT process — đúng khi service chạy một bản (mọi cách
// triển khai hiện có). Chạy nhiều bản thì cần pub/sub ngoài (Redis) hoặc cho luồng tự đọc
// DB; không đổi gì cho phía client.

const createRealtime = ({ logger } = {}) => {
  const channels = new Map();

  const key = (tenant, contextType, contextId) => `${tenant}|${contextType}|${contextId}`;

  const subscribe = (channel, listener) => {
    if (!channels.has(channel)) channels.set(channel, new Set());
    channels.get(channel).add(listener);
    return () => {
      const set = channels.get(channel);
      if (!set) return;
      set.delete(listener);
      if (!set.size) channels.delete(channel);
    };
  };

  const publish = (channel, event, data) => {
    for (const listener of channels.get(channel) || []) {
      try {
        listener(event, data);
      } catch (err) {
        if (logger) logger.warn({ channel, event, err: err.message }, 'realtime listener lỗi');
      }
    }
  };

  // Chỉ phát SAU KHI transaction commit — client không bao giờ thấy dữ liệu chưa lưu (rollback
  // thì không phát gì). `board` gộp lại một lần cho mỗi (transaction, kênh): một thao tác có
  // thể đi qua nhiều hook (ghi kết quả → nhả sân → trả người về hàng chờ).
  const afterCommit = (transaction, channel, event, data) => {
    if (!transaction) return publish(channel, event, data);
    if (event === 'board') {
      if (!transaction.realtimeBoards) transaction.realtimeBoards = new Set();
      if (transaction.realtimeBoards.has(channel)) return undefined;
      transaction.realtimeBoards.add(channel);
    }
    return transaction.afterCommit(() => publish(channel, event, data));
  };

  const boardChanged = (transaction, { tenant, contextType, contextId, reason }) =>
    afterCommit(transaction, key(tenant, contextType, contextId), 'board', { reason });

  const listenerCount = (channel) => (channel ? (channels.get(channel) || new Set()).size : [...channels.values()].reduce((n, s) => n + s.size, 0));

  return { key, subscribe, publish, afterCommit, boardChanged, listenerCount };
};

module.exports = { createRealtime };
