const ReportService = require('../services/ReportService');
const { successResponse } = require('../utils/responseHandler');
const { buildExcel, buildPdf } = require('../utils/reportExporter');

// Tên file chỉ dùng ký tự ASCII để header Content-Disposition an toàn với mọi trình duyệt
const buildFileName = (extension, { from, to }) => {
  const stamp = from || to ? `${from || 'dau'}_${to || 'nay'}` : new Date().toISOString().slice(0, 10);
  return `bao-cao-badminton-${stamp}.${extension}`;
};

const collectExportData = (req) =>
  ReportService.getExportData({
    period: req.query.period || 'daily',
    from: req.query.from || null,
    to: req.query.to || null,
    branchId: req.branchId
  });

const getDashboard = async (req, res, next) => {
  try {
    const summary = await ReportService.getDashboardSummary(req.branchId);
    return successResponse(res, summary, 'Dashboard summary retrieved');
  } catch (err) {
    next(err);
  }
};

const getRevenue = async (req, res, next) => {
  try {
    const period = req.query.period || 'daily';
    const revenue = await ReportService.getRevenueReport(period, req.branchId);
    return successResponse(res, revenue, 'Revenue report retrieved');
  } catch (err) {
    next(err);
  }
};

const getTopCourts = async (req, res, next) => {
  try {
    const courts = await ReportService.getTopCourts(req.branchId);
    return successResponse(res, courts, 'Top courts report retrieved');
  } catch (err) {
    next(err);
  }
};

const getTopAccessories = async (req, res, next) => {
  try {
    const accessories = await ReportService.getTopAccessories(req.branchId);
    return successResponse(res, accessories, 'Top accessories report retrieved');
  } catch (err) {
    next(err);
  }
};

const exportExcel = async (req, res, next) => {
  try {
    const data = await collectExportData(req);
    const buffer = await buildExcel(data);
    const fileName = buildFileName('xlsx', data);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
};

const exportPdf = async (req, res, next) => {
  try {
    const data = await collectExportData(req);
    const buffer = await buildPdf(data);
    const fileName = buildFileName('pdf', data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
  getRevenue,
  getTopCourts,
  getTopAccessories,
  exportExcel,
  exportPdf
};
