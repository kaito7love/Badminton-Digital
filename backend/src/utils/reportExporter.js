const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Roboto-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Roboto-Bold.ttf');

const MONEY_FORMAT = '#,##0" đ"';

const PERIOD_LABELS = {
  daily: 'Theo ngày',
  monthly: 'Theo tháng',
  yearly: 'Theo năm'
};

const num = (value) => Number(value || 0);

const formatMoney = (value) => `${num(value).toLocaleString('vi-VN')} đ`;

const pad = (n) => String(n).padStart(2, '0');

// Định dạng dd/MM/yyyy HH:mm — toLocaleString('vi-VN') trả giờ trước ngày, đọc khó
const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(num(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}p` : `${m} phút`;
};

const rangeLabel = ({ from, to }) => {
  if (from && to) return `${from} → ${to}`;
  if (from) return `Từ ${from}`;
  if (to) return `Đến ${to}`;
  return 'Toàn bộ dữ liệu';
};

const customerLabel = (session) =>
  session.customer?.fullName || 'Khách vãng lai';

/* ────────────────────────────── EXCEL ────────────────────────────── */

const styleHeaderRow = (row) => {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
};

// Tiêu đề mục phải merge hết chiều ngang, nếu để ô rỗng bên cạnh Excel sẽ cắt chữ
const addSectionHeading = (sheet, text, columnCount) => {
  const row = sheet.addRow([text]);
  row.font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
  sheet.mergeCells(row.number, 1, row.number, columnCount);
  return row;
};

const addTitleBlock = (sheet, title, data, columnCount) => {
  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 14 };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount);

  const metaRow = sheet.addRow([
    `Kỳ: ${PERIOD_LABELS[data.period] || data.period} | Phạm vi: ${rangeLabel(data)} | Xuất lúc: ${formatDateTime(data.generatedAt)}`
  ]);
  metaRow.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  sheet.mergeCells(metaRow.number, 1, metaRow.number, columnCount);

  sheet.addRow([]);
};

const buildRevenueSheet = (workbook, data) => {
  const sheet = workbook.addWorksheet('Doanh thu');
  sheet.columns = [{ width: 22 }, { width: 20 }, { width: 18 }];

  addTitleBlock(sheet, 'BÁO CÁO DOANH THU — BADMINTON DIGITAL', data, 3);

  addSectionHeading(sheet, 'TỔNG QUAN', 3);
  sheet.addRow(['Tổng doanh thu', num(data.summary.totalRevenue)]).getCell(2).numFmt = MONEY_FORMAT;
  sheet.addRow(['Số giao dịch', num(data.summary.totalTransactions)]);
  sheet.addRow(['Số phiên chơi', num(data.summary.totalSessions)]);
  sheet.addRow(['Số sân', num(data.summary.totalCourts)]);
  sheet.addRow(['Phụ kiện sắp hết hàng', num(data.summary.lowStockCount)]);
  sheet.addRow([]);

  const revenueHeader = sheet.addRow(['Ngày', 'Doanh thu', 'Số giao dịch']);
  styleHeaderRow(revenueHeader);

  data.revenue.forEach((row) => {
    const added = sheet.addRow([row.date, num(row.totalRevenue), num(row.totalTransactions)]);
    added.getCell(2).numFmt = MONEY_FORMAT;
  });

  if (data.revenue.length > 0) {
    const totalRow = sheet.addRow([
      'TỔNG CỘNG',
      num(data.summary.totalRevenue),
      num(data.summary.totalTransactions)
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(2).numFmt = MONEY_FORMAT;
  } else {
    sheet.addRow(['Không có dữ liệu doanh thu trong kỳ']);
  }

  sheet.addRow([]);
  addSectionHeading(sheet, 'TOP SÂN ĐƯỢC THUÊ NHIỀU NHẤT', 3);

  const courtsHeader = sheet.addRow(['Sân', 'Số phiên', 'Tổng thời gian']);
  styleHeaderRow(courtsHeader);

  data.topCourts.forEach((court) => {
    sheet.addRow([
      court.court?.name || `Sân #${court.courtId}`,
      num(court.totalSessions),
      formatDuration(court.totalDurationSeconds)
    ]);
  });

  return sheet;
};

