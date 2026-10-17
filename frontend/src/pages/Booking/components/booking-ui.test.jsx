import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fixture from '../lib/day.fixture.json';
import CourtGrid from './CourtGrid';
import PhoneGrid from './PhoneGrid';
import SummaryBar from './SummaryBar';
import ConfirmDialog from './ConfirmDialog';
import DayStrip from './DayStrip';
import Legend from './Legend';
import { ErrorBoard, LoadingBoard, NoCourtsBoard, OverBoard } from './BoardStates';
import { CELL_STYLE } from './cellStyles';
import { buildDayStrip, fallbackWindow } from '../lib/dayStrip';
import { summarize } from '../lib/daySelection';

// Dựng bằng react-dom/server (repo không dùng jsdom): kiểm đúng cấu trúc, nhãn,
// thuộc tính trợ năng và cặp lớp sáng / tối. Hành vi chạm đã có test ở lib/.
const clone = (value) => JSON.parse(JSON.stringify(value));
const day = () => clone(fixture);
const noop = () => {};
const buttons = (html) => html.match(/<button[^>]*>/g) || [];

describe('CourtGrid (desktop)', () => {
  test('một cột giờ mỗi ô và một ô mỗi giờ của sân đặt được', () => {
    const html = renderToStaticMarkup(<CourtGrid day={day()} selection={null} onTap={noop} />);
    const slotCount = fixture.courts[0].slots.length;
    const bookable = fixture.courts.filter((c) => c.bookable).length;
    expect(buttons(html)).toHaveLength(slotCount * bookable);
    expect(html).toContain(`repeat(${slotCount}, minmax(0, 1fr))`);
  });

  test('sân bảo trì là một dải thông báo, không có ô bấm', () => {
    const html = renderToStaticMarkup(<CourtGrid day={day()} selection={null} onTap={noop} />);
    const maintenance = fixture.courts.find((c) => !c.bookable);
    expect(maintenance).toBeTruthy();
    expect(html).toContain('Bảo trì');
    expect(html).not.toContain(`aria-label="${maintenance.name}, 05:00`);
  });

  test('ô đang chọn: aria-pressed, ô không trống: disabled, mọi ô có nhãn đọc được', () => {
    const d = day();
    const court = d.courts[0];
    court.slots.find((s) => s.start === '09:00').state = 'booked';
    court.slots.find((s) => s.start === '10:00').state = 'passed';
    const selection = { courtId: court.id, startTime: '18:00', endTime: '20:00' };
    const html = renderToStaticMarkup(<CourtGrid day={d} selection={selection} onTap={noop} />);

    const pressed = buttons(html).filter((b) => b.includes('aria-pressed="true"'));
    expect(pressed).toHaveLength(2);
    expect(pressed.every((b) => b.includes('đang chọn'))).toBe(true);
    expect(html).toContain('aria-label="Sân số 1 (Thường), 09:00, đã kín"');
    const nine = buttons(html).find((b) => b.includes('09:00, đã kín'));
    const ten = buttons(html).find((b) => b.includes('10:00, đã qua'));
    expect(nine).toContain('disabled');
    expect(ten).toContain('disabled');
    const open = buttons(html).find((b) => b.includes('08:00, trống'));
    expect(open).not.toContain('disabled');
  });
});

describe('PhoneGrid (điện thoại)', () => {
  test('thẻ chọn sân + lưới 4 cột của đúng sân đang xem', () => {
    const d = day();
    const html = renderToStaticMarkup(
      <PhoneGrid day={d} courtId={d.courts[1].id} onCourt={noop} selection={null} onTap={noop} />
    );
    expect(html).toContain('grid-cols-4');
    expect(html).toContain(`aria-label="Giờ của ${d.courts[1].name}"`);
    // Thẻ sân: mỗi sân một nút, sân đang xem aria-pressed.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('05:00');
  });

  test('sân bảo trì: thông báo, không có lưới giờ', () => {
    const d = day();
    const maintenance = d.courts.find((c) => !c.bookable);
    const html = renderToStaticMarkup(
      <PhoneGrid day={d} courtId={maintenance.id} onCourt={noop} selection={null} onTap={noop} />
    );
    expect(html).toContain('đang bảo trì');
    expect(html).not.toContain('grid-cols-4');
  });

  test('ô trống kèm giá rút gọn, ô kín ghi "Kín"', () => {
    const d = day();
    d.courts[0].slots[0].state = 'booked';
    const html = renderToStaticMarkup(
      <PhoneGrid day={d} courtId={d.courts[0].id} onCourt={noop} selection={null} onTap={noop} />
    );
    expect(html).toContain('Kín');
    expect(html).toMatch(/\d+k/);
  });
});

