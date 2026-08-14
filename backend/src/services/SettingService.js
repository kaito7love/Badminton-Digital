const { Setting } = require('../models');

class SettingService {
  static async getAllSettings() {
    const settings = await Setting.findAll();
    const result = {};
    settings.forEach(s => {
      result[s.key] = s.value;
    });
    return result;
  }

  static async getSettingByKey(key) {
    const setting = await Setting.findOne({ where: { key } });
    return setting ? setting.value : null;
  }

  static async updateSetting(key, value) {
    let setting = await Setting.findOne({ where: { key } });
    if (!setting) {
      setting = await Setting.create({ key, value });
    } else {
      await setting.update({ value });
    }
    return setting.value;
  }

  static async getPeakHours() {
    const pricing = await SettingService.getSettingByKey('pricing');
    const peakStartHour = Number(pricing?.peakStartHour);
    const peakEndHour = Number(pricing?.peakEndHour);
    return {
      peakStartHour: Number.isFinite(peakStartHour) ? peakStartHour : 17,
      peakEndHour: Number.isFinite(peakEndHour) ? peakEndHour : 22
    };
  }
}

module.exports = SettingService;
