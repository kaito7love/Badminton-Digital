import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { publicService } from '../../services/apiServices';

/**
 * Kệ hàng phụ kiện & trang phục — trang công khai, không cần đăng nhập.
 *
 * Đây là tủ kính bày hàng, KHÔNG phải giỏ hàng online: hệ thống bán lẻ chỉ có
 * luồng POS tại quầy, nên trang này dừng đúng ở chỗ giúp khách biết quán có
 * gì, size màu nào, giá bao nhiêu, còn hay hết trước khi tới. Dựng thêm nút
 * "thêm vào giỏ" là hứa một thứ không tồn tại ở phía sau.
 */

const formatVnd = (value) => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

// Catalog không có ảnh sản phẩm, nên mỗi danh mục nhận một khối hình riêng thay
// vì đi mượn ảnh ngoài — vẫn phân biệt được hàng bằng mắt mà không rao ảnh
// không phải của quán.
// Thứ tự có ý nghĩa: mẫu hẹp đứng trước mẫu rộng. "Túi đựng vợt" và "Quấn cán
// vợt" đều chứa chữ "vợt" nhưng không phải cây vợt nào cả.
const CATEGORY_LOOKS = [
  { match: /túi|balo|ba lô/i, icon: '🎒', tint: 'from-rose-500/30 via-rose-500/5 to-transparent' },
  { match: /vớ|tất|băng|quấn/i, icon: '🧤', tint: 'from-fuchsia-500/30 via-fuchsia-500/5 to-transparent' },
  { match: /giày/i, icon: '👟', tint: 'from-amber-500/30 via-amber-500/5 to-transparent' },
  { match: /vợt/i, icon: '🏸', tint: 'from-emerald-500/30 via-emerald-500/5 to-transparent' },
  { match: /áo/i, icon: '👕', tint: 'from-sky-500/30 via-sky-500/5 to-transparent' },
  { match: /quần|váy/i, icon: '🩳', tint: 'from-indigo-500/30 via-indigo-500/5 to-transparent' },
  { match: /cầu|shuttle/i, icon: '🪶', tint: 'from-lime-500/30 via-lime-500/5 to-transparent' }
];

const DEFAULT_LOOK = { icon: '🛍️', tint: 'from-slate-500/25 via-slate-500/5 to-transparent' };

// Tên sản phẩm xét trước danh mục: "Túi đựng vợt" nằm trong danh mục "Phụ kiện"
// nhưng vẫn nên trông ra cái túi, không phải cái túi mua sắm chung chung.
const lookFor = (...names) => {
  for (const name of names) {
    const look = CATEGORY_LOOKS.find((candidate) => candidate.match.test(name || ''));
    if (look) return look;
  }
  return DEFAULT_LOOK;
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price-asc', label: 'Giá thấp → cao' },
  { value: 'price-desc', label: 'Giá cao → thấp' },
  { value: 'name', label: 'Tên A → Z' }
];

const priceLabel = (product) => {
  if (product.priceFrom === null) return 'Liên hệ quầy';
  if (product.priceFrom === product.priceTo) return formatVnd(product.priceFrom);
  return `${formatVnd(product.priceFrom)} – ${formatVnd(product.priceTo)}`;
};

const uniqueValues = (variants, key) => [...new Set(variants.map((v) => v[key]).filter(Boolean))];

