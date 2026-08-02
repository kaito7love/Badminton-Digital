const SettingService = require('../services/SettingService');
const { successResponse } = require('../utils/responseHandler');

const getSettings = async (req, res, next) => {
  try {
    const settings = await SettingService.getAllSettings();
    return successResponse(res, settings, 'Settings retrieved successfully');
  } catch (err) {
    next(err);
  }
};

const updateSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const updated = await SettingService.updateSetting(key, value);
    return successResponse(res, { [key]: updated }, 'Setting updated successfully');
  } catch (err) {
    next(err);
  }
};

const updatePricing = async (req, res, next) => {
  try {
    const updated = await SettingService.updateSetting('pricing', req.body);
    return successResponse(res, { pricing: updated }, 'Pricing setting updated successfully');
  } catch (err) {
    next(err);
  }
};

const updateOperatingHours = async (req, res, next) => {
  try {
    const updated = await SettingService.updateSetting('operating_hours', req.body);
    return successResponse(res, { operating_hours: updated }, 'Operating hours setting updated successfully');
  } catch (err) {
    next(err);
  }
};

const updateBranding = async (req, res, next) => {
  try {
    const updated = await SettingService.updateSetting('branding', req.body);
    return successResponse(res, { branding: updated }, 'Branding setting updated successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSettings,
  updateSetting,
  updatePricing,
  updateOperatingHours,
  updateBranding
};
