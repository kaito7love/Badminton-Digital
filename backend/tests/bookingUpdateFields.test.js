const BookingService = require('../src/services/BookingService');
const {
  EDITABLE_BOOKING_FIELDS,
  rejectUneditableBookingFields
} = require('../src/validations/bookingValidation');

const guard = (body) => {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  const next = jest.fn();
  rejectUneditableBookingFields({ body }, res, next);
  return { res, next };
};

describe('PUT /bookings/:id chỉ nhận sân, ngày, giờ', () => {
  test.each([
    [{ startTime: '07:00', endTime: '09:00' }],
    [{ courtId: 2, bookingDate: '2026-09-20', startTime: '10:00', endTime: '11:00' }],
    [{}]
  ])('%j → đi tiếp', (body) => {
    const { res, next } = guard(body);
    expect(next).toHaveBeenCalledWith();
    expect(res.statusCode).toBeNull();
  });

  test.each([
    [{ branchId: 2 }, ['branchId']],
    [{ createdBy: 1, startTime: '10:00' }, ['createdBy']],
    [{ status: 'confirmed' }, ['status']],
    [{ customerId: 9, customerName: 'A', customerPhone: '0900000000' }, ['customerId', 'customerName', 'customerPhone']],
    [{ id: 99, version: 0, deletedAt: null }, ['id', 'version', 'deletedAt']]
  ])('%j → 400 nêu tên trường', (body, fields) => {
    const { res, next } = guard(body);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(`Không sửa được các trường: ${fields.join(', ')}`);
    expect(res.body.errors.map((e) => e.field)).toEqual(fields);
  });

  test('service lọc đúng danh sách của validator, kể cả khi bị gọi thẳng', () => {
    const everything = {
      courtId: 3,
      bookingDate: '2026-09-20',
      startTime: '10:00',
      endTime: '11:00',
      branchId: 2,
      createdBy: 1,
      status: 'confirmed',
      customerId: 9,
      version: 4
    };
    expect(Object.keys(BookingService.pickEditableFields(everything))).toEqual(EDITABLE_BOOKING_FIELDS);
    expect(BookingService.pickEditableFields({ startTime: '07:00', branchId: 2 })).toEqual({ startTime: '07:00' });
  });
});
