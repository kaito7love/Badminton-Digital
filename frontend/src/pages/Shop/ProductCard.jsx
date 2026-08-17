import React from 'react';
import { Link } from 'react-router-dom';
import { lookFor, priceLabel, uniqueValues } from '../../utils/shop';
import StockBadge from './StockBadge';

/** Thẻ sản phẩm dùng chung cho kệ hàng và khối "sản phẩm liên quan". */
export default function ProductCard({ product }) {
  const look = lookFor(product.name, product.category?.name);
  const sizes = uniqueValues(product.variants, 'size');
  const colors = uniqueValues(product.variants, 'color');

  return (
    <Link to={`/shop/${product.id}`} className="nike-card flex flex-col no-underline">
      <div className={`relative flex h-44 items-center justify-center bg-gradient-to-br ${look.tint}`}>
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

        <span className="btn-nike-dark mt-auto w-full justify-center text-xs">Xem chi tiết</span>
      </div>
    </Link>
  );
}
