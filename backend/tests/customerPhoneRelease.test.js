const CustomerService = require('../src/services/CustomerService');
const AuditService = require('../src/services/AuditService');
const { Customer, IntegrationOutbox, sequelize } = require('../src/models');

const fakeTransaction = () => ({ LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn().mockResolvedValue(), rollback: jest.fn().mockResolvedValue() });

describe('DATA-01 — số điện thoại của hồ sơ khách đã xoá mềm', () => {
  beforeEach(() => {
    jest.spyOn(AuditService, 'record').mockResolvedValue();
    // Xoá / gộp / đổi tên khách ghi thêm một dòng outbox cho competition-service (plan 23).
    jest.spyOn(IntegrationOutbox, 'create').mockResolvedValue({});
  });
  afterEach(() => jest.restoreAllMocks());

  test('releaseDeletedPhoneHolder: hồ sơ đã xoá còn giữ số → đặt NULL, nhật ký lưu số cũ', async () => {
    const findOne = jest.spyOn(Customer, 'findOne').mockResolvedValue({ id: 41 });
    const update = jest.spyOn(Customer, 'update').mockResolvedValue([1]);

    const released = await CustomerService.releaseDeletedPhoneHolder('0909000111');

    expect(released).toBe(true);
    expect(findOne.mock.calls[0][0].paranoid).toBe(false);
    expect(update).toHaveBeenCalledWith({ phone: null }, expect.objectContaining({ where: { id: 41 }, paranoid: false }));
    expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'customer.phone_released', targetId: 41, oldValues: { phone: '0909000111' }
    }));
  });

  test('releaseDeletedPhoneHolder: không có hồ sơ đã xoá nào giữ số → không làm gì', async () => {
    jest.spyOn(Customer, 'findOne').mockResolvedValue(null);
    const update = jest.spyOn(Customer, 'update');
    expect(await CustomerService.releaseDeletedPhoneHolder('0909000111')).toBe(false);
    expect(await CustomerService.releaseDeletedPhoneHolder(null)).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  test('resolveWalkIn (mở sân/đặt sân tại quầy): có hồ sơ đang dùng số → dùng lại, không nhả gì', async () => {
    const active = { id: 3, phone: '0909000111' };
    jest.spyOn(Customer, 'findOne').mockResolvedValue(active);
    const release = jest.spyOn(CustomerService, 'releaseDeletedPhoneHolder');
    expect(await CustomerService.resolveWalkIn({ fullName: 'A', phone: '0909000111' })).toBe(active);
    expect(release).not.toHaveBeenCalled();
  });

  test('resolveWalkIn: số chỉ còn trên hồ sơ đã xoá → nhả rồi tạo hồ sơ mới mang số', async () => {
    jest.spyOn(Customer, 'findOne').mockResolvedValue(null);
    const release = jest.spyOn(CustomerService, 'releaseDeletedPhoneHolder').mockResolvedValue(true);
    const create = jest.spyOn(Customer, 'create').mockResolvedValue({ id: 99 });

    await CustomerService.resolveWalkIn({ fullName: 'Khách quay lại', phone: '0909000111' });

    expect(release).toHaveBeenCalledWith('0909000111', expect.anything());
    expect(release.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(create).toHaveBeenCalledWith({ fullName: 'Khách quay lại', phone: '0909000111' }, expect.anything());
  });

  test('deleteCustomer: hồ sơ gắn tài khoản đăng nhập → 409, không xoá', async () => {
    const transaction = fakeTransaction();
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    const customer = { id: 5, userId: 12, phone: '0909000111', update: jest.fn(), destroy: jest.fn(), toJSON: () => ({}) };
    jest.spyOn(Customer, 'findByPk').mockResolvedValue(customer);

    await expect(CustomerService.deleteCustomer(5, {})).rejects.toMatchObject({ statusCode: 409 });
    expect(customer.destroy).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  test('deleteCustomer: hồ sơ tại quầy → nhả số rồi mới xoá mềm, nhật ký giữ giá trị cũ', async () => {
    const transaction = fakeTransaction();
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    const customer = {
      id: 5, userId: null, phone: '0909000111',
      update: jest.fn(), destroy: jest.fn(),
      toJSON: () => ({ id: 5, phone: '0909000111' })
    };
    jest.spyOn(Customer, 'findByPk').mockResolvedValue(customer);

    await CustomerService.deleteCustomer(5, { actor: { id: 1 } });

    expect(customer.update).toHaveBeenCalledWith({ phone: null }, { transaction });
    expect(customer.update.mock.invocationCallOrder[0]).toBeLessThan(customer.destroy.mock.invocationCallOrder[0]);
    expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'customer.deleted', oldValues: { id: 5, phone: '0909000111' }
    }));
    expect(transaction.commit).toHaveBeenCalled();
    // Sự kiện bd.customer.deleted ghi cùng transaction với việc xoá.
    expect(IntegrationOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bd.customer.deleted', subject: 'customer/5', payload: expect.objectContaining({ data: { externalRef: 'bd:customer:5' } }) }),
      { transaction }
    );
  });

  test('deleteCustomer: hồ sơ gắn tài khoản bị từ chối → không có sự kiện nào được ghi', async () => {
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(fakeTransaction());
    jest.spyOn(Customer, 'findByPk').mockResolvedValue({ id: 5, userId: 12, phone: null, update: jest.fn(), destroy: jest.fn(), toJSON: () => ({}) });
    await expect(CustomerService.deleteCustomer(5, {})).rejects.toMatchObject({ statusCode: 409 });
    expect(IntegrationOutbox.create).not.toHaveBeenCalled();
  });
});
