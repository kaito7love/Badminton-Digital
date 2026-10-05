import { useCallback, useRef, useState } from 'react';
import { toCompetitionError } from '../lib/errors';

/**
 * "Bấm một lần" (07 mục 3): bọc một thao tác ghi — khoá nút khi đang gửi, nhận lỗi đã dịch.
 *   const [run, { busy, error, clearError }] = useAction();
 *   const result = await run(() => api.post(...), { onError: (e) => toast(e.message, 'error') });   // undefined nếu lỗi
 * Gọi `run` khi đang bận thì bỏ qua (chặn bấm đúp). Lỗi `reload` (máy khác vừa đổi) gọi `onReload` để trang tải lại.
 */
export function useAction({ onReload } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const busyRef = useRef(false);
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  const run = useCallback(async (fn, options) => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const e = toCompetitionError(err);
      if (!e.canceled) setError(e);
      options?.onError?.(e);
      if (e.reload) onReloadRef.current?.();
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return [run, { busy, error, clearError }];
}