describe('SummaryBar', () => {
  const court = fixture.courts[0];
  const summary = summarize(court, { courtId: court.id, startTime: '16:00', endTime: '18:00' });

  test('chưa chọn: nút Đặt sân bị khoá', () => {
    const html = renderToStaticMarkup(<SummaryBar summary={null} date="2026-10-15" role="customer" onBook={noop} />);
    expect(html).toContain('Chưa chọn khung giờ');
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Đặt sân<\/button>/);
  });

  test('đã chọn: sân, khung giờ, ngày, tạm tính tách giờ thường / cao điểm', () => {
    const html = renderToStaticMarkup(<SummaryBar summary={summary} date="2026-10-15" role="customer" onBook={noop} />);
    // Khung giờ là dòng đầu; dòng phụ: tên sân (bỏ loại trong ngoặc, hộp xác nhận mới ghi đủ), ngày, số giờ.
    expect(html).toContain('>16:00–18:00</strong>');
    expect(html).toContain('Sân số 1 · T5 15/10 · 2 giờ');
    expect(html).not.toContain('(Thường)');
    expect(html).toContain('tạm tính');
    expect(html).toMatch(/\d[\d.]*đ/);
  });

  test('khách chưa đăng nhập: nút đổi thành "Đăng nhập để đặt"', () => {
    const html = renderToStaticMarkup(<SummaryBar summary={summary} date="2026-10-15" role="guest" onBook={noop} />);
    expect(html).toContain('Đăng nhập để đặt');
  });
});

describe('ConfirmDialog', () => {
  const court = fixture.courts[0];
  const summary = summarize(court, { courtId: court.id, startTime: '18:00', endTime: '19:00' });
  const base = { open: true, summary, branchName: 'Chi nhánh Quận 7', date: '2026-10-15', onClose: noop };
  const render = (props) => renderToStaticMarkup(<ConfirmDialog {...base} {...props} />);

  test('đóng, hoặc không có lựa chọn: không dựng gì', () => {
    expect(render({ open: false, mode: 'customer' })).toBe('');
    expect(render({ summary: null, mode: 'customer' })).toBe('');
  });

  test('là hộp thoại có nhãn, nêu chi nhánh, sân, ngày, giờ và tạm tính', () => {
    const html = render({ mode: 'customer', user: { fullName: 'Nguyễn Văn Khách', phone: '0903333333' } });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Chi nhánh Quận 7');
    expect(html).toContain(court.name);
    expect(html).toContain('T5 15/10');
    expect(html).toContain('18:00–19:00');
    expect(html).toContain('Nguyễn Văn Khách');
  });

  test('khách hàng: nút "Xác nhận đặt sân"; chưa có hàm nối thì khoá, có thì bấm được', () => {
    // Chỉ tin thuộc tính thật `disabled=""`: chuỗi "disabled" trần khớp nhầm cả lớp `disabled:opacity-50`.
    const locked = render({ mode: 'customer' });
    expect(locked).toMatch(/<button[^>]*\sdisabled=""[^>]*>Xác nhận đặt sân<\/button>/);
    const wired = render({ mode: 'customer', onConfirm: noop });
    expect(wired).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Xác nhận đặt sân<\/button>/);
    expect(wired).toContain('Xác nhận đặt sân</button>');
  });

  test('đang đặt: nút khoá và đổi chữ', () => {
    const html = render({ mode: 'customer', onConfirm: noop, busy: true });
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Đang đặt…<\/button>/);
  });

  test('khách chưa đăng nhập: nói rõ lựa chọn được giữ', () => {
    const html = render({ mode: 'guest', onConfirm: noop });
    expect(html).toContain('Đăng nhập để đặt sân');
    expect(html).toContain('Lựa chọn hiện tại được giữ');
  });

  test('vừa đăng nhập xong (resumed): có dòng báo lựa chọn được giữ; đặt thẳng thì không có', () => {
    const resumed = render({ mode: 'customer', onConfirm: noop, resumed: true });
    expect(resumed).toContain('Đã đăng nhập. Lựa chọn của bạn được giữ nguyên');
    const direct = render({ mode: 'customer', onConfirm: noop });
    expect(direct).not.toContain('Đã đăng nhập.');
    // Khách chưa đăng nhập không bao giờ thấy dòng này, kể cả khi cờ bị bật nhầm.
    expect(render({ mode: 'guest', onConfirm: noop, resumed: true })).not.toContain('Đã đăng nhập. Lựa chọn');
  });

  test('nhân viên: thông báo đặt ở Quản Lý Đặt Sân, không có nút chính', () => {
    const html = render({ mode: 'staff', onConfirm: noop });
    expect(html).toContain('Quản Lý Đặt Sân');
    expect(html).not.toContain('Xác nhận đặt sân</button>');
    expect(html).not.toContain('Đăng nhập để đặt sân');
    expect(html).toContain('Đóng');
  });

  test('lỗi của server hiện ở vùng cảnh báo', () => {
    const html = render({ mode: 'customer', onConfirm: noop, error: 'Khung giờ này đã có người đặt' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Khung giờ này đã có người đặt');
  });
});

