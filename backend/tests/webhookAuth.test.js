const express = require('express');
const request = require('supertest');
const paymentWebhookAuth = require('../src/middleware/paymentWebhookAuth');
const { webhookRules } = require('../src/validations/paymentValidation');

const SECRET = 'webhook-secret-used-only-in-tests-0123456789';
const BODY = { provider: 'sepay', providerReference: 'FT26091300001', invoiceNo: 'BD-1-00000001', amount: 25000, status: 'paid' };

// Cùng thứ tự middleware với paymentRoutes: secret trước, validation sau.
const createApp = () => {
  const app = express();
  app.use(express.json());
  app.post('/webhook', paymentWebhookAuth, webhookRules, (req, res) => res.status(200).json({ amount: req.body.amount }));
  return app;
};

describe('POST /payments/webhook — secret', () => {
  let saved;
  beforeEach(() => {
    saved = process.env.PAYMENT_WEBHOOK_SECRET;
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
    else process.env.PAYMENT_WEBHOOK_SECRET = saved;
  });

  test('server chưa cấu hình secret thì đóng hẳn (503), không còn "không đặt secret thì cho qua"', async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const response = await request(createApp()).post('/webhook').send(BODY);

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
  });

  test('secret ngắn hơn 32 ký tự bị coi như chưa cấu hình', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'short-secret';
    const response = await request(createApp()).post('/webhook').set('X-Webhook-Secret', 'short-secret').send(BODY);

    expect(response.status).toBe(503);
  });

  test('thiếu header thì 401 — chưa tới validation nên không lộ hợp đồng body', async () => {
    const response = await request(createApp()).post('/webhook').send({});

    expect(response.status).toBe(401);
    expect(response.body.errors).toBeNull();
  });

  test('sai secret thì 401', async () => {
    const response = await request(createApp()).post('/webhook').set('X-Webhook-Secret', `${SECRET}x`).send(BODY);

    expect(response.status).toBe(401);
  });

  test('đúng secret nhưng thiếu số tiền thì 400', async () => {
    const { amount, ...withoutAmount } = BODY;
    const response = await request(createApp()).post('/webhook').set('X-Webhook-Secret', SECRET).send(withoutAmount);

    expect(response.status).toBe(400);
    expect(response.body.errors.map((e) => e.field)).toContain('amount');
  });

  test('đúng secret, đủ trường thì qua', async () => {
    const response = await request(createApp()).post('/webhook').set('X-Webhook-Secret', SECRET).send(BODY);

    expect(response.status).toBe(200);
    expect(response.body.amount).toBe(25000);
  });
});
