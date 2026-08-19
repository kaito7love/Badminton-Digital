const express = require('express');
const request = require('supertest');
const { placeOrderRules, orderIdRules } = require('../src/validations/onlineOrderValidation');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.post('/my-orders', placeOrderRules, (req, res) => res.status(201).end());
  app.get('/my-orders/:id', orderIdRules, (req, res) => res.status(200).end());
  return app;
};

const validPayload = () => ({
  branchId: 1,
  items: [{ variantId: 3, quantity: 2 }],
  contactName: 'Nguyễn Minh Khôi',
  contactPhone: '0912345678',
  customerNote: 'Chiều nay 18h mình qua lấy.'
});

describe('placeOrderRules', () => {
  it('chấp nhận một đơn hợp lệ đầy đủ trường', async () => {
    const response = await request(createApp()).post('/my-orders').send(validPayload());
    expect(response.status).toBe(201);
  });

  it('chấp nhận đơn không có ghi chú — trường tuỳ chọn', async () => {
    const { customerNote, ...payload } = validPayload();
    const response = await request(createApp()).post('/my-orders').send(payload);
    expect(response.status).toBe(201);
  });

  it('từ chối khi thiếu branchId', async () => {
    const { branchId, ...payload } = validPayload();
    const response = await request(createApp()).post('/my-orders').send(payload);
    expect(response.status).toBe(400);
  });

  it('từ chối giỏ hàng trống', async () => {
    const response = await request(createApp()).post('/my-orders').send({ ...validPayload(), items: [] });
    expect(response.status).toBe(400);
  });

  it('từ chối giỏ hàng quá 50 dòng', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ variantId: i + 1, quantity: 1 }));
    const response = await request(createApp()).post('/my-orders').send({ ...validPayload(), items });
    expect(response.status).toBe(400);
  });

  it('từ chối số lượng vượt quá 99', async () => {
    const response = await request(createApp())
      .post('/my-orders')
      .send({ ...validPayload(), items: [{ variantId: 3, quantity: 100 }] });
    expect(response.status).toBe(400);
  });

  it('từ chối số lượng bằng 0', async () => {
    const response = await request(createApp())
      .post('/my-orders')
      .send({ ...validPayload(), items: [{ variantId: 3, quantity: 0 }] });
    expect(response.status).toBe(400);
  });

  it('từ chối tên người nhận để trống', async () => {
    const response = await request(createApp()).post('/my-orders').send({ ...validPayload(), contactName: '  ' });
    expect(response.status).toBe(400);
  });

  it('từ chối số điện thoại không hợp lệ', async () => {
    const response = await request(createApp()).post('/my-orders').send({ ...validPayload(), contactPhone: 'abc' });
    expect(response.status).toBe(400);
  });

  it('chấp nhận số điện thoại có định dạng +84', async () => {
    const response = await request(createApp())
      .post('/my-orders')
      .send({ ...validPayload(), contactPhone: '+84912345678' });
    expect(response.status).toBe(201);
  });

  it('từ chối ghi chú vượt quá 500 ký tự', async () => {
    const response = await request(createApp())
      .post('/my-orders')
      .send({ ...validPayload(), customerNote: 'a'.repeat(501) });
    expect(response.status).toBe(400);
  });

  it('không có paymentMethod thì vẫn hợp lệ — mặc định tiền mặt ở tầng service', async () => {
    const response = await request(createApp()).post('/my-orders').send(validPayload());
    expect(response.status).toBe(201);
  });

  it('chấp nhận paymentMethod là transfer', async () => {
    const response = await request(createApp())
      .post('/my-orders')
      .send({ ...validPayload(), paymentMethod: 'transfer' });
    expect(response.status).toBe(201);
  });

  it('từ chối paymentMethod không thuộc cash/transfer', async () => {
    const response = await request(createApp())
      .post('/my-orders')
      .send({ ...validPayload(), paymentMethod: 'momo' });
    expect(response.status).toBe(400);
  });
});

describe('orderIdRules', () => {
  it('chấp nhận mã đơn là số nguyên dương', async () => {
    const response = await request(createApp()).get('/my-orders/42');
    expect(response.status).toBe(200);
  });

  it('từ chối mã đơn không phải số', async () => {
    const response = await request(createApp()).get('/my-orders/abc');
    expect(response.status).toBe(400);
  });
});
