const ReportService = require('../services/ReportService');
const { successResponse } = require('../utils/responseHandler');

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

module.exports = {
  getDashboard,
  getRevenue,
  getTopCourts,
  getTopAccessories
};
