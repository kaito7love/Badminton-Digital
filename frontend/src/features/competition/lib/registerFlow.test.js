import { describe, test, expect } from 'vitest';
import {
  buildRegisterBody, canSearchPartners, cleanName, emptyGuest, feeSummary, guestFieldErrors, hasRatingFor, normalizePhone, partnerProblem, phoneText,
  registerErrorHint, registerReady, registerToast, signupToast, validateGuestForm, withdrawText
} from './registerFlow';

const goodGuest = { name: '  Trần   Thị  Bích ', phone: '+84 912 345 678', gender: 'female', level: 'tb' };

describe('SĐT / họ tên (khớp luật của service)', () => {
  test('normalizePhone: +84 / 84 / dấu cách, sai → null', () => {
    expect(normalizePhone('0912 345 678')).toBe('0912345678');
    expect(normalizePhone('+84912345678')).toBe('0912345678');
    expect(normalizePhone('84.912.345.678')).toBe('0912345678');
    expect(normalizePhone('0912-345-678')).toBe('0912345678');
    for (const bad of ['', '12345', '0912 345 67', '1912345678', 'abc', null, undefined]) expect(normalizePhone(bad)).toBeNull();
  });
  test('phoneText chia nhóm cho dễ đọc, sai thì giữ nguyên', () => {
    expect(phoneText('+84912345678')).toBe('0912 345 678');
    expect(phoneText('xyz')).toBe('xyz');
  });
  test('cleanName gom khoảng trắng', () => {
    expect(cleanName('  Trần   Thị  Bích ')).toBe('Trần Thị Bích');
  });
});

describe('validateGuestForm', () => {
  test('đủ + đúng → không lỗi', () => {
    expect(validateGuestForm(goodGuest)).toEqual({});
  });
  test('form trống → đủ bốn lỗi theo ô', () => {
    expect(Object.keys(validateGuestForm(emptyGuest())).sort()).toEqual(['gender', 'level', 'name', 'phone']);
  });
  test('từng ô sai riêng', () => {
    expect(validateGuestForm({ ...goodGuest, name: 'A' }).name).toMatch(/họ tên/i);
    expect(validateGuestForm({ ...goodGuest, name: '1234' }).name).toBeTruthy();
    expect(validateGuestForm({ ...goodGuest, phone: '123' }).phone).toMatch(/10 số/);
    expect(validateGuestForm({ ...goodGuest, gender: 'x' }).gender).toBeTruthy();
    expect(validateGuestForm({ ...goodGuest, level: 'pro' }).level).toBeTruthy();
    expect(validateGuestForm(null)).toHaveProperty('name');
  });
});

describe('chọn đồng đội / gửi đăng ký', () => {
  const picked = { id: 'p1', name: 'Lê Văn C', rated: true };
  test('người đã có: phải chọn, phải có điểm', () => {
    expect(partnerProblem({ mode: 'existing', picked: null }).kind).toBe('missing');
    expect(partnerProblem({ mode: 'existing', picked: { ...picked, rated: false } })).toMatchObject({ kind: 'unrated' });
    expect(partnerProblem({ mode: 'existing', picked })).toBeNull();
  });
  test('người chưa có tài khoản: theo form', () => {
    expect(partnerProblem({ mode: 'guest', guest: emptyGuest() }).kind).toBe('form');
    expect(partnerProblem({ mode: 'guest', guest: goodGuest })).toBeNull();
  });
  test('registerReady: giải đơn luôn sẵn sàng; giải đôi cần đồng đội hợp lệ', () => {
    expect(registerReady({ needsPartner: false })).toBe(true);
    expect(registerReady({ needsPartner: true, mode: 'existing', picked: null })).toBe(false);
    expect(registerReady({ needsPartner: true, mode: 'existing', picked })).toBe(true);
    expect(registerReady({ needsPartner: true, mode: 'guest', guest: emptyGuest() })).toBe(false);
  });
  test('buildRegisterBody: đơn → {}, đôi → playerId hoặc guest đã chuẩn hoá', () => {
    expect(buildRegisterBody({ needsPartner: false })).toEqual({});
    expect(buildRegisterBody({ needsPartner: true, mode: 'existing', picked })).toEqual({ partner: { playerId: 'p1' } });
    expect(buildRegisterBody({ needsPartner: true, mode: 'guest', guest: goodGuest })).toEqual({
      partner: { guest: { name: 'Trần Thị Bích', phone: '0912345678', gender: 'female', level: 'tb' } }
    });
  });
  test('lệ phí hiển thị: 1 người 200.000đ, cặp 2 × = 400.000đ (chỉ hiển thị)', () => {
    expect(feeSummary(false)).toMatchObject({ people: 1, total: 200000 });
    expect(feeSummary(true)).toMatchObject({ people: 2, total: 400000 });
    expect(feeSummary(true).text).toMatch(/2 × .*200\.000đ = .*400\.000đ/);
  });
  test('tìm đồng đội cần ≥ 2 ký tự có nghĩa', () => {
    expect(canSearchPartners('a')).toBe(false);
    expect(canSearchPartners(' a ')).toBe(false);
    expect(canSearchPartners('an')).toBe(true);
    expect(canSearchPartners(undefined)).toBe(false);
  });
});

