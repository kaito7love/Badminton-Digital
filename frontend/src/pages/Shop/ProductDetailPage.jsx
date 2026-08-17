import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import ProductCard from './ProductCard';
import StockBadge from './StockBadge';
import QuantityStepper from '../../components/QuantityStepper';
import { publicService } from '../../services/apiServices';
import { useCart } from '../../contexts/CartContext';
import { formatVnd, lookFor, priceLabel, uniqueValues, variantLabel } from '../../utils/shop';

/**
 * Trang chi tiết một sản phẩm: chọn màu → chọn size → chọn số lượng → thêm vào
 * giỏ hoặc mua ngay.
 *
 * Màu và size là hai trục của cùng một bảng biến thể, nên chọn màu xong phải
 * loại luôn những size không có màu đó — bày ra một lựa chọn không tồn tại rồi
 * mới báo lỗi là cách chắc chắn làm khách bực.
 */

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem, branchId: cartBranchId, items } = useCart();

  /**
   * Chi nhánh dùng để nạp trang, chốt một lần lúc vào trang.
   *
   * Không bám theo `cartBranchId` đang chạy: giỏ trống thì nó là null, và ngay
   * khi khách thêm món đầu tiên nó nhảy sang chi nhánh của món đó. Nếu để
   * effect nạp lại theo giá trị đó, cả danh sách biến thể được dựng lại và
   * khách bị ném về mẫu mặc định đúng vào giây họ vừa chọn xong màu với size.
   * Đổi chi nhánh là việc của trang cửa hàng, không xảy ra ở đây.
   */
  const [viewBranchId] = useState(() => cartBranchId || null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [color, setColor] = useState(null);
  const [size, setSize] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    publicService
      .getProductById(id, viewBranchId ? { branchId: viewBranchId } : undefined)
      .then((res) => {
        if (cancelled) return;
        setData(res.data?.data || null);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Không tải được sản phẩm.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, viewBranchId]);

  const product = data?.product || null;
  const variants = useMemo(() => product?.variants || [], [product]);
  const colors = useMemo(() => uniqueValues(variants, 'color'), [variants]);
  const sizes = useMemo(() => uniqueValues(variants, 'size'), [variants]);

  // Mặc định nhảy vào mẫu còn hàng đầu tiên: khách mở trang ra là đã chọn sẵn
  // một thứ mua được, không phải mò từ đầu.
  useEffect(() => {
    if (variants.length === 0) return;
    const preferred = variants.find((variant) => variant.inStock) || variants[0];
    setColor(preferred.color || null);
    setSize(preferred.size || null);
    setQuantity(1);
  }, [variants]);

  /**
   * Một ô size ở trạng thái nào với màu đang chọn:
   *  - 'missing': màu này không có size đó (không tồn tại mẫu) → chặn hẳn
   *  - 'soldout': có mẫu nhưng hết hàng → vẫn bấm được, gạch ngang cho thấy hết
   *  - 'available': mua được
   * Ẩn luôn mẫu hết hàng thì khách tưởng quán không bán size đó bao giờ; để
   * y như mẫu còn hàng thì họ bấm vào rồi mới biết. Nên phải là ba trạng thái.
   */
  const stateOfSize = (option) => {
    const variant = variants.find(
      (candidate) => (candidate.color || null) === (color || null) && (candidate.size || null) === (option || null)
    );
    if (!variant) return 'missing';
    return variant.inStock ? 'available' : 'soldout';
  };

  const colorIsSoldOut = (option) =>
    variants.filter((variant) => variant.color === option).every((variant) => !variant.inStock);

  const selectedVariant = useMemo(
    () =>
      variants.find(
        (variant) => (variant.color || null) === (color || null) && (variant.size || null) === (size || null)
      ) || null,
    [variants, color, size]
  );

  const inCartQuantity = items.find((item) => item.variantId === selectedVariant?.id)?.quantity || 0;

  const handleSelectColor = (nextColor) => {
    setColor(nextColor);

    // Đổi màu là đổi sang một bộ size khác: size cũ có thể không tồn tại ở màu
    // này, hoặc tồn tại nhưng đã hết. Ưu tiên nhảy tới mẫu mua được ngay, chỉ
    // giữ lại size cũ khi nó vẫn còn hàng.
    const forColor = variants.filter((variant) => variant.color === nextColor);
    if (forColor.length === 0) return;
    const keepsWorking = forColor.some((variant) => variant.size === size && variant.inStock);
    if (keepsWorking) return;
    const next = forColor.find((variant) => variant.inStock) || forColor[0];
    setSize(next.size || null);
  };

  const addToCart = () => {
    if (!selectedVariant || !selectedVariant.inStock) return false;
    addItem(
      {
        variantId: selectedVariant.id,
        productId: product.id,
        name: product.name,
        categoryName: product.category?.name || null,
        sku: selectedVariant.sku,
        size: selectedVariant.size,
        color: selectedVariant.color,
        price: selectedVariant.price,
        branchId: data.branch.id
      },
      quantity
    );
    return true;
  };

  const handleAddToCart = () => {
    if (!addToCart()) return;
    setToast(`Đã thêm ${quantity} × ${product.name} vào giỏ`);
    setTimeout(() => setToast(''), 3000);
  };

  const handleBuyNow = () => {
    if (addToCart()) navigate('/cart');
  };

  if (loading) {
    return (
      <CustomerLayout>
        <p className="py-24 text-center text-slate-400">⏳ Đang tải sản phẩm...</p>
      </CustomerLayout>
    );
  }

  if (error || !product) {
    return (
      <CustomerLayout>
        <div className="nike-card-static p-12 text-center">
          <p className="font-kinetic text-xl font-black uppercase text-white">{error || 'Không tìm thấy sản phẩm'}</p>
          <Link to="/shop" className="btn-nike-bolt mt-6 text-xs">
            Về cửa hàng
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const look = lookFor(product.name, product.category?.name);

  return (
    <CustomerLayout>
      <nav aria-label="Đường dẫn" className="mb-6 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-500">
        <Link to="/shop" className="hover:text-emerald-400">
          Cửa hàng
        </Link>
        {product.category && <span> / {product.category.name}</span>}
        <span className="text-slate-300"> / {product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div
          className={`nike-card-static flex h-72 items-center justify-center bg-gradient-to-br sm:h-[26rem] ${look.tint}`}
        >
          <span className="text-[10rem] drop-shadow-[0_20px_50px_rgba(0,0,0,0.7)] sm:text-[13rem]">{look.icon}</span>
        </div>

        <div className="nike-card-static p-7">
          {product.category && (
            <p className="font-kinetic text-[10px] font-black uppercase tracking-widest text-emerald-400">
              {product.category.name}
            </p>
          )}
          <h1 className="mt-2 font-kinetic text-3xl font-black uppercase leading-tight tracking-tight text-white">
            {product.name}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="font-kinetic text-3xl font-black text-emerald-400">
              {selectedVariant ? formatVnd(selectedVariant.price) : priceLabel(product)}
            </span>
            <StockBadge inStock={selectedVariant ? selectedVariant.inStock : product.inStock} />
          </div>

          {colors.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">Màu</p>
              <div className="flex flex-wrap gap-2">
                {colors.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleSelectColor(option)}
                    className={`kinetic-chip ${color === option ? 'active' : ''} ${colorIsSoldOut(option) ? 'opacity-50' : ''}`}
                  >
                    {option}
                    {colorIsSoldOut(option) && ' • hết'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">Size</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((option) => {
                  const state = stateOfSize(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={state === 'missing'}
                      onClick={() => setSize(option)}
                      title={state === 'soldout' ? 'Mẫu này đang hết hàng' : undefined}
                      className={`kinetic-chip ${size === option ? 'active' : ''} ${
                        state === 'missing' ? 'cursor-not-allowed opacity-25' : ''
                      } ${state === 'soldout' ? 'opacity-50 line-through' : ''}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
              Số lượng
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <QuantityStepper value={quantity} onChange={setQuantity} />
              {selectedVariant && (
                <span className="font-mono text-xs text-slate-500">
                  SKU {selectedVariant.sku}
                  {inCartQuantity > 0 && ` • đã có ${inCartQuantity} trong giỏ`}
                </span>
              )}
            </div>
          </div>

          {/* Xếp dọc trên điện thoại: hai nút cạnh nhau trong màn hẹp làm nhãn
              vỡ thành hai dòng. */}
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!selectedVariant?.inStock}
              className="btn-nike-dark w-full justify-center whitespace-nowrap text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              🛒 Thêm vào giỏ
            </button>
            <button
              type="button"
              onClick={handleBuyNow}
              disabled={!selectedVariant?.inStock}
              className="btn-nike-bolt w-full justify-center whitespace-nowrap text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mua ngay ⚡
            </button>
          </div>

          {!selectedVariant ? (
            <p className="mt-4 text-sm font-bold text-amber-300">
              Mẫu {variantLabel({ color, size })} chưa có ở chi nhánh này — chọn màu hoặc size khác.
            </p>
          ) : !selectedVariant.inStock ? (
            <p className="mt-4 text-sm font-bold text-amber-300">
              Mẫu {variantLabel(selectedVariant)} đang hết hàng tại {data.branch.name} — chọn mẫu khác hoặc đổi chi
              nhánh ở trang cửa hàng.
            </p>
          ) : null}

          <p className="mt-5 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-400">
            Đặt trước trên web, hàng được giữ tại quầy {data.branch.name}. Bạn thanh toán khi tới lấy — tiền mặt
            hoặc chuyển khoản tại quầy. Giá và tình trạng còn hàng lấy trực tiếp từ kho của chi nhánh.
          </p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 font-kinetic text-xl font-black uppercase tracking-tight text-white">
          Tất cả mẫu đang bán
        </h2>
        <div className="nike-card-static overflow-x-auto p-2">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-white/10 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-4 py-4 text-left">Mẫu</th>
                <th className="px-4 py-4 text-left">SKU</th>
                <th className="px-4 py-4 text-right">Giá</th>
                <th className="px-4 py-4 text-right">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {variants.map((variant) => (
                <tr key={variant.id} className={selectedVariant?.id === variant.id ? 'bg-emerald-500/5' : ''}>
                  <td className="px-4 py-4 text-sm font-bold text-white">{variantLabel(variant)}</td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-500">{variant.sku}</td>
                  <td className="px-4 py-4 text-right text-sm text-slate-300">{formatVnd(variant.price)}</td>
                  <td className="px-4 py-4 text-right">
                    <StockBadge inStock={variant.inStock} labels={['Còn', 'Hết']} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.related?.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-5 font-kinetic text-xl font-black uppercase tracking-tight text-white">
            Sản phẩm liên quan
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {data.related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      {/* Thêm xong phải chỉ luôn đường đi tiếp — báo "đã thêm" rồi để khách tự
          mò xem giỏ nằm ở đâu là bỏ rơi họ giữa chừng. */}
      {toast && (
        <div className="fixed bottom-24 right-6 z-50 flex items-center gap-4 rounded-2xl bg-emerald-400 px-6 py-4 font-kinetic text-sm font-black text-slate-950 shadow-2xl lg:bottom-8">
          <span>{toast}</span>
          <Link
            to="/cart"
            className="whitespace-nowrap rounded-full bg-slate-950 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-400"
          >
            Xem giỏ 🛒
          </Link>
        </div>
      )}
    </CustomerLayout>
  );
}