describe('DayStrip, Legend, BoardStates', () => {
  test('dải ngày: 14 nút, đúng một nút đang chọn, ô đầu ghi "Hôm nay"', () => {
    const days = buildDayStrip(fallbackWindow('2026-10-14'));
    const html = renderToStaticMarkup(<DayStrip days={days} value="2026-10-16" onChange={noop} />);
    expect(buttons(html)).toHaveLength(14);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('Hôm nay');
    expect(html).toContain('aria-label="T4 14/10, hôm nay"');
  });

  test('chú thích đủ sáu trạng thái', () => {
    const html = renderToStaticMarkup(<Legend />);
    for (const label of ['Trống', 'cao điểm', 'Bạn chọn', 'Đã kín', 'Đã qua', 'Bảo trì']) {
      expect(html).toContain(label);
    }
  });

  test('các trạng thái của bảng', () => {
    expect(renderToStaticMarkup(<LoadingBoard />)).toContain('aria-busy="true"');
    const err = renderToStaticMarkup(<ErrorBoard message="Mất kết nối" onRetry={noop} />);
    expect(err).toContain('Mất kết nối');
    expect(err).toContain('Thử lại');
    expect(renderToStaticMarkup(<OverBoard onNextDay={noop} />)).toContain('Xem ngày mai');
    expect(renderToStaticMarkup(<OverBoard onNextDay={null} />)).not.toContain('Xem ngày mai');
    expect(renderToStaticMarkup(<NoCourtsBoard />)).toContain('chưa có sân');
  });
});

describe('sơ đồ mặt bằng: điểm bám để cuộn / tô sáng / chuyển tab (kế hoạch 45)', () => {
  test('CourtGrid: ô tên mỗi sân có data-court-title và nhận tiêu điểm lập trình', () => {
    const html = renderToStaticMarkup(<CourtGrid day={day()} selection={null} onTap={noop} />);
    for (const c of fixture.courts) expect(html).toContain(`data-court-title="${c.id}"`);
    expect(html.match(/tabindex="-1"/g) || []).toHaveLength(fixture.courts.length);
  });

  test('CourtGrid: chỉ hàng của sân được chỉ định có vòng sáng; không chỉ định thì không hàng nào có', () => {
    const none = renderToStaticMarkup(<CourtGrid day={day()} selection={null} onTap={noop} />);
    expect(none).not.toContain('ring-2');
    const lit = renderToStaticMarkup(
      <CourtGrid day={day()} selection={null} onTap={noop} highlightCourtId={fixture.courts[0].id} />
    );
    expect((lit.match(/ring-2/g) || []).length).toBe(1);
    expect(lit).toContain('dark:ring-emerald-400');
  });

  test('PhoneGrid: mỗi tab sân có data-court-tab', () => {
    const html = renderToStaticMarkup(
      <PhoneGrid day={day()} courtId={fixture.courts[0].id} onCourt={noop} selection={null} onTap={noop} />
    );
    for (const c of fixture.courts) expect(html).toContain(`data-court-tab="${c.id}"`);
  });
});

describe('giao diện sáng / tối (kế hoạch 28: không có text-white trần)', () => {
  test('mọi chuỗi lớp có text-white đều kèm cặp dark:text-', () => {
    const dir = path.resolve(__dirname, '..');
    const files = [
      path.join(dir, 'BookingPage.jsx'),
      ...fs.readdirSync(__dirname).filter((f) => /\.(jsx|js)$/.test(f) && !/test/.test(f)).map((f) => path.join(__dirname, f))
    ];
    const offenders = [];
    for (const file of files) {
      // Bỏ chú thích, rồi nối các chuỗi viết liền bằng "+" để một chuỗi lớp bị cắt đôi vẫn được xét nguyên.
      const source = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/['"`]\s*\+\s*['"`]/g, '');
      for (const [, literal] of source.matchAll(/[`'"]([^`'"\n]*)[`'"]/g)) {
        const bare = /(^|\s)text-white(\s|$)/.test(literal);
        if (bare && !/dark:text-/.test(literal)) offenders.push(`${path.basename(file)}: ${literal.slice(0, 80)}`);
        if (/(^|\s)bg-slate-950(\s|$)/.test(literal)) offenders.push(`${path.basename(file)}: ${literal.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('bảng màu ô: mỗi trạng thái có biến thể tối', () => {
    for (const [name, classes] of Object.entries(CELL_STYLE)) {
      expect(classes, name).toMatch(/dark:/);
    }
  });
});
