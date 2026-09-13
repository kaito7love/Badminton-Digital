const { Op } = require('sequelize');
const {
  Branch,
  Court,
  Product,
  ProductCategory,
  ProductVariant,
  ProductStock
} = require('../models');
const BookingService = require('./BookingService');
const SettingService = require('./SettingService');
const { isTransferEnabled } = require('../utils/paymentConfig');

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

  /**
   * Rút một sản phẩm về đúng những gì tấm nhãn treo trên kệ nói: tên, phân
   * loại, size/màu, giá niêm yết, còn hay hết. Giá vốn và số tồn chính xác là
   * chuyện nội bộ — biết quán còn đúng 2 cái vợt không giúp khách mua hàng,
   * nhưng giúp đối thủ định giá.
   */
  static toPublicProduct(product) {
    const variants = (product.variants || []).map((variant) => {
      const quantity = (variant.stocks || []).reduce((sum, stock) => sum + Number(stock.quantity || 0), 0);
      return {
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        price: Number(variant.listPrice),
        // Hàng không đếm kho (đặt riêng, dịch vụ) luôn nhận được — chỉ hàng có
        // theo dõi tồn mới có khái niệm "hết".
        inStock: !variant.trackInventory || quantity > 0
      };
    });

    const prices = variants.map((v) => v.price);
    return {
      id: product.id,
      name: product.name,
      category: product.category ? { id: product.category.id, name: product.category.name } : null,
      variants,
      priceFrom: prices.length ? Math.min(...prices) : null,
      priceTo: prices.length ? Math.max(...prices) : null,
      inStock: variants.some((v) => v.inStock)
    };
  }

  /**
   * Kệ hàng phụ kiện/trang phục bày cho khách xem trước khi tới quán.
   *
   * Chỉ hàng bán lẻ (`retail`) và đang mở bán: đồ cho thuê, vật tư tiêu hao và
   * dịch vụ là chuyện của quầy, không phải hàng trên kệ. Còn/hết tính theo tồn
   * của đúng chi nhánh khách đang xem — hàng nằm ở chi nhánh khác thì khách
   * đến đây vẫn không mua được.
   */
  static async getProducts(branchId = null) {
    const branch = await PublicCatalogService.resolveBranch(branchId);

    const products = await Product.findAll({
      where: { isActive: true, productType: 'retail' },
      order: [['id', 'DESC']],
      include: [
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
        {
          model: ProductVariant,
          as: 'variants',
          include: [{
            model: ProductStock,
            as: 'stocks',
            where: { branchId: branch.id },
            required: false,
            attributes: ['quantity']
          }]
        }
      ]
    });

    const categories = await ProductCategory.findAll({
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });

    return {
      branch: { id: branch.id, name: branch.name },
      categories: categories.map((category) => ({ id: category.id, name: category.name })),
      products: products.map(PublicCatalogService.toPublicProduct)
    };
  }

  /**
   * Một sản phẩm cho trang chi tiết, kèm vài món cùng danh mục để khách xem
   * tiếp. Đường dẫn /shop/:id phải mở được từ link chia sẻ, nên không thể bắt
   * khách đi qua danh sách mới xem được hàng.
   */
  static async getProductById(id, branchId = null) {
    const branch = await PublicCatalogService.resolveBranch(branchId);

    const product = await Product.findOne({
      where: { id, isActive: true, productType: 'retail' },
      include: [
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
        {
          model: ProductVariant,
          as: 'variants',
          include: [{
            model: ProductStock,
            as: 'stocks',
            where: { branchId: branch.id },
            required: false,
            attributes: ['quantity']
          }]
        }
      ]
    });

    if (!product) {
      const error = new Error('Sản phẩm không tồn tại hoặc đã ngừng bán');
      error.statusCode = 404;
      throw error;
    }

    const related = product.categoryId
      ? await Product.findAll({
        where: {
          isActive: true,
          productType: 'retail',
          categoryId: product.categoryId,
          id: { [Op.ne]: product.id }
        },
        limit: 4,
        order: [['id', 'DESC']],
        include: [
          { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
          {
            model: ProductVariant,
            as: 'variants',
            include: [{
              model: ProductStock,
              as: 'stocks',
              where: { branchId: branch.id },
              required: false,
              attributes: ['quantity']
            }]
          }
        ]
      })
      : [];

    return {
      branch: { id: branch.id, name: branch.name },
      product: PublicCatalogService.toPublicProduct(product),
      related: related.map(PublicCatalogService.toPublicProduct)
    };
  }

  /**
   * Danh sách cửa hàng để khách chọn nơi mua/nhận hàng. Tồn kho và giá đã theo
   * chi nhánh, nên khách phải chọn được chi nhánh chứ không thể mặc định mãi
   * một nơi rồi tới lấy hàng ở chỗ không có hàng.
   *
   * `transferEnabled`: trang đặt hàng và POS dựa vào đây để ẩn lựa chọn chuyển
   * khoản khi chưa cấu hình tài khoản nhận tiền + webhook (utils/paymentConfig).
   * Hiện cả chuỗi dùng chung một cấu hình nên mọi chi nhánh cùng giá trị; để theo
   * từng chi nhánh là chỗ sẵn nếu sau này mỗi chi nhánh có tài khoản riêng. Chỉ
   * là cờ bật/tắt — số tài khoản không bao giờ đi qua route công khai này.
   */
  static async getBranches() {
    const branches = await Branch.findAll({
      where: { isActive: true },
      order: [['id', 'ASC']]
    });
    const transferEnabled = isTransferEnabled();
    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
      transferEnabled
    }));
  }
}

module.exports = PublicCatalogService;
