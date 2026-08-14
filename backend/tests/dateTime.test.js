const { localDateString, localTimeString, startOfLocalDay, endOfLocalDay } = require('../src/utils/dateTime');

describe('dateTime — mốc thời gian theo giờ địa phương', () => {
  test('localDateString lấy ngày theo giờ máy, không theo UTC', () => {
    // 01:30 sáng giờ +07 vẫn là 18:30 hôm trước theo UTC. Cắt chuỗi ISO sẽ ra
    // ngày hôm trước, còn hàm này phải trả về đúng ngày mà nhân viên đang thấy.
    const d = new Date(2026, 7, 15, 1, 30, 0); // 15/08/2026 01:30 giờ địa phương
    expect(localDateString(d)).toBe('2026-08-15');
  });

  test('localDateString đệm 0 cho tháng và ngày một chữ số', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('localTimeString trả về HH:mm:ss so được với cột TIME', () => {
    expect(localTimeString(new Date(2026, 7, 15, 9, 5, 3))).toBe('09:05:03');
  });

  test('startOfLocalDay và endOfLocalDay bọc trọn một ngày địa phương', () => {
    const giua = new Date(2026, 7, 15, 13, 45, 12);
    const dau = startOfLocalDay(giua);
    const cuoi = endOfLocalDay(giua);

    expect(dau.getHours()).toBe(0);
    expect(dau.getMinutes()).toBe(0);
    expect(cuoi.getHours()).toBe(23);
    expect(cuoi.getMinutes()).toBe(59);
    expect(dau <= giua && giua <= cuoi).toBe(true);
    expect(localDateString(dau)).toBe(localDateString(cuoi));
  });

  test('không làm thay đổi Date được truyền vào', () => {
    const goc = new Date(2026, 7, 15, 13, 45, 12);
    const truoc = goc.getTime();
    startOfLocalDay(goc);
    endOfLocalDay(goc);
    expect(goc.getTime()).toBe(truoc);
  });
});
