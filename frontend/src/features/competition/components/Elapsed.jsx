import React, { useEffect, useState } from 'react';
import { fmtDuration } from '../lib/format';

// Đồng hồ "đã đánh bao lâu" của một sân — tính theo giờ của server (`skew` = serverTime − giờ máy, lấy từ snapshot SSE)
// để máy lệch giờ vẫn hiện đúng.
export default function Elapsed({ since, skew = 0, className = '' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  if (!since) return null;
  return <span className={`tabular-nums ${className}`}>{fmtDuration(now + skew - Date.parse(since))}</span>;
}
