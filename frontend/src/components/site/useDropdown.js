import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Trạng thái mở / đóng của các menu thả xuống trong header: tại một thời điểm chỉ một menu mở.
 *  - rê chuột (chỉ chuột, không phải chạm) mở sau một nhịp, rời đi thì đóng sau ~160 ms để kịp lướt từ nút sang bảng;
 *  - bấm ▾ (cảm ứng, bàn phím) bật / tắt;
 *  - Esc hoặc bấm ra ngoài vùng `containerRef` thì đóng.
 */
export default function useDropdown(containerRef) {
  const [openKey, setOpenKey] = useState(null);
  const timer = useRef(null);
  const clear = () => clearTimeout(timer.current);

  const open = useCallback((key) => { clear(); setOpenKey(key); }, []);
  const close = useCallback(() => { clear(); setOpenKey(null); }, []);
  const closeSoon = useCallback(() => { clear(); timer.current = setTimeout(() => setOpenKey(null), 160); }, []);
  const toggle = useCallback((key) => { clear(); setOpenKey((cur) => (cur === key ? null : key)); }, []);

  useEffect(() => {
    if (openKey == null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpenKey(null); };
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpenKey(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [openKey, containerRef]);

  useEffect(() => clear, []);

  return { openKey, open, close, closeSoon, toggle };
}