describe('hồ sơ / lỗi / câu thông báo', () => {
  test('hasRatingFor theo nội dung của giải', () => {
    const me = { ratings: { doubles: { rating: 3 } } };
    expect(hasRatingFor(me, 'doubles')).toBe(true);
    expect(hasRatingFor(me, 'singles')).toBe(false);
    expect(hasRatingFor(null, 'doubles')).toBe(false);
    expect(hasRatingFor({ ratings: {} }, 'doubles')).toBe(false);
  });
  test('guestFieldErrors lấy lỗi theo ô từ 422', () => {
    const err = { fields: [{ field: 'guest.phone', message: 'sai SĐT' }, { field: 'guest.phone', message: 'trùng' }, { field: 'rating', message: 'x' }, { field: null, message: 'y' }] };
    expect(guestFieldErrors(err)).toEqual({ phone: 'sai SĐT' });
    expect(guestFieldErrors(null)).toEqual({});
  });
  test('registerErrorHint: gợi ý hành động theo mã lỗi', () => {
    expect(registerErrorHint({ code: 'NEEDS_ASSESSMENT' }).kind).toBe('assess');
    expect(registerErrorHint({ code: 'GUEST_LIMIT' }).kind).toBe('staff');
    expect(registerErrorHint({ code: 'WITHDRAW_LOCKED' }).kind).toBe('staff');
    expect(registerErrorHint({ code: 'NOT_ELIGIBLE' }).kind).toBe('staff');
    expect(registerErrorHint({ code: 'OTHER' })).toBeNull();
    expect(registerErrorHint(null)).toBeNull();
  });
  test('registerToast / signupToast: chính thức hay danh sách chờ', () => {
    expect(registerToast({ entry: { status: 'registered' } }, false)).toBe('Đã đăng ký');
    expect(registerToast({ entry: { status: 'registered' } }, true)).toBe('Đã đăng ký cả cặp');
    expect(registerToast({ entry: { status: 'waitlisted', waitlistPosition: 3 } }, true)).toBe('Đã vào danh sách chờ (thứ 3)');
    expect(registerToast(null, false)).toBe('Đã đăng ký');
    expect(signupToast({ status: 'registered' })).toBe('Đã đăng ký giữ chỗ');
    expect(signupToast({ status: 'waitlisted', waitlistPosition: 2 })).toBe('Đã vào danh sách chờ (thứ 2)');
  });
  test('withdrawText: giải đôi nói rõ cả cặp cùng rút', () => {
    const me = { entry: { players: [{ name: 'An' }, { name: 'Bình' }] } };
    expect(withdrawText(me, true)).toMatch(/Cả cặp \(An & Bình\)/);
    expect(withdrawText(me, false)).not.toMatch(/Cả cặp/);
    expect(withdrawText(null, true)).toMatch(/rút khỏi giải/);
  });
});
