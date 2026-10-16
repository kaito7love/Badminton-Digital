// C4 (kế hoạch 32, nhóm E): xuất Excel không để chuỗi do người dùng nhập thành công thức.
// Dựng file bằng đúng buildExcel, đọc lại bằng ExcelJS và kiểm MỌI ô chuỗi.
const ExcelJS = require('exceljs');
const { buildExcel } = require('../src/utils/reportExporter');

const PAYLOADS = [
  '=HYPERLINK("http://evil.example","bấm")',
  '+cmd|\' /C calc\'!A0',
  '-2+3',
  '@SUM(1+1)',
  '\t=1+1',
  '\r=1+1'
];

const fixture = (name) => ({
  generatedAt: '2026-10-15T03:00:00.000Z',
  period: 'daily',
  from: null,
  to: null,
  summary: { totalRevenue: 1000, totalTransactions: 1, totalSessions: 1, totalCourts: 1, operatingCourts: 1, lowStockCount: 0 },
  revenue: [{ date: '2026-10-15', totalRevenue: 1000, totalTransactions: 1 }],
  topCourts: [{ courtId: 1, court: { name }, totalSessions: 1, totalDurationSeconds: 3600 }],
  sessions: [{
    id: 1,
    court: { name },
    customer: { fullName: name, phone: name },
    startTime: '2026-10-15T01:00:00.000Z',
    endTime: '2026-10-15T02:00:00.000Z',
    durationSeconds: 3600,
    courtFee: 100000,
    invoice: { courtFee: 100000, extrasFee: 0, totalAmount: 100000, invoiceNo: 'BD-1-00000001' }
  }],
  topAccessories: [{ extraId: 1, extra: { name, price: 10000 }, totalQuantitySold: 1, totalRevenue: 10000 }]
});

const readCells = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const cells = [];
  wb.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
    const v = cell.value;
    const text = typeof v === 'string' ? v : (v && typeof v === 'object' && 'formula' in v ? `FORMULA:${v.formula}` : null);
    if (text !== null) cells.push({ sheet: sheet.name, address: cell.address, text, isFormula: typeof v === 'object' && v !== null && 'formula' in v });
  })));
  return cells;
};

describe('buildExcel — chống formula injection (C4)', () => {
  test.each(PAYLOADS.map((p, i) => [i, p]))('payload #%i không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt', async (_, payload) => {
    const cells = await readCells(await buildExcel(fixture(payload)));
    expect(cells.length).toBeGreaterThan(10);
    expect(cells.filter((c) => c.isFormula)).toEqual([]);
    const dangerous = cells.filter((c) => /^[=+\-@\t\r]/.test(c.text));
    expect(dangerous).toEqual([]);
  });

  test('nội dung gốc vẫn còn đọc được (chỉ thêm dấu nháy đơn phía trước)', async () => {
    const cells = await readCells(await buildExcel(fixture('=1+1')));
    expect(cells.some((c) => c.text === "'=1+1")).toBe(true);
  });

  test('dữ liệu bình thường không bị đổi', async () => {
    const cells = await readCells(await buildExcel(fixture('Sân số 1 (Thường)')));
    expect(cells.some((c) => c.text === 'Sân số 1 (Thường)')).toBe(true);
    expect(cells.some((c) => c.text.startsWith("'"))).toBe(false);
  });
});
