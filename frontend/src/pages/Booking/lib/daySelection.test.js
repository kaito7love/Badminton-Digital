import { describe, expect, test } from 'vitest';
import fixture from './day.fixture.json';
import {
  MAX_BOOKING_HOURS,
  bookingPayload,
  hintText,
  isSelected,
  lostText,
  reconcileSelection,
  slotsBetween,
  summarize,
  tapSlot
} from './daySelection';

// `day.fixture.json` là phản hồi THẬT của GET /public/availability/day (chi nhánh
// Quận 7: hai sân đặt được và một sân bảo trì). Mọi ca dưới đây dựng từ nó, nên
// nếu server đổi dạng dữ liệu thì test này đỏ trước khi trang vỡ.
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Bản sao của ngày thật, đánh dấu một số ô của một sân (mặc định sân 0). */
const dayWith = (marks = {}, courtIndex = 0) => {
  const day = clone(fixture);
  for (const [start, state] of Object.entries(marks)) {
    day.courts[courtIndex].slots.find((slot) => slot.start === start).state = state;
  }
  return day;
};
const court = (day, index = 0) => day.courts[index];
const slotAt = (c, start) => c.slots.find((slot) => slot.start === start);

describe('hợp đồng với phản hồi thật của server', () => {
  test('mẫu thật đúng dạng mà lib dựa vào', () => {
    expect(fixture.courts.length).toBeGreaterThanOrEqual(2);
    for (const c of fixture.courts) {
      expect(typeof c.id).toBe('number');
      expect(typeof c.offpeakPricePerHour).toBe('number');
      expect(typeof c.peakPricePerHour).toBe('number');
      expect(c.slots.length).toBeGreaterThan(0);
      for (const slot of c.slots) {
        expect(slot.start).toMatch(/^\d{2}:\d{2}$/);
        expect(slot.end).toMatch(/^\d{2}:\d{2}$/);
        expect(['free', 'booked', 'passed', 'maintenance']).toContain(slot.state);
        expect(typeof slot.peak).toBe('boolean');
      }
    }
  });
});

describe('tapSlot — chọn một ô, kéo thành khoảng', () => {
  const day = dayWith();
  const c = court(day);

  test('chưa chọn gì: ô vừa chạm thành lựa chọn 1 giờ', () => {
    const { selection, hint } = tapSlot({ selection: null, court: c, slot: slotAt(c, '18:00') });
    expect(selection).toEqual({ courtId: c.id, startTime: '18:00', endTime: '19:00' });
    expect(hint).toBeNull();
  });

  test('chạm lại đúng ô đang chọn thì bỏ chọn', () => {
    const first = tapSlot({ selection: null, court: c, slot: slotAt(c, '18:00') });
    const again = tapSlot({ selection: first.selection, court: c, slot: slotAt(c, '18:00') });
    expect(again.selection).toBeNull();
  });

  test('chạm ô thứ hai cùng sân: kéo thành khoảng, cả hai chiều', () => {
    const start = tapSlot({ selection: null, court: c, slot: slotAt(c, '18:00') }).selection;
    const forward = tapSlot({ selection: start, court: c, slot: slotAt(c, '19:00') });
    expect(forward.selection).toEqual({ courtId: c.id, startTime: '18:00', endTime: '20:00' });

    const backward = tapSlot({ selection: start, court: c, slot: slotAt(c, '17:00') });
    expect(backward.selection).toEqual({ courtId: c.id, startTime: '17:00', endTime: '19:00' });
  });

  test('đúng mức tối đa 3 giờ thì được, vượt thì giữ nguyên và nhắc', () => {
    const start = tapSlot({ selection: null, court: c, slot: slotAt(c, '18:00') }).selection;
    const ok = tapSlot({ selection: start, court: c, slot: slotAt(c, '20:00') });
    expect(ok.selection).toEqual({ courtId: c.id, startTime: '18:00', endTime: '21:00' });
    expect(slotsBetween(c, ok.selection.startTime, ok.selection.endTime)).toHaveLength(MAX_BOOKING_HOURS);

    const tooLong = tapSlot({ selection: start, court: c, slot: slotAt(c, '21:00') });
    expect(tooLong.selection).toBe(start);
    expect(hintText(tooLong.hint)).toBe('Mỗi lần đặt tối đa 3 giờ. Bạn đang chọn 4 giờ.');
  });

  test('giữa chừng có ô không đặt được: chọn lại từ ô vừa chạm và nói rõ', () => {
    const blockedDay = dayWith({ '19:00': 'booked' });
    const bc = court(blockedDay);
    const start = tapSlot({ selection: null, court: bc, slot: slotAt(bc, '18:00') }).selection;
    const result = tapSlot({ selection: start, court: bc, slot: slotAt(bc, '20:00') });
    expect(result.selection).toEqual({ courtId: bc.id, startTime: '20:00', endTime: '21:00' });
    expect(hintText(result.hint)).toBe('Giữa 18:00 và 21:00 có khung không đặt được, đã chọn lại từ 20:00.');
  });

  test('ô kín, đã qua, bảo trì: chạm không đổi gì', () => {
    const d = dayWith({ '10:00': 'booked', '11:00': 'passed', '12:00': 'maintenance' });
    const cc = court(d);
    for (const start of ['10:00', '11:00', '12:00']) {
      const before = { courtId: cc.id, startTime: '18:00', endTime: '19:00' };
      const result = tapSlot({ selection: before, court: cc, slot: slotAt(cc, start) });
      expect(result.selection).toBe(before);
      expect(result.hint).toBeNull();
    }
    expect(tapSlot({ selection: null, court: cc, slot: slotAt(cc, '10:00') }).selection).toBeNull();
  });

  test('đang chọn một KHOẢNG rồi chạm ô khác: bắt đầu lựa chọn mới', () => {
    const range = { courtId: c.id, startTime: '18:00', endTime: '20:00' };
    const result = tapSlot({ selection: range, court: c, slot: slotAt(c, '08:00') });
    expect(result.selection).toEqual({ courtId: c.id, startTime: '08:00', endTime: '09:00' });
  });

  test('chạm ô của sân khác: chuyển lựa chọn sang sân đó', () => {
    const other = court(day, 1);
    const start = tapSlot({ selection: null, court: c, slot: slotAt(c, '18:00') }).selection;
    const result = tapSlot({ selection: start, court: other, slot: slotAt(other, '19:00') });
    expect(result.selection).toEqual({ courtId: other.id, startTime: '19:00', endTime: '20:00' });
  });

  test('isSelected khớp đúng các ô của khoảng và đúng sân', () => {
    const selection = { courtId: c.id, startTime: '18:00', endTime: '20:00' };
    expect(isSelected(selection, c, slotAt(c, '17:00'))).toBe(false);
    expect(isSelected(selection, c, slotAt(c, '18:00'))).toBe(true);
    expect(isSelected(selection, c, slotAt(c, '19:00'))).toBe(true);
    expect(isSelected(selection, c, slotAt(c, '20:00'))).toBe(false);
    const other = court(day, 1);
    expect(isSelected(selection, other, slotAt(other, '18:00'))).toBe(false);
    expect(isSelected(null, c, slotAt(c, '18:00'))).toBe(false);
  });
});

