import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { roleOf } from '../utils/roles';
import { branchService } from '../services/apiServices';

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

  return (
    <BranchContext.Provider value={{ isAdmin, branches, selectedBranchId, selectBranch }}>
      {children}
    </BranchContext.Provider>
  );
}

export const useBranch = () => useContext(BranchContext);
