const { buildEvent, enqueueCustomerUpdated, enqueueCustomerMerged, enqueueCustomerDeleted, customerRef } = require('../src/integrations/competition/outbox');

const identity = { source: 'badminton-digital-core', tenant: 'badminton-digital' };
const fakeModel = () => ({ create: jest.fn(async (row) => row) });
const NOW = new Date('2026-10-05T03:00:00.000Z');

describe('outbox bd.customer.*', () => {
  test('vỏ sự kiện CloudEvents đủ trường, id duy nhất mỗi lần', () => {
    const a = buildEvent({ type: 'bd.customer.deleted', subject: 'customer/9', data: { externalRef: 'bd:customer:9' } }, { identity, now: NOW });
    const b = buildEvent({ type: 'bd.customer.deleted', subject: 'customer/9', data: { externalRef: 'bd:customer:9' } }, { identity, now: NOW });
    expect(a).toMatchObject({
      specversion: '1.0',
      type: 'bd.customer.deleted',
      source: 'badminton-digital-core',
      tenant: 'badminton-digital',
      subject: 'customer/9',
      dataschema: 'bd.customer.deleted/v1',
      time: '2026-10-05T03:00:00.000Z',
      data: { externalRef: 'bd:customer:9' }
    });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
  });

  test('đổi tên: ghi trong transaction truyền vào, kèm version tăng theo updatedAt', async () => {
    const model = fakeModel();
    const transaction = { id: 'tx' };
    await enqueueCustomerUpdated({ id: 12, fullName: 'Nguyễn Văn B', updatedAt: new Date('2026-10-05T01:00:00Z') }, { transaction, model, now: NOW });
    const [row, options] = model.create.mock.calls[0];
    expect(options).toEqual({ transaction });
    expect(row).toMatchObject({ type: 'bd.customer.updated', subject: 'customer/12', status: 'pending', attempts: 0, nextAttemptAt: NOW });
    expect(row.payload.data).toEqual({ externalRef: 'bd:customer:12', fullName: 'Nguyễn Văn B', version: new Date('2026-10-05T01:00:00Z').getTime() });
    expect(row.eventId).toBe(row.payload.id);
  });

  test('gộp: nguồn / đích đúng, subject theo hồ sơ đích', async () => {
    const model = fakeModel();
    await enqueueCustomerMerged({ sourceId: 10, targetId: 20 }, { transaction: {}, model, now: NOW });
    const [row] = model.create.mock.calls[0];
    expect(row.type).toBe('bd.customer.merged');
    expect(row.subject).toBe('customer/20');
    expect(row.payload.data).toEqual({ sourceRef: 'bd:customer:10', targetRef: 'bd:customer:20' });
  });

  test('xoá', async () => {
    const model = fakeModel();
    await enqueueCustomerDeleted(33, { transaction: {}, model, now: NOW });
    expect(model.create.mock.calls[0][0].payload.data).toEqual({ externalRef: 'bd:customer:33' });
  });

  test('lỗi ghi outbox ném ra để transaction của khách rollback (không nuốt lỗi)', async () => {
    const model = { create: jest.fn().mockRejectedValue(new Error('db down')) };
    await expect(enqueueCustomerDeleted(1, { transaction: {}, model })).rejects.toThrow('db down');
  });

  test('mã khách khớp quy ước bd:customer:<id> của service', () => {
    expect(customerRef(5)).toBe('bd:customer:5');
  });
});