describe('reconcileSelection — lưới tải lại', () => {
  const selection = { courtId: fixture.courts[0].id, startTime: '18:00', endTime: '20:00' };

  test('lựa chọn còn nguyên khi các ô vẫn trống', () => {
    expect(reconcileSelection(selection, dayWith())).toEqual({ selection, lost: null });
  });

  test('người khác vừa đặt một ô trong khoảng: bỏ chọn và nói lý do', () => {
    const result = reconcileSelection(selection, dayWith({ '19:00': 'booked' }));
    expect(result).toEqual({ selection: null, lost: 'booked' });
    expect(lostText(result.lost)).toMatch(/vừa có người đặt/);
  });

  test('ô đã qua, sân vừa bảo trì, sân biến mất khỏi lưới', () => {
    expect(reconcileSelection(selection, dayWith({ '18:00': 'passed' })).lost).toBe('passed');
    expect(reconcileSelection(selection, dayWith({ '18:00': 'maintenance' })).lost).toBe('maintenance');
    const noCourt = clone(fixture);
    noCourt.courts = noCourt.courts.filter((x) => x.id !== selection.courtId);
    expect(reconcileSelection(selection, noCourt)).toEqual({ selection: null, lost: 'gone' });
  });

  test('giờ mở cửa đổi làm khung không còn trọn trên lưới: coi là mất', () => {
    const shrunk = clone(fixture);
    shrunk.courts[0].slots = shrunk.courts[0].slots.filter((slot) => slot.start < '19:00');
    expect(reconcileSelection(selection, shrunk).lost).toBe('gone');
  });

  test('không có lựa chọn thì không có gì để mất', () => {
    expect(reconcileSelection(null, dayWith())).toEqual({ selection: null, lost: null });
  });

  test('mọi lý do mất đều có câu tiếng Việt', () => {
    for (const lost of ['booked', 'passed', 'maintenance', 'gone']) {
      expect(lostText(lost).length).toBeGreaterThan(10);
    }
    expect(lostText(null)).toBe('');
  });
});

describe('summarize — tạm tính theo cờ cao điểm của server', () => {
  const c = court(fixture);
  const firstPeak = c.slots.find((slot) => slot.peak);
  const lastOffpeakBefore = c.slots[c.slots.indexOf(firstPeak) - 1];

  test('một giờ thường', () => {
    const s = summarize(c, { courtId: c.id, startTime: '08:00', endTime: '09:00' });
    expect(s).toMatchObject({ hours: 1, offpeakHours: 1, peakHours: 0, total: c.offpeakPricePerHour, label: '08:00–09:00' });
  });

  test('khoảng vắt qua ranh giới cao điểm: tách đúng số giờ mỗi loại', () => {
    const s = summarize(c, { courtId: c.id, startTime: lastOffpeakBefore.start, endTime: firstPeak.end });
    expect(s.hours).toBe(2);
    expect(s.offpeakHours).toBe(1);
    expect(s.peakHours).toBe(1);
    expect(s.total).toBe(c.offpeakPricePerHour + c.peakPricePerHour);
  });

  test('ba giờ cao điểm', () => {
    const peakCells = c.slots.filter((slot) => slot.peak);
    const s = summarize(c, { courtId: c.id, startTime: peakCells[0].start, endTime: peakCells[2].end });
    expect(s).toMatchObject({ hours: 3, offpeakHours: 0, peakHours: 3, total: 3 * c.peakPricePerHour });
  });

  test('không có sân hoặc lựa chọn thì không có tóm tắt', () => {
    expect(summarize(null, { courtId: 1, startTime: '08:00', endTime: '09:00' })).toBeNull();
    expect(summarize(c, null)).toBeNull();
  });
});

describe('bookingPayload', () => {
  test('đúng bốn trường mà POST /bookings nhận', () => {
    expect(bookingPayload('2026-10-15', { courtId: 4, startTime: '18:00', endTime: '20:00' })).toEqual({
      courtId: 4,
      bookingDate: '2026-10-15',
      startTime: '18:00',
      endTime: '20:00'
    });
  });
});
