const { EventEmitter } = require('events');
const { stream, HEARTBEAT_MS, HEARTBEAT_FRAME, MAX_CONNECTION_MS } = require('../src/controllers/realtimeController');
const realtimeBus = require('../src/utils/realtimeBus');

const makeRes = () => ({ writeHead: jest.fn(), write: jest.fn(), end: jest.fn() });

describe('SSE /realtime/stream — heartbeat (RUN-01)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('gửi sự kiện ping mỗi 25 giây (proxy không cắt kết nối rảnh, client biết kết nối còn sống)', () => {
    const req = new EventEmitter();
    req.branchId = 1;
    const res = makeRes();

    stream(req, res);
    expect(res.write).toHaveBeenCalledWith(':ok\n\n');

    jest.advanceTimersByTime(HEARTBEAT_MS * 3);
    const pings = res.write.mock.calls.filter(([chunk]) => chunk === HEARTBEAT_FRAME);
    expect(HEARTBEAT_MS).toBe(25000);
    // Sự kiện có tên — EventSource nuốt dòng comment ':' nên client không thấy được.
    expect(HEARTBEAT_FRAME).toBe('event: ping\ndata: {}\n\n');
    expect(pings).toHaveLength(3);
    req.emit('close');
  });

  test('client đóng kết nối → dừng heartbeat và bỏ đăng ký sự kiện', () => {
    const req = new EventEmitter();
    req.branchId = 1;
    const res = makeRes();

    stream(req, res);
    req.emit('close');
    res.write.mockClear();

    jest.advanceTimersByTime(HEARTBEAT_MS * 2);
    realtimeBus.emit('court:updated', { branchId: 1 });
    expect(res.write).not.toHaveBeenCalled();
  });

  test('vẫn tự đóng sau 20 phút (client mở lại bằng token mới), không còn ping sau đó', () => {
    const req = new EventEmitter();
    req.branchId = 1;
    const res = makeRes();

    stream(req, res);
    jest.advanceTimersByTime(MAX_CONNECTION_MS);
    expect(res.end).toHaveBeenCalledTimes(1);
    res.write.mockClear();
    jest.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(res.write).not.toHaveBeenCalled();
  });

  test('chỉ nhận sự kiện đúng chi nhánh của kết nối', () => {
    const req = new EventEmitter();
    req.branchId = 2;
    const res = makeRes();

    stream(req, res);
    realtimeBus.emit('court:updated', { branchId: 1 });
    realtimeBus.emit('court:updated', { branchId: 2, courtId: 9 });
    const events = res.write.mock.calls.map(([c]) => c).filter((c) => c.startsWith('data:'));
    expect(events).toEqual([`data: ${JSON.stringify({ branchId: 2, courtId: 9 })}\n\n`]);
    req.emit('close');
  });
});
