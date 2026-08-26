import React, { useState, useEffect } from 'react';
import { Modal, Badge } from '../../components/UIComponents';
import { productCategoryService, productService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ';

const emptyVariant = () => ({ sku: '', size: '', color: '', listPrice: '', lowStockThreshold: 5 });

export default function CatalogTab() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterCategoryId, setFilterCategoryId] = useState('all');

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', categoryId: '', productType: 'retail' });
  const [variantRows, setVariantRows] = useState([emptyVariant()]);

  const [addingVariantFor, setAddingVariantFor] = useState(null);
  const [newVariant, setNewVariant] = useState(emptyVariant());

  const load = async () => {
    try {
      const [catRes, prodRes] = await Promise.all([
        productCategoryService.getAll(),
        productService.getAll(),
      ]);
      setCategories(catRes.data?.data || []);
      setProducts(prodRes.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được danh mục sản phẩm');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await load();
      setLoading(false);
    };
    init();
  }, []);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    try {
      await productCategoryService.create({ name: categoryName.trim() });
      setCategoryName('');
      setIsCategoryModalOpen(false);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi tạo danh mục');
    }
  };

  const openProductModal = () => {
    setProductForm({ name: '', categoryId: categories[0]?.id || '', productType: 'retail' });
    setVariantRows([emptyVariant()]);
    setIsProductModalOpen(true);
  };

  const updateVariantRow = (index, patch) => {
    setVariantRows((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    const validVariants = variantRows.filter((v) => v.sku.trim() && Number(v.listPrice) > 0);
    if (!productForm.name.trim() || validVariants.length === 0) {
      alert('Cần tên sản phẩm và ít nhất 1 biến thể có SKU + giá bán hợp lệ');
      return;
    }
    try {
      await productService.create({
        name: productForm.name.trim(),
        categoryId: productForm.categoryId || null,
        productType: productForm.productType,
        variants: validVariants.map((v) => ({
          sku: v.sku.trim(),
          size: v.size.trim() || null,
          color: v.color.trim() || null,
          listPrice: Number(v.listPrice),
          lowStockThreshold: Number(v.lowStockThreshold) || 5,
        })),
      });
      setIsProductModalOpen(false);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi tạo sản phẩm');
    }
  };

  const handleAddVariant = async (e) => {
    e.preventDefault();
    if (!newVariant.sku.trim() || !(Number(newVariant.listPrice) > 0)) {
      alert('Cần SKU và giá bán hợp lệ');
      return;
    }
    try {
      await productService.addVariant(addingVariantFor.id, {
        sku: newVariant.sku.trim(),
        size: newVariant.size.trim() || null,
        color: newVariant.color.trim() || null,
        listPrice: Number(newVariant.listPrice),
        lowStockThreshold: Number(newVariant.lowStockThreshold) || 5,
      });
      setAddingVariantFor(null);
      setNewVariant(emptyVariant());
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi thêm biến thể');
    }
  };

  const visibleProducts = filterCategoryId === 'all'
    ? products
    : products.filter((p) => String(p.categoryId) === String(filterCategoryId));

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải danh mục...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400">❌ {error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
          Danh mục sản phẩm bán lẻ (vợt, áo, quần, phụ kiện) dùng chung toàn chuỗi — tồn kho theo từng chi nhánh xem ở tab "Kho bán lẻ".
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="shrink-0 whitespace-nowrap rounded-3xl border border-slate-300 bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            + Danh mục
          </button>
          <button
            onClick={openProductModal}
            className="shrink-0 whitespace-nowrap rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            + Thêm sản phẩm
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterCategoryId('all')}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${filterCategoryId === 'all' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'}`}
        >
          Tất cả ({products.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilterCategoryId(c.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${String(filterCategoryId) === String(c.id) ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {visibleProducts.length === 0 ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">
          Chưa có sản phẩm nào trong danh mục này.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((p) => (
            <div key={p.id} className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-5 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{p.category?.name || 'Chưa phân loại'}</p>
                </div>
                <Badge variant="sky">{p.productType}</Badge>
              </div>

              <div className="space-y-1.5">
                {(p.variants || []).map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-950/60 px-3 py-2 text-xs">
                    <div>
                      <span className="font-mono text-slate-600 dark:text-slate-300">{v.sku}</span>
                      {(v.size || v.color) && (
                        <span className="ml-2 text-slate-400 dark:text-slate-500">{[v.size, v.color].filter(Boolean).join(' / ')}</span>
                      )}
                    </div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{formatMoney(v.listPrice)}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => { setAddingVariantFor(p); setNewVariant(emptyVariant()); }}
                className="w-full rounded-xl border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 py-2 text-xs font-medium transition"
              >
                + Thêm biến thể
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title="Thêm Danh Mục">
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tên danh mục *</label>
            <input
              type="text"
              required
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="VD: Giày cầu lông"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setIsCategoryModalOpen(false)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Tạo</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} title="Thêm Sản Phẩm Mới">
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tên sản phẩm *</label>
              <input
                type="text"
                required
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="VD: Áo Yonex Thi Đấu Nam"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Danh mục</label>
              <select
                value={productForm.categoryId}
                onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">— Không chọn —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Loại</label>
              <select
                value={productForm.productType}
                onChange={(e) => setProductForm({ ...productForm, productType: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="retail">retail</option>
                <option value="consumable">consumable</option>
                <option value="rental">rental</option>
                <option value="service">service</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Biến thể (SKU) — mỗi size/màu là 1 dòng</p>
            {variantRows.map((v, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <label className="block text-[10px] text-slate-400 mb-1">SKU *</label>
                  <input type="text" value={v.sku} onChange={(e) => updateVariantRow(index, { sku: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 mb-1">Size</label>
                  <input type="text" value={v.size} onChange={(e) => updateVariantRow(index, { size: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 mb-1">Màu</label>
                  <input type="text" value={v.color} onChange={(e) => updateVariantRow(index, { color: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div className="col-span-3">
                  <label className="block text-[10px] text-slate-400 mb-1">Giá bán (đ) *</label>
                  <input type="number" min={0} value={v.listPrice} onChange={(e) => updateVariantRow(index, { listPrice: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div className="col-span-1">
                  <button type="button" onClick={() => setVariantRows((prev) => prev.filter((_, i) => i !== index))}
                    disabled={variantRows.length === 1}
                    className="w-full rounded-lg border border-rose-500/30 bg-rose-500/10 py-1.5 text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-30 transition">🗑️</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setVariantRows((prev) => [...prev, emptyVariant()])}
              className="rounded-lg border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-medium transition">
              + Thêm dòng biến thể
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setIsProductModalOpen(false)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Tạo sản phẩm</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!addingVariantFor} onClose={() => setAddingVariantFor(null)} title={`Thêm Biến Thể: ${addingVariantFor?.name || ''}`}>
        <form onSubmit={handleAddVariant} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">SKU *</label>
            <input type="text" required value={newVariant.sku} onChange={(e) => setNewVariant({ ...newVariant, sku: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Size</label>
              <input type="text" value={newVariant.size} onChange={(e) => setNewVariant({ ...newVariant, size: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Màu</label>
              <input type="text" value={newVariant.color} onChange={(e) => setNewVariant({ ...newVariant, color: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Giá bán (đ) *</label>
              <input type="number" required min={0} value={newVariant.listPrice} onChange={(e) => setNewVariant({ ...newVariant, listPrice: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ngưỡng báo sắp hết</label>
              <input type="number" min={0} value={newVariant.lowStockThreshold} onChange={(e) => setNewVariant({ ...newVariant, lowStockThreshold: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setAddingVariantFor(null)} className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Thêm</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
