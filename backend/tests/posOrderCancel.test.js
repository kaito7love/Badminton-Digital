const SalesOrderService = require('../src/services/SalesOrderService');
const OnlineOrderService = require('../src/services/OnlineOrderService');
const AuditService = require('../src/services/AuditService');
const { SalesOrder, sequelize } = require('../src/models');

const fakeTransaction = () => ({ LOCK: { UPDATE: 'UPDATE' }, finished: undefined, commit: jest.fn().mockResolvedValue(), rollback: jest.fn().mockResolvedValue() });

describe('SalesOrderService.cancelOrder — huỷ đơn tại quầy, hoàn kho (FE-02)', () => {
  let transaction;
  beforeEach(() => {
    transaction = fakeTransaction();
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    jest.spyOn(OnlineOrderService, '_releaseOrder').mockResolvedValue();
    jest.spyOn(AuditService, 'record').mockResolvedValue();
    jest.spyOn(SalesOrderService, 'getOrderById').mockResolvedValue({ id: 7, status: 'cancelled' });
  });
  afterEach(() => jest.restoreAllMocks());

  test('đơn POS đang mở → hoàn kho cả đơn, ghi nhật ký, commit', async () => {
    const order = { id: 7, branchId: 2, status: 'open', lines: [{ id: 1 }, { id: 2 }] };
    const findOne = jest.spyOn(SalesOrder, 'findOne').mockResolvedValue(order);

    const result = await SalesOrderService.cancelOrder(7, { branchId: 2, actor: { id: 5 } });

    expect(findOne.mock.calls[0][0].where).toEqual({ id: 7, channel: 'pos', branchId: 2 });
    expect(OnlineOrderService._releaseOrder).toHaveBeenCalledWith(order, transaction, expect.objectContaining({ branchId: 2 }));
    expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sales_order.cancelled', oldValues: { status: 'open', lines: 2 } }));
    expect(transaction.commit).toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
  });

  test('không thấy (chi nhánh khác, đơn online, sai id) → 404', async () => {
    jest.spyOn(SalesOrder, 'findOne').mockResolvedValue(null);
    await expect(SalesOrderService.cancelOrder(7, { branchId: 1 })).rejects.toMatchObject({ statusCode: 404 });
    expect(OnlineOrderService._releaseOrder).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  test('đơn đã thanh toán / đã huỷ → 400, không đụng kho', async () => {
    for (const status of ['paid', 'cancelled']) {
      jest.spyOn(SalesOrder, 'findOne').mockResolvedValue({ id: 7, status, lines: [] });
      await expect(SalesOrderService.cancelOrder(7, {})).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(OnlineOrderService._releaseOrder).not.toHaveBeenCalled();
  });
});

describe('SalesOrderService.releaseAbandonedPosOrders — dọn đơn tại quầy bỏ dở', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000);

  beforeEach(() => {
    jest.spyOn(sequelize, 'transaction').mockImplementation(async () => fakeTransaction());
    jest.spyOn(OnlineOrderService, '_releaseOrder').mockResolvedValue();
    jest.spyOn(AuditService, 'record').mockResolvedValue();
  });
  afterEach(() => jest.restoreAllMocks());

  test('ngưỡng là 6 giờ', () => {
    expect(SalesOrderService.ABANDONED_POS_ORDER_MS).toBe(6 * 3600 * 1000);
  });

  test('huỷ đơn quá 6 giờ không đổi; bỏ qua đơn vừa có dòng mới hoặc đã thanh toán', async () => {
    jest.spyOn(SalesOrder, 'findAll').mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const orders = {
      1: { id: 1, branchId: 1, status: 'open', updatedAt: hoursAgo(7), lines: [{ createdAt: hoursAgo(7) }] },
      2: { id: 2, branchId: 1, status: 'open', updatedAt: hoursAgo(8), lines: [{ createdAt: hoursAgo(1) }] },
      3: { id: 3, branchId: 1, status: 'paid', updatedAt: hoursAgo(9), lines: [] }
    };
    jest.spyOn(SalesOrder, 'findOne').mockImplementation(async ({ where }) => orders[where.id]);

    const result = await SalesOrderService.releaseAbandonedPosOrders(now);

    expect(result).toEqual({ released: 1, checked: 3 });
    expect(OnlineOrderService._releaseOrder).toHaveBeenCalledTimes(1);
    expect(OnlineOrderService._releaseOrder.mock.calls[0][0].id).toBe(1);
    expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sales_order.abandoned_released', targetId: 1 }));
  });

  test('chỉ quét đơn POS đang mở, cũ hơn mốc 6 giờ', async () => {
    const findAll = jest.spyOn(SalesOrder, 'findAll').mockResolvedValue([]);
    await SalesOrderService.releaseAbandonedPosOrders(now);
    const { where } = findAll.mock.calls[0][0];
    expect(where.channel).toBe('pos');
    expect(where.status).toBe('open');
    const cutoff = Object.values(Object.getOwnPropertySymbols(where.updatedAt).map((s) => where.updatedAt[s]))[0];
    expect(cutoff.toISOString()).toBe(hoursAgo(6).toISOString());
  });
});