const buildSessionsSheet = (workbook, data) => {
  const sheet = workbook.addWorksheet('Phiên chơi');
  sheet.columns = [
    { header: 'Mã phiên', key: 'id', width: 10 },
    { header: 'Sân', key: 'court', width: 22 },
    { header: 'Khách hàng', key: 'customer', width: 24 },
    { header: 'SĐT', key: 'phone', width: 14 },
    { header: 'Bắt đầu', key: 'start', width: 20 },
    { header: 'Kết thúc', key: 'end', width: 20 },
    { header: 'Thời lượng', key: 'duration', width: 14 },
    { header: 'Tiền sân', key: 'courtFee', width: 16 },
    { header: 'Phụ kiện', key: 'extrasFee', width: 16 },
    { header: 'Giảm giá', key: 'discount', width: 14 },
    { header: 'Tổng cộng', key: 'total', width: 16 },
    { header: 'Số hóa đơn', key: 'invoiceNo', width: 20 },
    { header: 'Trạng thái HĐ', key: 'invoiceStatus', width: 14 }
  ];
  styleHeaderRow(sheet.getRow(1));

  data.sessions.forEach((session) => {
    const invoice = session.invoice;
    const row = sheet.addRow({
      id: session.id,
      court: session.court?.name || '—',
      customer: customerLabel(session),
      phone: session.customer?.phone || '—',
      start: formatDateTime(session.startTime),
      end: formatDateTime(session.endTime),
      duration: formatDuration(session.durationSeconds),
      courtFee: num(invoice?.courtFee ?? session.courtFee),
      extrasFee: num(invoice?.extrasFee),
      discount: num(invoice?.discountAmount),
      total: num(invoice?.totalAmount),
      invoiceNo: invoice?.invoiceNo || 'Chưa xuất HĐ',
      invoiceStatus: invoice?.status || '—'
    });
    ['courtFee', 'extrasFee', 'discount', 'total'].forEach((key) => {
      row.getCell(key).numFmt = MONEY_FORMAT;
    });
  });

  if (data.sessions.length === 0) {
    sheet.addRow({ id: '', court: 'Không có phiên chơi nào trong kỳ' });
  }

  return sheet;
};

const buildAccessoriesSheet = (workbook, data) => {
  const sheet = workbook.addWorksheet('Phụ kiện');
  sheet.columns = [
    { header: 'Phụ kiện', key: 'name', width: 34 },
    { header: 'Đơn giá', key: 'price', width: 16 },
    { header: 'Số lượng bán', key: 'quantity', width: 16 },
    { header: 'Doanh thu', key: 'revenue', width: 18 }
  ];
  styleHeaderRow(sheet.getRow(1));

  data.topAccessories.forEach((item) => {
    const row = sheet.addRow({
      name: item.extra?.name || `Phụ kiện #${item.extraId}`,
      price: num(item.extra?.price),
      quantity: num(item.totalQuantitySold),
      revenue: num(item.totalRevenue)
    });
    row.getCell('price').numFmt = MONEY_FORMAT;
    row.getCell('revenue').numFmt = MONEY_FORMAT;
  });

  if (data.topAccessories.length === 0) {
    sheet.addRow({ name: 'Chưa bán phụ kiện nào' });
  }

  return sheet;
};

const buildExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Badminton Digital Management';
  workbook.created = new Date(data.generatedAt);

  buildRevenueSheet(workbook, data);
  buildSessionsSheet(workbook, data);
  buildAccessoriesSheet(workbook, data);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

/* ─────────────────────────────── PDF ─────────────────────────────── */

const COLORS = {
  heading: '#0f172a',
  muted: '#64748b',
  accent: '#059669',
  headerBg: '#059669',
  stripe: '#f1f5f9',
  border: '#e2e8f0'
};

const contentWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

// PDFKit giữ lại doc.x của lần vẽ text gần nhất; sau khi vẽ bảng (các ô có x riêng)
// phải kéo con trỏ về lề trái, nếu không đoạn text kế tiếp sẽ bị thụt sang phải và xuống dòng
const resetX = (doc) => {
  doc.x = doc.page.margins.left;
};

const ensureSpace = (doc, needed) => {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    resetX(doc);
  }
};

const drawSectionTitle = (doc, title) => {
  doc.moveDown(0.8);
  ensureSpace(doc, 52);
  resetX(doc);
  doc.font('Bold').fontSize(13).fillColor(COLORS.heading)
    .text(title, doc.page.margins.left, doc.y, { width: contentWidth(doc), align: 'left' });
  doc.moveDown(0.4);
  resetX(doc);
};

const drawTable = (doc, { columns, rows, emptyText }) => {
  const startX = doc.page.margins.left;
  const rowHeight = 20;

  const drawHeader = () => {
    ensureSpace(doc, rowHeight * 2);
    const y = doc.y;
    doc.rect(startX, y, columns.reduce((sum, c) => sum + c.width, 0), rowHeight).fill(COLORS.headerBg);
    let x = startX;
    doc.font('Bold').fontSize(9).fillColor('#ffffff');
    columns.forEach((col) => {
      doc.text(col.label, x + 6, y + 6, { width: col.width - 12, align: col.align || 'left' });
      x += col.width;
    });
    doc.y = y + rowHeight;
  };

  drawHeader();

  if (!rows.length) {
    doc.font('Regular').fontSize(9).fillColor(COLORS.muted)
      .text(emptyText || 'Không có dữ liệu', startX + 6, doc.y + 6, { width: contentWidth(doc) - 12 });
    doc.moveDown(1.2);
    resetX(doc);
    return;
  }

  rows.forEach((row, index) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);

    if (index % 2 === 1) {
      doc.rect(startX, y, tableWidth, rowHeight).fill(COLORS.stripe);
    }
    doc.rect(startX, y, tableWidth, rowHeight).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    let x = startX;
    doc.font('Regular').fontSize(9).fillColor(COLORS.heading);
    columns.forEach((col) => {
      doc.text(String(row[col.key] ?? '—'), x + 6, y + 6, {
        width: col.width - 12,
        align: col.align || 'left',
        lineBreak: false,
        ellipsis: true
      });
      x += col.width;
    });
    doc.y = y + rowHeight;
  });

  doc.moveDown(0.5);
  resetX(doc);
};

