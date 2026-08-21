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

  /**
   * Ba biến thể field name khác nhau đã từng xuất hiện thật trên các bản cài:
   * đặc tả/`PUT /settings/pricing` dùng `peakStartHour`/`peakEndHour` (số),
   * dữ liệu ghi tay qua API lúc dựng demo dùng `peakStartTime`/`peakEndTime`
   * ("HH:mm"), seeder ghi vào `operating_hours.peak_start`/`peak_end`
   * ("HH:mm"). Dò đủ cả ba trước khi rơi về mặc định cứng — chỉ đọc đúng
   * MỘT trong ba là do bỏ sót các biến thể còn lại.
   */
  static async getPeakHours() {
    const pricing = await SettingService.getSettingByKey('pricing');
    const hours = await SettingService.getSettingByKey('operating_hours');
    const hourOf = (v) => (typeof v === 'string' ? Number(v.slice(0, 2)) : Number(v));
    const start = [pricing?.peakStartHour, pricing?.peakStartTime, hours?.peak_start].map(hourOf).find(Number.isFinite);
    const end = [pricing?.peakEndHour, pricing?.peakEndTime, hours?.peak_end].map(hourOf).find(Number.isFinite);
    return {
      peakStartHour: Number.isFinite(start) ? start : 17,
      peakEndHour: Number.isFinite(end) ? end : 22
    };
  }
}

module.exports = SettingService;
