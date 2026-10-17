import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import fixture from './day.fixture.json';
import { branchLine, hasFloorPlan, isUsableLayout, planCourts, planPickText } from './floorPlan';

const layoutsDir = path.resolve(__dirname, '../../../../../backend/public/layouts');
const layoutFiles = fs.readdirSync(layoutsDir).filter((f) => /^branch-\d+\.json$/.test(f));
const readLayout = (file) => JSON.parse(fs.readFileSync(path.join(layoutsDir, file), 'utf8'));

describe('floorPlan — file sơ đồ thật của backend', () => {
  test('có ít nhất một file sơ đồ, và mọi file đều vẽ được', () => {
    expect(layoutFiles.length).toBeGreaterThan(0);
    for (const file of layoutFiles) expect(isUsableLayout(readLayout(file)), file).toBe(true);
  });

  test('mọi sân trong sơ đồ có toạ độ số (không vẽ lệch ra ngoài khung)', () => {
    for (const file of layoutFiles) {
      const layout = readLayout(file);
      for (const entry of layout.courts) {
        expect(typeof entry.courtName, file).toBe('string');
        expect(Number.isFinite(entry.x) && Number.isFinite(entry.y), `${file}: ${entry.courtName}`).toBe(true);
      }
    }
  });
});

describe('floorPlan — nối với sân thật theo tên', () => {
  const courts = fixture.courts;
  const layout = (names) => ({
    canvas: { width: 800, height: 500 },
    zones: [],
    courts: names.map((courtName, i) => ({ courtName, x: 10 + i * 200, y: 10 }))
  });

  test('chỉ lấy sân khớp tên, giữ thứ tự của sơ đồ', () => {
    const got = planCourts(layout([courts[1].name, 'Sân đã đổi tên', courts[0].name]), courts);
    expect(got.map((c) => c.id)).toEqual([courts[1].id, courts[0].id]);
  });

  test('hasFloorPlan: cần ít nhất một sân khớp', () => {
    expect(hasFloorPlan(layout([courts[0].name]), courts)).toBe(true);
    expect(hasFloorPlan(layout(['Sân không có thật']), courts)).toBe(false);
    expect(hasFloorPlan(layout([courts[0].name]), [])).toBe(false);
  });

  test('file thiếu, hỏng hoặc sai dạng thì không hiện sơ đồ và không ném lỗi', () => {
    for (const bad of [null, undefined, {}, [], 'x', { canvas: {}, zones: [], courts: [] }, { canvas: { width: 1, height: 1 }, zones: null, courts: [] }]) {
      expect(isUsableLayout(bad)).toBe(false);
      expect(planCourts(bad, courts)).toEqual([]);
      expect(hasFloorPlan(bad, courts)).toBe(false);
    }
  });
});

describe('floorPlan — câu chữ', () => {
  test('planPickText nêu tên sân và việc cần làm tiếp', () => {
    expect(planPickText({ name: 'Sân số 2 (Thường)' })).toBe('Sân số 2 (Thường) — chạm một ô trống để chọn giờ.');
  });

  test('branchLine: tên + địa chỉ khi có; chỉ tên khi danh sách chi nhánh chưa về; null khi chưa biết', () => {
    const branches = [{ id: 3, name: 'Chi nhánh Quận 7', address: 'Quận 7, TP. Hồ Chí Minh' }];
    expect(branchLine(branches, { branch: { id: 3, name: 'x' } }, '')).toEqual({ name: 'Chi nhánh Quận 7', address: 'Quận 7, TP. Hồ Chí Minh' });
    expect(branchLine([], { branch: { id: 3, name: 'Chi nhánh Quận 7' } }, '3')).toEqual({ name: 'Chi nhánh Quận 7', address: '' });
    expect(branchLine(branches, null, '3')).toEqual({ name: 'Chi nhánh Quận 7', address: 'Quận 7, TP. Hồ Chí Minh' });
    expect(branchLine([], null, '')).toBeNull();
  });

  test('branchLine ưu tiên chi nhánh của lưới đang hiện, không phải giá trị vừa chọn dở', () => {
    const branches = [
      { id: 1, name: 'Chi nhánh chính', address: 'A' },
      { id: 3, name: 'Chi nhánh Quận 7', address: 'B' }
    ];
    expect(branchLine(branches, { branch: { id: 1, name: 'Chi nhánh chính' } }, '3').name).toBe('Chi nhánh chính');
  });
});
