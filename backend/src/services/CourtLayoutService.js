const fs = require('fs/promises');
const path = require('path');
const { Court } = require('../models');

const LAYOUTS_DIR = path.join(__dirname, '../../public/layouts');
const ZONE_CLASSES = ['parking', 'wait', 'counter', 'office', 'show', 'entrance', 'back', 'custom'];

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

class CourtLayoutService {
  /**
   * Ghi đè file sơ đồ của đúng 1 chi nhánh (backend/public/layouts/branch-<id>.json).
   * courtName trong payload phải khớp sân thật của chi nhánh này — chặn ngay ở
   * đây thay vì để sân "biến mất" khỏi sơ đồ vì gõ sai tên (đúng lỗi đã gặp
   * lúc build sơ đồ đọc phía khách hàng).
   */
  static async saveLayout(branchId, payload) {
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh để lưu sơ đồ');
      error.statusCode = 400;
      throw error;
    }

    const { canvas, courts, zones } = payload;

    for (const c of courts) {
      if (typeof c.courtName !== 'string' || !c.courtName.trim() || !isFiniteNumber(c.x) || !isFiniteNumber(c.y)) {
        const error = new Error('Dữ liệu sân trong sơ đồ không hợp lệ');
        error.statusCode = 400;
        throw error;
      }
    }
    for (const z of zones) {
      if (
        typeof z.label !== 'string' || !z.label.trim() ||
        !isFiniteNumber(z.x) || !isFiniteNumber(z.y) ||
        !isFiniteNumber(z.w) || !isFiniteNumber(z.h) || z.w <= 0 || z.h <= 0
      ) {
        const error = new Error('Dữ liệu khu vực trong sơ đồ không hợp lệ');
        error.statusCode = 400;
        throw error;
      }
    }

    const realCourts = await Court.findAll({ where: { branchId }, attributes: ['name'] });
    const realNames = new Set(realCourts.map((c) => c.name));
    const unknown = [...new Set(courts.map((c) => c.courtName))].filter((n) => !realNames.has(n));
    if (unknown.length) {
      const error = new Error(`Tên sân không khớp dữ liệu thật của chi nhánh: ${unknown.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const clean = {
      branchId,
      canvas: { width: Math.round(canvas.width), height: Math.round(canvas.height) },
      courts: courts.map((c) => ({
        courtName: c.courtName,
        x: Math.round(c.x),
        y: Math.round(c.y),
        rotation: Number(c.rotation) || 0
      })),
      zones: zones.map((z) => ({
        label: z.label.trim(),
        x: Math.round(z.x),
        y: Math.round(z.y),
        w: Math.round(z.w),
        h: Math.round(z.h),
        cls: ZONE_CLASSES.includes(z.cls) ? z.cls : 'custom',
        rotation: Number(z.rotation) || 0
      }))
    };

    await fs.mkdir(LAYOUTS_DIR, { recursive: true });
    const finalPath = path.join(LAYOUTS_DIR, `branch-${branchId}.json`);
    const tmpPath = `${finalPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(clean, null, 2), 'utf8');
    await fs.rename(tmpPath, finalPath);

    return clean;
  }
}

module.exports = CourtLayoutService;
