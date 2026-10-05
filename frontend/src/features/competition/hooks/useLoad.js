import { useEffect, useState } from 'react';

/** Tải một lần khi mở hộp thoại (và tải lại khi `deps` đổi): { data, error, loading }. Bỏ kết quả về muộn sau khi đóng / đổi deps. */
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null, loading: true });
    loader().then((data) => { if (alive) setState({ data, error: null, loading: false }); }).catch((error) => { if (alive) setState({ data: null, error, loading: false }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
