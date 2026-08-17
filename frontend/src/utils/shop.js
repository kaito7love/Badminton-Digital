// Dùng chung cho cửa hàng: danh sách, chi tiết sản phẩm, giỏ hàng, đơn mua.

export const formatVnd = (value) => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

// Catalog không có ảnh sản phẩm, nên mỗi loại hàng nhận một khối hình riêng
// thay vì đi mượn ảnh ngoài — vẫn phân biệt được hàng bằng mắt mà không rao
// ảnh không phải của quán.
//
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

/** Tên sản phẩm xét trước danh mục, nhận nhiều chuỗi theo thứ tự ưu tiên. */
export const lookFor = (...names) => {
  for (const name of names) {
    const look = CATEGORY_LOOKS.find((candidate) => candidate.match.test(name || ''));
    if (look) return look;
  }
  return DEFAULT_LOOK;
};

export const priceLabel = (product) => {
  if (product?.priceFrom === null || product?.priceFrom === undefined) return 'Liên hệ quầy';
  if (product.priceFrom === product.priceTo) return formatVnd(product.priceFrom);
  return `${formatVnd(product.priceFrom)} – ${formatVnd(product.priceTo)}`;
};

export const variantLabel = (variant) =>
  [variant?.size, variant?.color].filter(Boolean).join(' • ') || 'Mẫu tiêu chuẩn';

export const uniqueValues = (variants, key) =>
  [...new Set((variants || []).map((v) => v[key]).filter(Boolean))];
