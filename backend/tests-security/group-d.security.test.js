// Kế hoạch 37, nhóm D — R15 trên app thật: khách tối đa 3 giờ/lượt, nhân viên không giới hạn.
const { api, bearer, sequelize, registerCustomer, unique, tokenFor } = require('./helpers');

afterAll(async () => { await sequelize.close(); });

const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + n * 86400000));
const pad = (n) => String(n).padStart(2, '0');

describe('R15: độ dài một lượt đặt', () => {
  let customer;
  let courtId;
  beforeAll(async () => {
    customer = await registerCustomer(unique());
    const courts = await api().get('/api/v1/public/courts?branchId=1');
    courtId = (courts.body.data.courts || courts.body.data)[0].id;
  });

  const book = (who, startHour, endHour, date) => api().post('/api/v1/bookings').set('Authorization', who)
    .send({ courtId, bookingDate: date, startTime: `${pad(startHour)}:00`, endTime: `${pad(endHour)}:00` });

  test('khách đặt 6 giờ liền bị 400 với thông điệp rõ', async () => {
    const res = await book(`Bearer ${tokenFor(customer)}`, 6, 12, day(5));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/tối đa 3 giờ/);
  });

  test('khách đặt đúng 3 giờ được nhận (dò khung trống)', async () => {
    // DB thử dùng lại nhiều lần nên lịch có thể dày, và POST của khách bị giới hạn 20 lượt/10 phút (kế hoạch 42):
    // chọn khung 3 giờ liền còn trống từ lưới công khai (GET không bị giới hạn) rồi đặt đúng một lần.
    let res;
    for (let offset = 6; offset <= 12 && !(res && res.status === 201); offset += 1) {
      const grid = await api().get(`/api/v1/public/availability/day?branchId=1&date=${day(offset)}`);
      const court = (grid.body.data.courts || []).find((c) => (c.courtId ?? c.id) === courtId);
      const free = new Set((court?.slots || []).filter((c) => c.state === 'free').map((c) => Number(String(c.start || c.startTime).slice(0, 2))));
      for (let startHour = 6; startHour <= 18 && !(res && res.status === 201); startHour += 1) {
        if (!free.has(startHour) || !free.has(startHour + 1) || !free.has(startHour + 2)) continue;
        res = await book(`Bearer ${tokenFor(customer)}`, startHour, startHour + 3, day(offset));
      }
    }
    expect(res.status).toBe(201);
  });

  test('nhân viên đặt 6 giờ cho khách quầy vẫn được (dò ngày/khung còn trống)', async () => {
    let res;
    for (let offset = 7; offset <= 13 && !(res && res.status === 201); offset += 1) {
      for (let start = 6; start <= 16 && !(res && res.status === 201); start += 1) {
        res = await api().post('/api/v1/bookings').set('Authorization', bearer('employeeCn1')).send({
          courtId, bookingDate: day(offset), startTime: `${pad(start)}:00`, endTime: `${pad(start + 6)}:00`,
          customerName: 'Khách quầy R15', customerPhone: unique()
        });
      }
    }
    expect(res.status).toBe(201);
  });
});
