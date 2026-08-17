import React, { useEffect, useState } from 'react';
import { publicService } from '../../services/apiServices';
import { useCart } from '../../contexts/CartContext';

/**
 * Chọn chi nhánh đang mua hàng.
 *
 * Giỏ hàng gắn với đúng một chi nhánh (giá và tồn kho tính theo chi nhánh), nên
 * đổi nơi mua khi giỏ đang có hàng là phải hỏi khách — im lặng đổi rồi để họ
 * tới quầy mới biết đơn trống là kiểu hỏng tệ nhất.
 */
export default function BranchPicker({ selectedBranchId, onSelect }) {
  const { items, branchId: cartBranchId, switchBranch } = useCart();
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    let cancelled = false;
    publicService
      .getBranches()
      .then((res) => {
        if (!cancelled) setBranches(res.data?.data || []);
      })
      .catch(() => {
        // Không lấy được danh sách thì ẩn bộ chọn, backend vẫn tự dùng chi
        // nhánh mặc định — mất tính năng chọn nơi mua chứ không chặn mua hàng.
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (branches.length <= 1) return null;

  const handleSelect = (branch) => {
    if (branch.id === selectedBranchId) return;
    const hasCartElsewhere = items.length > 0 && cartBranchId && cartBranchId !== branch.id;
    if (hasCartElsewhere) {
      const confirmed = window.confirm(
        `Giỏ hàng đang giữ ${items.length} sản phẩm của chi nhánh khác. Chuyển sang "${branch.name}" sẽ xoá giỏ hàng hiện tại?`
      );
      if (!confirmed) return;
      switchBranch(branch.id, { force: true });
    } else {
      switchBranch(branch.id);
    }
    onSelect(branch.id);
  };

  const selected = branches.find((branch) => branch.id === selectedBranchId);

  return (
    <div>
      <p className="mb-2 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
        Mua tại chi nhánh
      </p>
      <div className="flex flex-wrap gap-2">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            onClick={() => handleSelect(branch)}
            className={`kinetic-chip ${branch.id === selectedBranchId ? 'active' : ''}`}
          >
            🏬 {branch.name}
          </button>
        ))}
      </div>
      {selected?.address && <p className="mt-2 text-xs text-slate-500">📍 {selected.address}</p>}
    </div>
  );
}