const buildPdf = (data) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'Báo cáo Badminton Digital' } });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('Regular', FONT_REGULAR);
      doc.registerFont('Bold', FONT_BOLD);

      // Header
      doc.font('Bold').fontSize(20).fillColor(COLORS.heading).text('BÁO CÁO KINH DOANH');
      doc.font('Bold').fontSize(12).fillColor(COLORS.accent).text('Badminton Digital Management');
      doc.font('Regular').fontSize(9).fillColor(COLORS.muted)
        .text(`Kỳ báo cáo: ${PERIOD_LABELS[data.period] || data.period}  |  Phạm vi: ${rangeLabel(data)}`)
        .text(`Xuất lúc: ${formatDateTime(data.generatedAt)}`);

      doc.moveDown(0.8);
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor(COLORS.accent).lineWidth(2).stroke();

      // Tổng quan
      drawSectionTitle(doc, 'Tổng quan');
      drawTable(doc, {
        columns: [
          { key: 'label', label: 'Chỉ số', width: 260 },
          { key: 'value', label: 'Giá trị', width: 255, align: 'right' }
        ],
        rows: [
          { label: 'Tổng doanh thu', value: formatMoney(data.summary.totalRevenue) },
          { label: 'Số giao dịch', value: num(data.summary.totalTransactions).toLocaleString('vi-VN') },
          { label: 'Số phiên chơi', value: num(data.summary.totalSessions).toLocaleString('vi-VN') },
          { label: 'Doanh thu hôm nay', value: formatMoney(data.summary.todayRevenue) },
          { label: 'Sân đang hoạt động', value: `${num(data.summary.activeCourts)} / ${num(data.summary.totalCourts)} (${num(data.summary.occupancyRate)}%)` },
          { label: 'Phụ kiện sắp hết hàng', value: `${num(data.summary.lowStockCount)} sản phẩm` }
        ]
      });

      // Doanh thu theo kỳ
      drawSectionTitle(doc, 'Doanh thu theo kỳ');
      drawTable(doc, {
        columns: [
          { key: 'date', label: 'Ngày', width: 200 },
          { key: 'revenue', label: 'Doanh thu', width: 175, align: 'right' },
          { key: 'transactions', label: 'Số giao dịch', width: 140, align: 'right' }
        ],
        rows: data.revenue.map((row) => ({
          date: row.date,
          revenue: formatMoney(row.totalRevenue),
          transactions: num(row.totalTransactions).toLocaleString('vi-VN')
        })),
        emptyText: 'Không có dữ liệu doanh thu trong kỳ'
      });

      // Top sân
      drawSectionTitle(doc, 'Top sân được thuê nhiều nhất');
      drawTable(doc, {
        columns: [
          { key: 'name', label: 'Sân', width: 250 },
          { key: 'sessions', label: 'Số phiên', width: 130, align: 'right' },
          { key: 'duration', label: 'Tổng thời gian', width: 135, align: 'right' }
        ],
        rows: data.topCourts.map((court) => ({
          name: court.court?.name || `Sân #${court.courtId}`,
          sessions: num(court.totalSessions).toLocaleString('vi-VN'),
          duration: formatDuration(court.totalDurationSeconds)
        })),
        emptyText: 'Chưa có phiên chơi nào'
      });

      // Top phụ kiện
      drawSectionTitle(doc, 'Top phụ kiện bán chạy');
      drawTable(doc, {
        columns: [
          { key: 'name', label: 'Phụ kiện', width: 250 },
          { key: 'quantity', label: 'Số lượng', width: 130, align: 'right' },
          { key: 'revenue', label: 'Doanh thu', width: 135, align: 'right' }
        ],
        rows: data.topAccessories.map((item) => ({
          name: item.extra?.name || `Phụ kiện #${item.extraId}`,
          quantity: num(item.totalQuantitySold).toLocaleString('vi-VN'),
          revenue: formatMoney(item.totalRevenue)
        })),
        emptyText: 'Chưa bán phụ kiện nào'
      });

      doc.moveDown(1);
      resetX(doc);
      doc.font('Regular').fontSize(8).fillColor(COLORS.muted)
        .text('Báo cáo được tạo tự động bởi hệ thống Badminton Digital Management.',
          doc.page.margins.left, doc.y, { width: contentWidth(doc), align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });

module.exports = {
  buildExcel,
  buildPdf
};
