const express = require('express');
const request = require('supertest');
const { webhookRules } = require('../src/validations/paymentValidation');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.post('/webhook', webhookRules, (req, res) => res.status(204).end());
  return app;
};

describe('payment webhook validation', () => {
  it('rejects a webhook without a provider reference', async () => {
    const response = await request(createApp())
      .post('/webhook')
      .send({ provider: 'vietqr', invoiceNo: 'BD-1-00000001', status: 'paid' });

    expect(response.status).toBe(400);
  });

  it('accepts a paid webhook with the required correlation fields', async () => {
    const response = await request(createApp())
      .post('/webhook')
      .send({ provider: 'vietqr', providerReference: 'TXN-001', invoiceNo: 'BD-1-00000001', status: 'paid' });

    expect(response.status).toBe(204);
  });
});
