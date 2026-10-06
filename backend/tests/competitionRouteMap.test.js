const { matchRoute } = require('../src/integrations/competition/routeMap');

describe('danh sách cho phép của cổng competition', () => {
  test.each([
    ['GET', '/me'],
    ['PATCH', '/me'],
    ['POST', '/me/assessments'],
    ['PUT', '/players/by-ref/bd:customer:12'],
    ['GET', '/rubrics/current'],
    ['POST', '/assessments/abc/confirm'],
    ['GET', '/leaderboards/rating'],
    ['POST', '/matchmaking/bracket'],
    ['PUT', '/matches/0198-abc/result'],
    ['POST', '/matches/0198-abc/live/rallies'],
    ['POST', '/tournaments/0198-abc/knockout'],
    ['DELETE', '/tournaments/0198-abc/entries/77'],
    ['GET', '/sessions/0198-abc/board'],
    ['GET', '/public/tournaments'],
    ['GET', '/public/tournaments/0198-abc/entries'],
    ['GET', '/public/sessions/0198-abc/board'],
    ['POST', '/me/tournaments/0198-abc/entries'],
    ['DELETE', '/me/tournaments/0198-abc/entries'],
    ['GET', '/me/partners']
  ])('%s %s → chuyển tiếp', (method, path) => {
    expect(matchRoute(method, path)).not.toBeNull();
  });

  test.each([
    ['POST', '/events', 'sự kiện nội bộ'],
    ['GET', '/ops/outbox', 'vận hành'],
    ['POST', '/ops/outbox/1/replay', 'vận hành'],
    ['POST', '/players/0198-abc/assessments/ai', 'dịch vụ phân tích video'],
    ['GET', '/health/ready', 'không phải tài nguyên'],
    ['GET', '/admin', 'đường lạ'],
    ['GET', '/', 'rỗng'],
    ['GET', '', 'rỗng'],
    ['GET', '/tournaments/../ops/outbox', 'đi lùi thư mục'],
    ['GET', '/tournaments/%2e%2e/ops/outbox', 'đi lùi mã hoá'],
    ['GET', '/tournaments%2f..%2fops', 'gạch chéo mã hoá'],
    ['GET', '/tournaments//x', 'hai dấu /'],
    ['GET', '/tournaments/x y', 'ký tự lạ'],
    ['GET', '/tournaments/x\\y', 'gạch chéo ngược'],
    ['OPTIONS', '/tournaments', 'method lạ'],
    ['TRACE', '/tournaments', 'method lạ'],
    ['HEAD', '/tournaments', 'method lạ'],
    ['POST', '/public/tournaments', 'trang công khai chỉ đọc'],
    ['PUT', '/public/tournaments/abc', 'trang công khai chỉ đọc'],
    ['PATCH', '/public/sessions/abc', 'trang công khai chỉ đọc'],
    ['DELETE', '/public/tournaments/abc', 'trang công khai chỉ đọc'],
    ['GET', '/public', 'thiếu tài nguyên'],
    ['GET', '/public/%2e%2e/ops/outbox', 'đi lùi mã hoá']
  ])('%s %s → chặn (%s)', (method, path) => {
    expect(matchRoute(method, path)).toBeNull();
  });

  test('chỉ vài GET công khai: BXH trình độ / thành tích và hồ sơ công khai', () => {
    expect(matchRoute('GET', '/leaderboards/rating').isPublic).toBe(true);
    expect(matchRoute('GET', '/leaderboards/points').isPublic).toBe(true);
    expect(matchRoute('GET', '/players/0198-abc/public').isPublic).toBe(true);
    for (const [method, path] of [
      ['POST', '/leaderboards/rating'],
      ['GET', '/leaderboards'],
      ['GET', '/leaderboards/other'],
      ['GET', '/players/0198-abc'],
      ['GET', '/players/0198-abc/stats'],
      ['GET', '/tournaments'],
      ['GET', '/me']
    ]) {
      const route = matchRoute(method, path);
      expect(route && route.isPublic).toBeFalsy();
    }
  });

  test('trang công khai: mọi GET /public/<tài nguyên> không cần đăng nhập, kể cả luồng SSE của nó', () => {
    for (const path of ['/public/tournaments', '/public/tournaments/abc', '/public/tournaments/abc/matches', '/public/sessions/abc/board', '/public/sessions']) {
      expect(matchRoute('GET', path)).toMatchObject({ resource: 'public', isPublic: true, isStream: false });
    }
    expect(matchRoute('GET', '/public/tournaments/abc/stream')).toMatchObject({ resource: 'public', isPublic: true, isStream: true });
    expect(matchRoute('GET', '/tournaments/abc/stream').resource).toBe('tournaments'); // luồng nhân viên: không thuộc nhóm công khai
  });

  test('nhận ra luồng SSE (chỉ GET …/stream)', () => {
    expect(matchRoute('GET', '/tournaments/abc/stream').isStream).toBe(true);
    expect(matchRoute('GET', '/sessions/abc/stream').isStream).toBe(true);
    expect(matchRoute('POST', '/sessions/abc/stream').isStream).toBe(false);
    expect(matchRoute('GET', '/tournaments/abc').isStream).toBe(false);
  });
});
