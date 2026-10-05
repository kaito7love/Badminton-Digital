import { useEffect, useState } from 'react';
import { courtService } from '../../../services/apiServices';
import { registerCourtNames } from '../lib/format';

// Sân thật của chi nhánh đang làm việc (từ /courts của app chính, chỉ nhân viên gọi được): ref `bd:court:<id>` là mã sân mà
// competition-service lưu. Tải một lần mỗi 60 giây và đăng ký tên để mọi chỗ hiện "Sân số 3 (Thường)" thay vì "Sân 3".

const TTL_MS = 60000;
let cache = { at: 0, branch: null, list: null, promise: null };

const branchKey = () => {
  try { return localStorage.getItem('admin_selected_branch_id') || ''; } catch { return ''; }
};

export const loadCourts = () => {
  const key = branchKey();
  if (cache.list && cache.branch === key && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.list);
  if (cache.promise && cache.branch === key) return cache.promise;
  const promise = courtService.getAllCourts().then((res) => {
    const raw = res.data?.data;
    const items = Array.isArray(raw) ? raw : raw?.items || [];
    const list = items.map((c) => ({ id: c.id, ref: `bd:court:${c.id}`, name: c.name, status: c.status }));
    registerCourtNames(list);
    cache = { at: Date.now(), branch: key, list, promise: null };
    return list;
  }).catch(() => {
    cache.promise = null;
    return cache.list || [];
  });
  cache = { ...cache, branch: key, promise };
  return promise;
};

export function useCourts() {
  const [state, setState] = useState({ courts: cache.list || [], loading: !cache.list });
  useEffect(() => {
    let alive = true;
    loadCourts().then((courts) => { if (alive) setState({ courts, loading: false }); });
    return () => { alive = false; };
  }, []);
  return state;
}
