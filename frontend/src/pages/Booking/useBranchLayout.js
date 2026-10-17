import { useEffect, useState } from 'react';
import { publicService } from '../../services/apiServices';

/**
 * Sơ đồ mặt bằng của một chi nhánh (file JSON tĩnh, xem lib/floorPlan.js), hoặc null.
 *
 * Trả null — thay vì giữ sơ đồ cũ — trong lúc sơ đồ của chi nhánh mới chưa về, để khách vừa đổi
 * chi nhánh không thấy mặt bằng của chi nhánh trước. Không có file, mất mạng hay JSON hỏng đều là
 * null: sơ đồ chỉ là phần "xem thêm", không bao giờ được làm hỏng trang đặt sân.
 */
export default function useBranchLayout(branchId) {
  const [loaded, setLoaded] = useState({ id: null, layout: null });

  useEffect(() => {
    if (!branchId) {
      setLoaded({ id: null, layout: null });
      return undefined;
    }
    let cancelled = false;
    const done = (layout) => {
      if (!cancelled) setLoaded({ id: String(branchId), layout: layout || null });
    };
    publicService
      .getBranchLayout(branchId)
      .then(done)
      .catch(() => done(null));
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  return branchId && String(branchId) === loaded.id ? loaded.layout : null;
}
