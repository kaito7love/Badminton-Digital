import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import BranchPicker from './BranchPicker';
import ProductCard from './ProductCard';
import { publicService } from '../../services/apiServices';
import { useCart } from '../../contexts/CartContext';
import { lookFor } from '../../utils/shop';

/**
 * Kệ hàng phụ kiện & trang phục — trang công khai, không cần đăng nhập.
 *
 * Giá và tồn kho tính theo từng chi nhánh, nên chi nhánh đang xem là một lựa
 * chọn hiển hiện chứ không phải mặc định ngầm: khách xem hàng ở một nơi rồi
 * lái xe tới nơi khác lấy là hỏng.
 */

const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price-asc', label: 'Giá thấp → cao' },
  { value: 'price-desc', label: 'Giá cao → thấp' },
  { value: 'name', label: 'Tên A → Z' }
];

export default function ShopPage() {
  const { branchId: cartBranchId } = useCart();

  const [branchId, setBranchId] = useState(cartBranchId || null);
  const [branch, setBranch] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [sort, setSort] = useState('newest');
  const [inStockOnly, setInStockOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    publicService
      .getProducts(branchId ? { branchId } : undefined)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data || {};
        setBranch(data.branch || null);
        setCategories(data.categories || []);
        setProducts(data.products || []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Chưa tải được danh mục sản phẩm. Vui lòng thử lại sau.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  // Chỉ hiện danh mục thật sự có hàng trên kệ — chip lọc mà bấm vào ra trang
  // trống thì thà đừng bày.
  const usedCategories = useMemo(() => {
    const usedIds = new Set(products.map((p) => p.category?.id).filter(Boolean));
    return categories.filter((c) => usedIds.has(c.id));
  }, [categories, products]);

  const visibleProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = products.filter((product) => {
      if (categoryId !== 'all' && String(product.category?.id) !== String(categoryId)) return false;
      if (inStockOnly && !product.inStock) return false;
      if (!keyword) return true;
      const haystack = `${product.name} ${product.category?.name || ''} ${product.variants
        .map((v) => [v.sku, v.size, v.color].filter(Boolean).join(' '))
        .join(' ')}`.toLowerCase();
      return haystack.includes(keyword);
    });

    const sorted = [...filtered];
    if (sort === 'price-asc') sorted.sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
    if (sort === 'price-desc') sorted.sort((a, b) => (b.priceFrom ?? -Infinity) - (a.priceFrom ?? -Infinity));
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return sorted;
  }, [products, search, categoryId, inStockOnly, sort]);

  const branchName = branch?.name || 'chi nhánh';

  return (
    <CustomerLayout
      eyebrow={branch ? `Gear Store • ${branch.name}` : 'Gear Store'}
      title={
        <>
          PHỤ KIỆN & <span className="text-gradient-nike">TRANG PHỤC</span>
        </>
      }
      subtitle="Vợt, áo, quần và phụ kiện chính hãng bày sẵn tại quầy. Đặt trước trên web, tới lấy và thanh toán tại chi nhánh."
      action={
        <Link to="/#booking-widget" className="btn-nike-dark text-xs">
          Đặt sân ngay ⚡
        </Link>
      }
    >
      <div className="nike-card-static mb-8 space-y-5 p-6">
        <BranchPicker selectedBranchId={branch?.id ?? null} onSelect={setBranchId} />

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label
              htmlFor="shop-search"
              className="mb-2 block font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400"
            >
              Tìm sản phẩm
            </label>
            <input
              id="shop-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Vợt Astrox, áo thi đấu, quấn cán…"
              className="booking-input"
            />
          </div>
          <div>
            <label
              htmlFor="shop-sort"
              className="mb-2 block font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400"
            >
              Sắp xếp
            </label>
            <select
              id="shop-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="booking-input sm:w-52"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryId('all')}
            className={`kinetic-chip ${categoryId === 'all' ? 'active' : ''}`}
          >
            Tất cả ({products.length})
          </button>
          {usedCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              className={`kinetic-chip ${String(categoryId) === String(category.id) ? 'active' : ''}`}
            >
              {lookFor(category.name).icon} {category.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setInStockOnly((only) => !only)}
            className={`kinetic-chip ${inStockOnly ? 'active' : ''}`}
            aria-pressed={inStockOnly}
          >
            Chỉ hàng còn
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-slate-400">⏳ Đang tải kệ hàng...</p>
      ) : error ? (
        <p className="py-16 text-center font-bold text-rose-400">{error}</p>
      ) : visibleProducts.length === 0 ? (
        <div className="nike-card-static p-12 text-center">
          <p className="font-kinetic text-xl font-black uppercase text-white">Không có sản phẩm nào khớp</p>
          <p className="mt-3 text-slate-400">
            Thử bỏ bớt bộ lọc, hoặc hỏi quầy {branchName} — có mẫu chưa kịp lên kệ.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-5 font-kinetic text-xs font-bold uppercase tracking-widest text-slate-500">
            {visibleProducts.length} sản phẩm
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </>
      )}
    </CustomerLayout>
  );
}
