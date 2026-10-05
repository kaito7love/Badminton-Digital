import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchStatus } from '../api/competitionApi';

// Trạng thái tính năng thi đấu của cả app: có bật không (menu ẩn khi tắt — "Service tắt → menu ẩn", 07) + thông báo nhẹ (toast).
// Hỏi `GET /api/v1/competition/status` (công khai, không gọi service) đúng một lần khi mở app và khi tab được quay lại sau
// khi đã ẩn lâu; lỗi mạng thì giữ trạng thái cũ chứ không tự tắt tính năng.

const CompetitionContext = createContext({
  enabled: false,
  available: false,
  loading: true,
  refresh: () => {},
  toast: () => {}
});

const TOAST_MS = 4500;
const TOAST_STYLES = {
  ok: 'border-emerald-500/40 bg-emerald-950/95 text-emerald-100',
  error: 'border-rose-500/40 bg-rose-950/95 text-rose-100',
  info: 'border-slate-600 bg-slate-900/95 text-slate-100'
};

export function CompetitionProvider({ children }) {
  const [status, setStatus] = useState({ enabled: false, available: false, loading: true });
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchStatus();
      setStatus({ ...next, loading: false });
    } catch {
      setStatus((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const toast = useCallback((message, kind = 'ok') => {
    if (!message) return;
    seq.current += 1;
    const id = seq.current;
    setToasts((list) => [...list.slice(-3), { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const value = useMemo(() => ({ ...status, refresh, toast }), [status, refresh, toast]);

  return (
    <CompetitionContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-24 right-4 z-[60] flex max-w-[min(420px,calc(100vw-2rem))] flex-col gap-2 lg:bottom-6" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${TOAST_STYLES[t.kind] || TOAST_STYLES.info}`}>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </CompetitionContext.Provider>
  );
}

export const useCompetition = () => useContext(CompetitionContext);
