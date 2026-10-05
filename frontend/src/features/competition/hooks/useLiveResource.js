import { useCallback, useEffect, useRef, useState } from 'react';
import { connectCompetitionStream } from '../realtime/competitionStream';

/**
 * Tải một tài nguyên thi đấu và giữ nó mới nhờ SSE của giải / buổi (07 mục 3 "Tự cập nhật" + "Không làm mất thao tác dở"):
 *  - `board` (có gì đó đổi) → tải lại NGAY, trừ khi trang đang bận (người dùng đang gõ / mở hộp thoại / ô nhập tỉ số) — khi đó
 *    chỉ bật `pending` để hiện dải "Có cập nhật mới — Tải lại"; thao tác xong (`setBusy(false)`) thì tự tải;
 *  - `score` / `snapshot` → chuyển cho `onEvent` (đổi số của sân đó ngay, không tải lại cả trang);
 *  - mất luồng → `status = 'reconnecting'` và poll mỗi `pollMs` làm dự phòng; nối lại được thì tải lại một lần.
 * Chỉ nhận kết quả của lần tải MỚI NHẤT (lần tải cũ về muộn không ghi đè).
 */
export const decideOnBoard = ({ busy }) => (busy ? 'defer' : 'reload');

export function useLiveResource({ load, stream = null, onEvent, pollMs = 10000, enabled = true }) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(stream ? 'connecting' : 'idle');
  const busyRef = useRef(false);
  const pendingRef = useRef(false);
  const seqRef = useRef(0);
  const loadRef = useRef(load);
  const onEventRef = useRef(onEvent);
  loadRef.current = load;
  onEventRef.current = onEvent;

  const markPending = (value) => {
    pendingRef.current = value;
    setPending(value);
  };

  const reload = useCallback(async ({ silent = false } = {}) => {
    const seq = (seqRef.current += 1);
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loadRef.current();
      if (seq !== seqRef.current) return undefined;
      setState({ data, loading: false, error: null });
      pendingRef.current = false;
      setPending(false);
      return data;
    } catch (error) {
      if (seq !== seqRef.current) return undefined;
      // Tải ngầm lỗi thì giữ dữ liệu cũ trên màn hình, chỉ ghi lỗi.
      setState((s) => ({ data: silent ? s.data : null, loading: false, error }));
      return undefined;
    }
  }, []);

  /** Trang gọi `setBusy(true)` khi mở form / hộp thoại / ô nhập; `setBusy(false)` khi xong → nếu có cập nhật chờ thì tải. */
  const setBusy = useCallback((busy) => {
    busyRef.current = Boolean(busy);
    if (!busy && pendingRef.current) reload({ silent: true });
  }, [reload]);

  // Tải lần đầu và mỗi khi đổi tài nguyên.
  const streamKey = stream ? `${stream.kind}:${stream.id}` : '';
  useEffect(() => {
    if (!enabled) return undefined;
    reload();
    return () => { seqRef.current += 1; };
  }, [enabled, streamKey, reload]);

  useEffect(() => {
    if (!enabled || !stream) return undefined;
    const branchId = (() => {
      try { return localStorage.getItem('admin_selected_branch_id') || undefined; } catch { return undefined; }
    })();
    return connectCompetitionStream({
      kind: stream.kind,
      id: stream.id,
      branchId,
      onStatusChange: setStatus,
      onEvent: (name, payload) => {
        if (name === 'board') {
          if (decideOnBoard({ busy: busyRef.current }) === 'reload') reload({ silent: true });
          else markPending(true);
        }
        onEventRef.current?.(name, payload);
      },
      onReconnect: () => {
        if (decideOnBoard({ busy: busyRef.current }) === 'reload') reload({ silent: true });
        else markPending(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, streamKey, reload]);

  // Dự phòng: luồng đang mất thì poll.
  useEffect(() => {
    if (!enabled || !stream || status === 'live' || status === 'connecting') return undefined;
    const timer = setInterval(() => {
      if (!busyRef.current) reload({ silent: true });
    }, pollMs);
    return () => clearInterval(timer);
  }, [enabled, streamKey, status, pollMs, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, reload, pending, setBusy, status };
}
