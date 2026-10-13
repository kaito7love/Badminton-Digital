import { useCallback, useEffect, useRef, useState } from 'react';
import { publicService } from '../../services/apiServices';

/** Lưới tải lại ngầm mỗi chừng này mili giây khi tab đang hiện. */
export const REFRESH_MS = 30000;

/**
 * Tải lưới sân × giờ của một ngày (`GET /public/availability/day`).
 *
 * Hai kiểu tải:
 *  · thường (đổi ngày / chi nhánh / bấm Thử lại): hiện khung chờ, xoá lưới cũ để
 *    không vẽ ngày này bằng dữ liệu của ngày kia;
 *  · ngầm (30 giây một lần, khi tab được focus lại, sau lỗi 409): giữ nguyên lưới
 *    đang hiện, chỉ thay dữ liệu khi có phản hồi — lỗi mạng lúc này không được
 *    làm lưới biến mất khi khách đang chọn dở.
 *
 * Phản hồi tới trễ của yêu cầu cũ (đã đổi ngày) bị bỏ qua nhờ số thứ tự.
 *
 * @param {{ date: string, branchId?: string, paused?: boolean }} p
 *   `paused`: tạm dừng tải ngầm (vd hộp xác nhận đang mở).
 */
export default function useDayAvailability({ date, branchId, paused = false }) {
  const [state, setState] = useState({ day: null, loading: true, error: null, stamp: null });
  const seq = useRef(0);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const mine = ++seq.current;
      if (!silent) setState({ day: null, loading: true, error: null, stamp: null });
      try {
        const res = await publicService.getDayAvailability({
          date,
          ...(branchId ? { branchId } : {})
        });
        if (mine !== seq.current) return;
        setState({ day: res.data?.data || null, loading: false, error: null, stamp: new Date() });
      } catch (err) {
        if (mine !== seq.current) return;
        if (silent) return; // giữ lưới cũ
        setState({
          day: null,
          loading: false,
          error: err.response?.data?.message && err.response.data.message !== 'Validation failed'
            ? err.response.data.message
            : 'Chưa tải được lịch sân. Kiểm tra kết nối rồi thử lại.',
          stamp: null
        });
      }
    },
    [date, branchId]
  );

  // Đổi ngày / chi nhánh: tải lại từ đầu.
  useEffect(() => {
    load();
    return () => {
      seq.current += 1; // huỷ phản hồi đang bay của ngày cũ
    };
  }, [load]);

  // Tải ngầm theo chu kỳ và khi tab được chú ý trở lại.
  useEffect(() => {
    if (paused) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') load({ silent: true });
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [load, paused]);

  return {
    day: state.day,
    loading: state.loading,
    error: state.error,
    stamp: state.stamp,
    reload: () => load(),
    refresh: () => load({ silent: true })
  };
}
