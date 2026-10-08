import React from 'react';

/**
 * Biểu tượng thương hiệu: cây vợt cầu lông nghiêng 45°, đầu vợt hướng lên trái.
 *
 * Trước đây logo là vòng tròn + mũi tên lên (giống nút "tải lên" của giao diện),
 * và bị chép tay ở 8 nơi (khung khách, bàn làm việc, trang chủ, ba trang đăng
 * nhập, khu Thi đấu). Gom về một chỗ để đổi hình một lần là xong, không lệch nhau.
 *
 * Màu: đầu vợt, cổ và cán dùng `currentColor` (lớp `text-*` của nơi gọi quyết định),
 * chỉ phần bọc cán luôn là xanh chanh #CCFF00 — điểm nhấn cũ của logo. Bản vẽ nằm
 * trong khung 100×100 để dùng cùng cỡ với logo cũ (h-5 w-5 trong ô 40px, h-6 w-6
 * trong ô 48px).
 */
export default function BrandMark({ className = 'h-5 w-5 text-emerald-400', ...rest }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false" {...rest}>
      {/* Dựng cây vợt thẳng đứng rồi xoay -45° quanh tâm; phóng nhẹ để chiếm đủ khung. */}
      <g transform="translate(50 50) rotate(-45) scale(1.24) translate(-50 -50)">
        {/* Mặt vợt */}
        <ellipse cx="50" cy="32" rx="18" ry="24" stroke="currentColor" strokeWidth="7" />
        {/* Dây vợt: mảnh và mờ để vẫn đọc được là "lưới" ở cỡ 20px */}
        <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55">
          <path d="M50 12 V52" />
          <path d="M42 14 V50" />
          <path d="M58 14 V50" />
          <path d="M36 32 H64" />
          <path d="M38 22 H62" />
          <path d="M38 42 H62" />
        </g>
        {/* Cổ vợt chữ V nối mặt vợt xuống cán */}
        <path d="M41 52 L50 67 L59 52" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        {/* Cán */}
        <path d="M50 67 V82" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        {/* Phần bọc cán — điểm nhấn xanh chanh giữ từ logo cũ */}
        <path d="M50 80 V93" stroke="#CCFF00" strokeWidth="10" strokeLinecap="round" />
      </g>
    </svg>
  );
}
