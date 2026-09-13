const express = require('express');
const request = require('supertest');
const { checkoutRules, webhookRules } = require('../src/validations/paymentValidation');

const createApp = (rules) => {
  const app = express();
  app.use(express.json());
  app.post('/test', rules, (req, res) => res.status(200).json(req.body));
  return app;
};

describe('payment webhook validation', () => {
  const valid = { provider: 'vietqr', providerReference: 'TXN-001', invoiceNo: 'BD-1-00000001', amount: 25000, status: 'paid' };

  it('rejects a webhook without a provider reference', async () => {
    const { providerReference, ...body } = valid;
    const response = await request(createApp(webhookRules)).post('/test').send(body);

    expect(response.status).toBe(400);
  });

  it('accepts a paid webhook with the required correlation fields', async () => {
    const response = await request(createApp(webhookRules)).post('/test').send(valid);

    expect(response.status).toBe(200);
  });

  it('bắt buộc số tiền đã nhận, là số nguyên dương', async () => {
    const { amount, ...withoutAmount } = valid;
    const app = createApp(webhookRules);

    expect((await request(app).post('/test').send(withoutAmount)).status).toBe(400);
    expect((await request(app).post('/test').send({ ...valid, amount: 0 })).status).toBe(400);
    expect((await request(app).post('/test').send({ ...valid, amount: 25000.5 })).status).toBe(400);
  });

  it('số tiền gửi dạng chuỗi được đổi thành số', async () => {
    const response = await request(createApp(webhookRules)).post('/test').send({ ...valid, amount: '25000' });

    expect(response.status).toBe(200);
    expect(response.body.amount).toBe(25000);
  });
});

describe('payment checkout validation', () => {
  const base = { sessionId: 12, paymentMethod: 'cash' };

  it('chuỗi "false" của isDiscountPercent là giảm theo số tiền, không phải %', async () => {
    const response = await request(createApp(checkoutRules)).post('/test').send({ ...base, discountAmount: '50', isDiscountPercent: 'false' });

    expect(response.status).toBe(200);
    expect(response.body.isDiscountPercent).toBe(false);
    expect(response.body.discountAmount).toBe(50);
  });

  it('true dạng boolean hay chuỗi đều là giảm theo %', async () => {
    const app = createApp(checkoutRules);

    expect((await request(app).post('/test').send({ ...base, discountAmount: 10, isDiscountPercent: true })).body.isDiscountPercent).toBe(true);
    expect((await request(app).post('/test').send({ ...base, discountAmount: 10, isDiscountPercent: 'true' })).body.isDiscountPercent).toBe(true);
  });

  it('giảm theo % quá 100 thì 400', async () => {
    const response = await request(createApp(checkoutRules)).post('/test').send({ ...base, discountAmount: 150, isDiscountPercent: true });

    expect(response.status).toBe(400);
  });

  it('isDiscountPercent không phải true/false thì 400', async () => {
    const response = await request(createApp(checkoutRules)).post('/test').send({ ...base, discountAmount: 10, isDiscountPercent: 'yes please' });

    expect(response.status).toBe(400);
  });

  it('lý do giảm giá tối đa 200 ký tự', async () => {
    const app = createApp(checkoutRules);

    expect((await request(app).post('/test').send({ ...base, discountAmount: 1000, discountReason: 'x'.repeat(200) })).status).toBe(200);
    expect((await request(app).post('/test').send({ ...base, discountAmount: 1000, discountReason: 'x'.repeat(201) })).status).toBe(400);
  });

  it('endTime phải là mốc ISO 8601', async () => {
    const app = createApp(checkoutRules);

    expect((await request(app).post('/test').send({ ...base, endTime: '2026-09-13T09:30:00.000Z' })).status).toBe(200);
    expect((await request(app).post('/test').send({ ...base, endTime: 'hom qua' })).status).toBe(400);
  });
});
