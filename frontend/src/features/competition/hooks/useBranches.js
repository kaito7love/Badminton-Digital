import { useEffect, useState } from 'react';
import { publicService } from '../../../services/apiServices';
import { registerBranchNames } from '../lib/format';

// Danh sách chi nhánh công khai của app chính (cho ô chọn "chi nhánh thường chơi" và lọc BXH); đăng ký tên để `orgName` nói "Chi nhánh Quận 3".
let cache = null;

export function useBranches() {
  const [branches, setBranches] = useState(cache || []);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    publicService.getBranches()
      .then((res) => {
        const list = (res.data && res.data.data) || [];
        cache = list;
        registerBranchNames(list);
        if (alive) setBranches(list);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return branches;
}
