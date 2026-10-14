import { useEffect, useState } from 'react';

/**
 * Dưới 1024 px (ngưỡng `lg` của Tailwind, cũng là ngưỡng hiện thanh tab dưới của
 * header) trang vẽ từng sân một thay vì cả lưới 18 cột.
 *
 * Ngưỡng này là kết quả đo, không phải ước chừng: ở 768 px lưới đầy đủ chỉ còn
 * ô rộng 24 px — quá nhỏ để chạm; từ 1024 px ô rộng 38 px trở lên. (Bản mẫu đã
 * duyệt ghi 768 px; đo trên trang thật cho thấy phải nâng lên 1024 px.)
 */
const QUERY = '(max-width: 1023px)';

export default function useCompactLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(QUERY);
    const onChange = () => setCompact(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return compact;
}
