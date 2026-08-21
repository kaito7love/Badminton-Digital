import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { roleOf } from '../utils/roles';
import { branchService } from '../services/apiServices';
import { DEFAULT_TIMEZONE } from '../utils/datetime';

const BranchContext = createContext(null);

const STORAGE_KEY = 'admin_selected_branch_id';

export function BranchProvider({ children }) {
  const { user } = useAuth();
  const isAdmin = roleOf(user) === 'admin';
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : null;
  });

  useEffect(() => {
    if (!isAdmin) return;
    branchService.getAllBranches()
      .then((res) => {
        const list = res.data?.data || [];
        setBranches(list);
        // Lần đầu vào switcher (chưa từng chọn chi nhánh nào) — mặc định về
        // đúng chi nhánh gốc của admin để không đổi hành vi hiện tại.
        if (!localStorage.getItem(STORAGE_KEY) && user?.employee?.branchId) {
          localStorage.setItem(STORAGE_KEY, String(user.employee.branchId));
          setSelectedBranchId(user.employee.branchId);
        }
      })
      .catch(() => {});
  }, [isAdmin, user?.employee?.branchId]);

  /** Đổi chi nhánh xong reload toàn trang — mọi trang fetch data khi mount
   * nên reload là cách chắc chắn nhất để đồng bộ lại, không cần sửa từng trang. */
  const selectBranch = (branchId) => {
    localStorage.setItem(STORAGE_KEY, String(branchId));
    window.location.reload();
  };

  /** Múi giờ của chi nhánh đang xem — dùng để hiển thị mọi mốc thời gian.
   * Backend trả về UTC, hiển thị phải theo giờ nơi phát sinh giao dịch chứ
   * không theo giờ máy người xem (xem `utils/datetime.js`). */
  const activeTimezone =
    branches.find((b) => String(b.id) === String(selectedBranchId))?.timezone || DEFAULT_TIMEZONE;

  return (
    <BranchContext.Provider value={{ isAdmin, branches, selectedBranchId, selectBranch, activeTimezone }}>
      {children}
    </BranchContext.Provider>
  );
}

export const useBranch = () => useContext(BranchContext);
