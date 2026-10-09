import React from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../BrandMark';

/**
 * Logo + tên thương hiệu dùng chung cho header của Trang chủ, Cửa hàng và Thi đấu (kế hoạch 28). Trước đây mỗi nơi dựng
 * một kiểu (ô 44 / 40, chữ 24 / 20, riêng Thi đấu thay tên bằng chữ "THI ĐẤU"), nên thương hiệu không đồng nhất.
 *
 * `tone`: 'auto' đi theo giao diện sáng / tối của app (cặp lớp `text-slate-900 dark:text-white`);
 *         'dark' luôn là bản tối, dùng ở Trang chủ (trang chỉ có bản tối, không đọc ThemeContext).
 * Các lớp Tailwind viết nguyên chuỗi để bộ quét đọc được (không ghép `dark:${...}`).
 */

const TILE =
  'h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 transition-transform group-hover:scale-110';

export function BrandTile({ tone = 'auto', className = '' }) {
  const glyph = tone === 'dark' ? 'h-5 w-5 text-emerald-400' : 'h-5 w-5 text-emerald-700 dark:text-emerald-400';
  return (
    <div className={`${TILE} ${className}`.trim()} data-brand-tile>
      <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-slate-950">
        <BrandMark className={glyph} />
      </div>
    </div>
  );
}

// Chữ gradient: bản tối đi từ trắng sang xanh chanh; bản sáng đi từ xanh rừng sang chanh đậm (đầu trắng sẽ biến mất trên nền sáng).
const GRADIENT_AUTO =
  'bg-[linear-gradient(135deg,#064e3b_0%,#059669_55%,#65a30d_100%)] bg-clip-text text-transparent dark:bg-[linear-gradient(135deg,#ffffff_0%,#00ff66_50%,#ccff00_100%)]';
const GRADIENT_DARK = 'bg-[linear-gradient(135deg,#ffffff_0%,#00ff66_50%,#ccff00_100%)] bg-clip-text text-transparent';

export function BrandWordmark({ tone = 'auto', className = '' }) {
  const color = tone === 'dark' ? 'text-white' : 'text-slate-900 dark:text-white';
  const gradient = tone === 'dark' ? GRADIENT_DARK : GRADIENT_AUTO;
  return (
    <span
      className={`whitespace-nowrap font-kinetic text-base font-black uppercase tracking-tighter sm:text-xl ${color} ${className}`.trim()}
      data-brand-wordmark
    >
      BADMINTON <span className={gradient}>DIGITAL</span>
    </span>
  );
}

/** Ô logo + tên thương hiệu, bấm về trang chủ. `onClick` để Trang chủ cuộn lên đầu thay vì không làm gì. */
export default function BrandLogo({ tone = 'auto', onClick, className = '' }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      aria-label="Badminton Digital — trang chủ"
      className={`group flex items-center gap-3 ${className}`.trim()}
    >
      <BrandTile tone={tone} />
      <BrandWordmark tone={tone} />
    </Link>
  );
}
