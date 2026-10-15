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
    let res;
    for (let start = 6; start <= 18 && !(res && res.status === 201); start += 1) {
      res = await book(`Bearer ${tokenFor(customer)}`, start, start + 3, day(6));
    }
    expect(res.status).toBe(201);
  });

  test('nhân viên đặt 6 giờ cho khách quầy vẫn được', async () => {
    let res;
    for (let start = 6; start <= 16 && !(res && res.status === 201); start += 1) {
      res = await api().post('/api/v1/bookings').set('Authorization', bearer('employeeCn1')).send({
        courtId, bookingDate: day(7), startTime: `${pad(start)}:00`, endTime: `${pad(start + 6)}:00`,
        customerName: 'Khách quầy R15', customerPhone: unique()
      });
    }
    expect(res.status).toBe(201);
  });
});