function StockBadge({ inStock }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 font-kinetic text-[10px] font-black uppercase tracking-widest ${
        inStock
          ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
          : 'border-white/10 bg-slate-950/80 text-slate-500'
      }`}
    >
      {inStock ? 'Còn hàng' : 'Tạm hết'}
    </span>
  );
}

function ProductDialog({ product, branchName, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const look = lookFor(product.name, product.category?.name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-5 backdrop-blur-2xl"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-dialog-title"
        className="nike-card-static max-h-[88vh] w-full max-w-lg overflow-y-auto border-emerald-500/40 p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-kinetic text-[10px] font-black uppercase tracking-widest text-emerald-400">
              {product.category?.name || 'Phụ kiện'}
            </p>
            <h3
              id="product-dialog-title"
              className="mt-2 font-kinetic text-2xl font-black uppercase tracking-tight text-white"
            >
              {product.name}
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="text-2xl font-bold text-slate-400 transition hover:text-white"
            aria-label="Đóng"
          >
            &times;
          </button>
        </div>

        <div
          className={`mt-5 flex h-32 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${look.tint}`}
        >
          <span className="text-6xl">{look.icon}</span>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="font-kinetic text-2xl font-black text-emerald-400">{priceLabel(product)}</span>
          <StockBadge inStock={product.inStock} />
        </div>

        <div className="mt-5 space-y-2">
          <p className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
            Size / màu đang bày tại {branchName}
          </p>
          {product.variants.length === 0 ? (
            <p className="text-sm text-slate-400">Sản phẩm chưa lên mẫu, hỏi quầy để biết thêm.</p>
          ) : (
            product.variants.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {[variant.size, variant.color].filter(Boolean).join(' • ') || 'Mẫu tiêu chuẩn'}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">{variant.sku}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-kinetic text-sm font-black text-white">{formatVnd(variant.price)}</p>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      variant.inStock ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {variant.inStock ? 'Còn' : 'Hết'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Nói thẳng cách mua: hệ thống không có thanh toán online, hứa "đặt
            hàng" ở đây là để khách chờ một email không bao giờ tới. */}
        <p className="mt-5 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-400">
          Hàng bán trực tiếp tại quầy {branchName}. Bạn có thể mua khi tới chơi — nhân viên sẽ cộng vào hoá đơn
          cuối buổi hoặc xuất hoá đơn riêng. Giá và tình trạng còn hàng trên đây lấy từ kho của chi nhánh.
        </p>

        <Link to="/#booking-widget" className="btn-nike-bolt mt-5 w-full justify-center py-4 text-xs">
          Đặt sân & ghé lấy ⚡
        </Link>
      </div>
    </div>
  );
}

export default function ShopPage() {
  const [branch, setBranch] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [sort, setSort] = useState('newest');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    let cancelled = false;
    publicService
      .getProducts()
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data || {};
        setBranch(data.branch || null);
        setCategories(data.categories || []);
        setProducts(data.products || []);
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
  }, []);

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
      subtitle="Vợt, áo, quần và phụ kiện chính hãng bày sẵn tại quầy. Xem giá, size màu và tình trạng còn hàng trước khi tới sân."
      action={
        <Link to="/#booking-widget" className="btn-nike-dark text-xs">
          Đặt sân ngay ⚡
        </Link>
      }
    >
      <div className="nike-card-static mb-8 space-y-5 p-6">
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
            {visibleProducts.map((product) => {
              const look = lookFor(product.name, product.category?.name);
              const sizes = uniqueValues(product.variants, 'size');
              const colors = uniqueValues(product.variants, 'color');

              return (
                <article key={product.id} className="nike-card flex flex-col">
                  <div
                    className={`relative flex h-44 items-center justify-center bg-gradient-to-br ${look.tint}`}
                  >
                    <span className="text-7xl drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]">{look.icon}</span>
                    <div className="absolute left-4 top-4">
                      <StockBadge inStock={product.inStock} />
                    </div>
                    {product.category && (
                      <span className="absolute right-4 top-4 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-300">
                        {product.category.name}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-kinetic text-lg font-black uppercase leading-tight tracking-tight text-white">
                      {product.name}
                    </h3>

                    <p className="mt-3 font-kinetic text-xl font-black text-emerald-400">{priceLabel(product)}</p>

                    {(sizes.length > 0 || colors.length > 0) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {sizes.map((size) => (
                          <span key={`size-${size}`} className="feature-chip">
                            Size {size}
                          </span>
                        ))}
                        {colors.map((color) => (
                          <span key={`color-${color}`} className="feature-chip">
                            {color}
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedProduct(product)}
                      className="btn-nike-dark mt-auto w-full justify-center text-xs"
                    >
                      Xem chi tiết
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {selectedProduct && (
        <ProductDialog
          product={selectedProduct}
          branchName={branchName}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </CustomerLayout>
  );
}
