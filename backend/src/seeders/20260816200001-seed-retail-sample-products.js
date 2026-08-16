'use strict';

// Dữ liệu mẫu cho trụ "bán lẻ dụng cụ cầu lông" (feat/retail-catalog-inventory)
// — vài danh mục/sản phẩm/biến thể thật để test tay UI catalog/POS/kho mới,
// theo đúng mẫu seeder trước đó (20260815100001-seed-inventory-sample-data.js):
// tra lại id bằng khoá tự nhiên (name/sku), không hardcode id, và set tồn kho
// trực tiếp thay vì gọi qua service layer.
//
// Giả định seeder inventory mẫu đã chạy trước (dùng lại supplier "Yonex Việt
// Nam"), và branch id=1 tồn tại (migration M1).

const BRANCH_ID = 1;
const RECEIVED_BY_USER_ID = 1;
const SUPPLIER_NAME = 'Yonex Việt Nam';

const CATEGORIES = ['Vợt cầu lông', 'Áo thi đấu', 'Quần thi đấu', 'Phụ kiện'];

// { categoryName, productType, name, variants: [{ sku, size, color, listPrice, lowStockThreshold, initialQty, unitCost }] }
const PRODUCTS = [
  {
    categoryName: 'Vợt cầu lông',
    productType: 'retail',
    name: 'Vợt Yonex Astrox 100ZZ',
    variants: [
      { sku: 'YNX-AX100ZZ', size: null, color: 'Đen Cam', listPrice: 4500000, lowStockThreshold: 2, initialQty: 8, unitCost: 3600000 }
    ]
  },
  {
    categoryName: 'Vợt cầu lông',
    productType: 'retail',
    name: 'Vợt Yonex Nanoflare 800',
    variants: [
      { sku: 'YNX-NF800', size: null, color: 'Trắng Xanh', listPrice: 3800000, lowStockThreshold: 2, initialQty: 6, unitCost: 3000000 }
    ]
  },
  {
    categoryName: 'Áo thi đấu',
    productType: 'retail',
    name: 'Áo Yonex Thi Đấu Nam',
    variants: [
      { sku: 'YNX-SHIRT-M-RED', size: 'M', color: 'Đỏ', listPrice: 250000, lowStockThreshold: 5, initialQty: 20, unitCost: 150000 },
      { sku: 'YNX-SHIRT-L-RED', size: 'L', color: 'Đỏ', listPrice: 250000, lowStockThreshold: 5, initialQty: 20, unitCost: 150000 },
      { sku: 'YNX-SHIRT-M-BLUE', size: 'M', color: 'Xanh Dương', listPrice: 250000, lowStockThreshold: 5, initialQty: 15, unitCost: 150000 },
      { sku: 'YNX-SHIRT-L-BLUE', size: 'L', color: 'Xanh Dương', listPrice: 250000, lowStockThreshold: 5, initialQty: 15, unitCost: 150000 }
    ]
  },
  {
    categoryName: 'Quần thi đấu',
    productType: 'retail',
    name: 'Quần Yonex Thi Đấu',
    variants: [
      { sku: 'YNX-SHORT-M', size: 'M', color: 'Đen', listPrice: 220000, lowStockThreshold: 5, initialQty: 18, unitCost: 130000 },
      { sku: 'YNX-SHORT-L', size: 'L', color: 'Đen', listPrice: 220000, lowStockThreshold: 5, initialQty: 18, unitCost: 130000 }
    ]
  },
  {
    categoryName: 'Phụ kiện',
    productType: 'retail',
    name: 'Quấn Cán Vợt Yonex',
    variants: [
      { sku: 'YNX-GRIP-WHITE', size: null, color: 'Trắng', listPrice: 25000, lowStockThreshold: 10, initialQty: 60, unitCost: 12000 }
    ]
  },
  {
    categoryName: 'Phụ kiện',
    productType: 'retail',
    name: 'Túi Đựng Vợt Yonex 6 Ngăn',
    variants: [
      { sku: 'YNX-BAG-6', size: null, color: 'Đen', listPrice: 650000, lowStockThreshold: 3, initialQty: 5, unitCost: 480000 }
    ]
  },
  {
    categoryName: 'Phụ kiện',
    productType: 'retail',
    name: 'Băng Cổ Tay Thể Thao',
    variants: [
      { sku: 'WRISTBAND-BLACK', size: null, color: 'Đen', listPrice: 35000, lowStockThreshold: 10, initialQty: 40, unitCost: 18000 }
    ]
  }
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [existing] = await queryInterface.sequelize.query(
      'SELECT sku FROM product_variants WHERE sku IN (:skus)',
      { replacements: { skus: PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku)) } }
    );
    if (existing.length) {
      throw new Error(
        `Đã có ${existing.length} SKU mẫu tồn tại sẵn (vd '${existing[0].sku}') — seeder này chỉ chạy trên catalog trống. ` +
        `Dùng "npx sequelize-cli db:seed:undo --seed 20260816200001-seed-retail-sample-products.js" nếu muốn chạy lại.`
      );
    }

    // 1. Categories
    await queryInterface.bulkInsert(
      'product_categories',
      CATEGORIES.map((name, i) => ({ name, sort_order: i, created_at: now, updated_at: now })),
      {}
    );
    const [categoryRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM product_categories WHERE name IN (:names)',
      { replacements: { names: CATEGORIES } }
    );
    const categoryIdByName = Object.fromEntries(categoryRows.map((r) => [r.name, r.id]));

    // 2. Products
    await queryInterface.bulkInsert(
      'products',
      PRODUCTS.map((p) => ({
        category_id: categoryIdByName[p.categoryName],
        product_type: p.productType,
        name: p.name,
        is_active: true,
        legacy_extra_id: null,
        created_at: now,
        updated_at: now
      })),
      {}
    );
    const [productRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM products WHERE name IN (:names)',
      { replacements: { names: PRODUCTS.map((p) => p.name) } }
    );
    const productIdByName = Object.fromEntries(productRows.map((r) => [r.name, r.id]));

    // 3. Variants (SKU)
    await queryInterface.bulkInsert(
      'product_variants',
      PRODUCTS.flatMap((p) =>
        p.variants.map((v) => ({
          product_id: productIdByName[p.name],
          sku: v.sku,
          size: v.size,
          color: v.color,
          list_price: v.listPrice,
          track_inventory: true,
          low_stock_threshold: v.lowStockThreshold,
          created_at: now,
          updated_at: now
        }))
      ),
      {}
    );
    const [variantRows] = await queryInterface.sequelize.query(
      'SELECT id, sku FROM product_variants WHERE sku IN (:skus)',
      { replacements: { skus: PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku)) } }
    );
    const variantIdBySku = Object.fromEntries(variantRows.map((r) => [r.sku, r.id]));

    // 4. Nhập kho ban đầu (goods receipt) cho branch 1, dùng lại nhà cung cấp
    //    "Yonex Việt Nam" nếu đã có (từ seeder inventory mẫu), bỏ qua supplier
    //    nếu chưa tồn tại thay vì tạo trùng.
    const [supplierRows] = await queryInterface.sequelize.query(
      'SELECT id FROM suppliers WHERE name = :name LIMIT 1',
      { replacements: { name: SUPPLIER_NAME } }
    );
    const supplierId = supplierRows[0]?.id || null;

    const [[seqRow]] = await queryInterface.sequelize.query(
      "SELECT next_value FROM branch_document_sequences WHERE branch_id = :branchId AND document_type = 'goods_receipt'",
      { replacements: { branchId: BRANCH_ID } }
    );
    if (!seqRow) {
      throw new Error('Chưa có sequence goods_receipt cho branch — chạy migration inventory-foundation trước.');
    }
    let nextValue = Number(seqRow.next_value);
    const receiptCode = `GR-${BRANCH_ID}-${String(nextValue++).padStart(8, '0')}`;

    const allVariants = PRODUCTS.flatMap((p) => p.variants);
    await queryInterface.bulkInsert('goods_receipts', [{
      branch_id: BRANCH_ID,
      code: receiptCode,
      supplier_id: supplierId,
      received_by_user_id: RECEIVED_BY_USER_ID,
      note: 'Nhập kho ban đầu — dữ liệu mẫu catalog bán lẻ',
      total_cost: allVariants.reduce((sum, v) => sum + v.initialQty * v.unitCost, 0),
      created_at: now,
      updated_at: now,
      version: 0
    }], {});
    const [[receiptRow]] = await queryInterface.sequelize.query(
      'SELECT id FROM goods_receipts WHERE code = :code',
      { replacements: { code: receiptCode } }
    );

    await queryInterface.bulkInsert(
      'goods_receipt_items',
      allVariants.map((v) => ({
        goods_receipt_id: receiptRow.id,
        extra_id: null,
        product_variant_id: variantIdBySku[v.sku],
        quantity: v.initialQty,
        unit_cost: v.unitCost,
        subtotal: v.initialQty * v.unitCost,
        created_at: now,
        updated_at: now
      })),
      {}
    );

    await queryInterface.bulkInsert(
      'stock_movements',
      allVariants.map((v) => ({
        branch_id: BRANCH_ID,
        extra_id: null,
        product_variant_id: variantIdBySku[v.sku],
        type: 'purchase_receipt',
        quantity: v.initialQty,
        unit_cost: v.unitCost,
        note: 'Nhập kho ban đầu — dữ liệu mẫu catalog bán lẻ',
        reference_type: 'goods_receipt',
        reference_id: receiptRow.id,
        actor_user_id: RECEIVED_BY_USER_ID,
        created_at: now
      })),
      {}
    );

    // 5. product_stocks — tồn kho ban đầu = số lượng nhập (không có tồn kho
    //    cũ nào trước đó nên giá vốn bình quân = unitCost).
    await queryInterface.bulkInsert(
      'product_stocks',
      allVariants.map((v) => ({
        product_variant_id: variantIdBySku[v.sku],
        branch_id: BRANCH_ID,
        quantity: v.initialQty,
        average_cost: v.unitCost,
        created_at: now,
        updated_at: now,
        version: 0
      })),
      {}
    );

    await queryInterface.sequelize.query(
      "UPDATE branch_document_sequences SET next_value = :nextValue WHERE branch_id = :branchId AND document_type = 'goods_receipt'",
      { replacements: { nextValue, branchId: BRANCH_ID } }
    );
  },

  async down(queryInterface) {
    const skus = PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku));
    const [variantRows] = await queryInterface.sequelize.query(
      'SELECT id FROM product_variants WHERE sku IN (:skus)',
      { replacements: { skus } }
    );
    const variantIds = variantRows.map((r) => r.id);

    if (variantIds.length) {
      await queryInterface.bulkDelete('product_stocks', { product_variant_id: variantIds }, {});
      await queryInterface.bulkDelete('stock_movements', { product_variant_id: variantIds }, {});
      await queryInterface.bulkDelete('goods_receipt_items', { product_variant_id: variantIds }, {});
    }
    await queryInterface.bulkDelete('goods_receipts', { note: 'Nhập kho ban đầu — dữ liệu mẫu catalog bán lẻ' }, {});
    await queryInterface.bulkDelete('product_variants', { sku: skus }, {});
    await queryInterface.bulkDelete('products', { name: PRODUCTS.map((p) => p.name) }, {});
    await queryInterface.bulkDelete('product_categories', { name: CATEGORIES }, {});
  }
};
