const express = require('express');
const request = require('supertest');
const {
  createVoucherRules,
  updateVoucherRules,
  voucherIdRules,
  previewVoucherRules
} = require('../src/validations/voucherValidation');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.post('/vouchers', createVoucherRules, (req, res) => res.status(201).end());
  app.put('/vouchers/:id', updateVoucherRules, (req, res) => res.status(200).end());
  app.get('/vouchers/:id', voucherIdRules, (req, res) => res.status(200).end());
  app.post('/vouchers/preview', previewVoucherRules, (req, res) => res.status(200).end());
  return app;
};

const validVoucher = () => ({
  code: 'SALE10',
  discountType: 'percent',
  discountValue: 10,
  minOrderAmount: 100000,
  usageLimit: 100,
  perCustomerLimit: 1
});

describe('createVoucherRules', () => {
  it('chấp nhận một mã hợp lệ đầy đủ trường', async () => {
    const response = await request(createApp()).post('/vouchers').send(validVoucher());
    expect(response.status).toBe(201);
  });

  it('chấp nhận mã giảm cứng (flat) không cần maxDiscountAmount', async () => {
    const response = await request(createApp())
      .post('/vouchers')
      .send({ code: 'FLAT20K', discountType: 'flat', discountValue: 20000 });
    expect(response.status).toBe(201);
  });

  it('từ chối khi thiếu code', async () => {
    const { code, ...payload } = validVoucher();
    const response = await request(createApp()).post('/vouchers').send(payload);
    expect(response.status).toBe(400);
  });

  it('từ chối discountType không thuộc percent/flat', async () => {
    const response = await request(createApp())
      .post('/vouchers')
      .send({ ...validVoucher(), discountType: 'gift' });
    expect(response.status).toBe(400);
  });

  it('từ chối discountValue âm', async () => {
    const response = await request(createApp())
      .post('/vouchers')
      .send({ ...validVoucher(), discountValue: -5 });
    expect(response.status).toBe(400);
  });

  it('từ chối startsAt không phải định dạng ngày ISO', async () => {
    const response = await request(createApp())
      .post('/vouchers')
      .send({ ...validVoucher(), startsAt: 'hôm qua' });
    expect(response.status).toBe(400);
  });

  it('từ chối usageLimit nhỏ hơn 1', async () => {
    const response = await request(createApp())
      .post('/vouchers')
      .send({ ...validVoucher(), usageLimit: 0 });
    expect(response.status).toBe(400);
  });
});

describe('updateVoucherRules', () => {
  it('chấp nhận cập nhật một phần (chỉ đổi isActive)', async () => {
    const response = await request(createApp()).put('/vouchers/1').send({ isActive: false });
    expect(response.status).toBe(200);
  });

  it('từ chối id không phải số nguyên', async () => {
    const response = await request(createApp()).put('/vouchers/abc').send({ isActive: false });
    expect(response.status).toBe(400);
  });

  it('từ chối discountValue âm khi cập nhật', async () => {
    const response = await request(createApp()).put('/vouchers/1').send({ discountValue: -1 });
    expect(response.status).toBe(400);
  });
});

describe('voucherIdRules', () => {
  it('chấp nhận id là số nguyên dương', async () => {
    const response = await request(createApp()).get('/vouchers/7');
    expect(response.status).toBe(200);
  });

  it('từ chối id không phải số', async () => {
    const response = await request(createApp()).get('/vouchers/abc');
    expect(response.status).toBe(400);
  });
});

describe('previewVoucherRules', () => {
  it('chấp nhận code và orderAmount hợp lệ', async () => {
    const response = await request(createApp()).post('/vouchers/preview').send({ code: 'SALE10', orderAmount: 200000 });
    expect(response.status).toBe(200);
  });

  it('từ chối khi thiếu code', async () => {
    const response = await request(createApp()).post('/vouchers/preview').send({ orderAmount: 200000 });
    expect(response.status).toBe(400);
  });

  it('từ chối orderAmount âm', async () => {
    const response = await request(createApp()).post('/vouchers/preview').send({ code: 'SALE10', orderAmount: -1 });
    expect(response.status).toBe(400);
  });
});
