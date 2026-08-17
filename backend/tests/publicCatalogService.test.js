const PublicCatalogService = require('../src/services/PublicCatalogService');

const makeProduct = (variants) => ({
  id: 7,
  name: 'Áo Yonex Thi Đấu Nam',
  category: { id: 2, name: 'Áo thi đấu' },
  variants
});

describe('PublicCatalogService.toPublicProduct', () => {
  test('không để lộ giá vốn hay số tồn, chỉ còn/hết', () => {
    const product = makeProduct([
      { id: 1, sku: 'A-M', size: 'M', color: 'Đỏ', listPrice: '250000.00', trackInventory: true, lowStockThreshold: 5, stocks: [{ quantity: 12, averageCost: 150000 }] }
    ]);

    const [variant] = PublicCatalogService.toPublicProduct(product).variants;

    expect(variant).toEqual({ id: 1, sku: 'A-M', size: 'M', color: 'Đỏ', price: 250000, inStock: true });
  });

  test('hết tồn tại chi nhánh đang xem thì báo hết', () => {
    const product = makeProduct([
      { id: 1, sku: 'A-M', listPrice: '250000.00', trackInventory: true, stocks: [{ quantity: 0 }] },
      { id: 2, sku: 'A-L', listPrice: '250000.00', trackInventory: true, stocks: [] }
    ]);

    const result = PublicCatalogService.toPublicProduct(product);

    expect(result.variants.map((v) => v.inStock)).toEqual([false, false]);
    expect(result.inStock).toBe(false);
  });

  test('hàng không đếm kho luôn nhận được dù không có dòng tồn', () => {
    const product = makeProduct([
      { id: 3, sku: 'CUSTOM', listPrice: '900000.00', trackInventory: false, stocks: [] }
    ]);

    expect(PublicCatalogService.toPublicProduct(product).inStock).toBe(true);
  });

  test('khoảng giá trải từ biến thể rẻ nhất tới đắt nhất', () => {
    const product = makeProduct([
      { id: 1, sku: 'A-M', listPrice: '250000.00', trackInventory: true, stocks: [{ quantity: 3 }] },
      { id: 2, sku: 'A-XL', listPrice: '310000.00', trackInventory: true, stocks: [{ quantity: 1 }] },
      { id: 3, sku: 'A-S', listPrice: '230000.00', trackInventory: true, stocks: [{ quantity: 0 }] }
    ]);

    const result = PublicCatalogService.toPublicProduct(product);

    expect(result.priceFrom).toBe(230000);
    expect(result.priceTo).toBe(310000);
    // Một size hết hàng không làm cả sản phẩm biến mất khỏi kệ
    expect(result.inStock).toBe(true);
  });

  test('sản phẩm chưa có biến thể nào thì không có giá để rao', () => {
    const result = PublicCatalogService.toPublicProduct(makeProduct([]));

    expect(result.priceFrom).toBeNull();
    expect(result.priceTo).toBeNull();
    expect(result.inStock).toBe(false);
  });
});
