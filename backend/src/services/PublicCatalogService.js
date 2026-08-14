const { Op } = require('sequelize');
const { Branch, Court } = require('../models');
const BookingService = require('./BookingService');
const SettingService = require('./SettingService');

/**
 * Dữ liệu cho trang chủ công khai — người xem CHƯA đăng nhập.
 *
 * Tách hẳn khỏi CourtService vì hai bên phục vụ hai đối tượng khác nhau:
 * CourtService trả về cả phiên chơi đang mở, tên khách, ghi chú nội bộ; ở đây
 * chỉ được lộ đúng những gì một tấm biển giá treo ngoài cửa quán cũng nói:
 * sân nào có, giá bao nhiêu, khung giờ nào còn trống. Mọi thứ khác là chuyện
 * nội bộ và phải đi qua đường có xác thực.
 */
class PublicCatalogService {
  /** Chi nhánh mặc định khi khách chưa chọn: chi nhánh đang hoạt động đầu tiên. */
  static async resolveBranch(branchId = null) {
    const where = branchId ? { id: branchId, isActive: true } : { isActive: true };
    const branch = await Branch.findOne({ where, order: [['id', 'ASC']] });
    if (!branch) {
      const error = new Error('Chi nhánh không tồn tại hoặc đã ngưng hoạt động');
      error.statusCode = 404;
      throw error;
    }
    return branch;
  }

  static async getCourts(branchId = null) {
    const branch = await PublicCatalogService.resolveBranch(branchId);

    // Sân ngưng khai thác không còn là hàng hoá đang bán, không đưa lên trang chủ.
    // Sân bảo trì vẫn hiện để khách biết quán có sân đó, nhưng gắn cờ không đặt được.
    const courts = await Court.findAll({
      where: { branchId: branch.id, status: { [Op.in]: ['active', 'maintenance'] } },
      order: [['id', 'ASC']]
    });

    // Khung giờ cao điểm đi kèm bảng giá, nếu không trang chủ không biết áp giá
    // nào và sẽ báo một con số khác với lúc thanh toán.
    const peakHours = await SettingService.getPeakHours();

    return {
      branch: { id: branch.id, name: branch.name },
      peakHours,
      courts: courts.map((court) => ({
        id: court.id,
        name: court.name,
        peakPricePerHour: Number(court.peakPricePerHour),
        offpeakPricePerHour: Number(court.offpeakPricePerHour),
        bookable: court.status === 'active',
        note: court.status === 'maintenance' ? 'Đang bảo trì, tạm không nhận đặt' : null
      }))
    };
  }

  static async checkAvailability({ courtId, bookingDate, startTime, endTime, branchId = null }) {
    const branch = await PublicCatalogService.resolveBranch(branchId);

    // Dùng lại đúng hàm mà luồng đặt sân nội bộ dùng, để trang chủ không bao giờ
    // báo "còn trống" theo một bộ luật khác với lúc bấm đặt thật.
    const result = await BookingService.checkAvailability({
      courtId, bookingDate, startTime, endTime, branchId: branch.id
    });

    // Không trả conflictBookingId ra ngoài: người lạ không cần biết mã lịch của khách khác.
    return { available: result.available, message: result.message };
  }
}

module.exports = PublicCatalogService;
