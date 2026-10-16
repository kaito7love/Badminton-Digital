import { describe, expect, test } from 'vitest';
import { classifyBookingError } from './bookingError';

const http = (status, message) => ({ response: { status, data: { message } } });

describe('classifyBookingError', () => {
  test('không có phản hồi (rớt mạng): giữ lựa chọn, không tải lại lưới', () => {
    expect(classifyBookingError(new Error('Network Error'))).toMatchObject({ kind: 'network', refreshGrid: false });
  });

  test('409 trùng lịch: hiện nguyên thông điệp của server và tải lại lưới', () => {
    const r = classifyBookingError(http(409, 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác'));
    expect(r).toMatchObject({ kind: 'conflict', refreshGrid: true });
    expect(r.message).toBe('Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác');
  });

  test('400 luật nghiệp vụ (đã qua, ngoài giờ, quá 14 ngày): nguyên văn và tải lại lưới', () => {
    for (const message of [
      'Khung giờ này đã qua, vui lòng chọn khung giờ khác',
      'Quán chỉ nhận đặt sân trong khung 05:00–23:00',
      'Chỉ nhận đặt trước tối đa 14 ngày (đến 27/10/2026), vui lòng chọn ngày sớm hơn'
    ]) {
      const r = classifyBookingError(http(400, message));
      expect(r).toMatchObject({ kind: 'rejected', refreshGrid: true, message });
    }
  });

  test('400 của validator ("Validation failed" là tiếng Anh) được dịch', () => {
    const r = classifyBookingError(http(400, 'Validation failed'));
    expect(r.message).not.toMatch(/Validation/);
    expect(r.message).toMatch(/chọn lại/);
  });

  test('401: mời đăng nhập lại, không tải lại lưới', () => {
    expect(classifyBookingError(http(401, 'Unauthorized'))).toMatchObject({ kind: 'auth', refreshGrid: false });
  });

  test('403 tài khoản chưa có hồ sơ khách: nguyên văn của server', () => {
    const r = classifyBookingError(http(403, 'Tài khoản khách hàng chưa có hồ sơ khách hàng'));
    expect(r).toMatchObject({ kind: 'other', message: 'Tài khoản khách hàng chưa có hồ sơ khách hàng' });
  });

  test('500 không có thông điệp: câu chung tiếng Việt', () => {
    const r = classifyBookingError({ response: { status: 500, data: {} } });
    expect(r.kind).toBe('other');
    expect(r.message).toMatch(/không thành công/);
  });

  test('429 (quá nhiều lượt đặt) hiện nguyên văn thông báo tiếng Việt của server, không làm tải lại lưới', () => {
    const r = classifyBookingError({ response: { status: 429, data: { message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.' } } });
    expect(r.message).toBe('Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.');
    expect(r.refreshGrid).toBe(false);
  });

  test('400 BOOKING_LIMIT (đã giữ đủ trần lịch) hiện nguyên văn câu của server', () => {
    const message = 'Bạn đang giữ 5 lịch chưa chơi (tối đa 5). Hãy huỷ bớt hoặc chơi xong rồi đặt thêm.';
    const r = classifyBookingError({ response: { status: 400, data: { message, code: 'BOOKING_LIMIT' } } });
    expect(r.kind).toBe('rejected');
    expect(r.message).toBe(message);
  });
});
