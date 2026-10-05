import { useEffect, useState } from 'react';
import { sessionsApi, tournamentsApi } from '../api/tournaments';

// Sân đang được buổi giao lưu / giải khác dùng (07, K3): ref → { label, live }. `live` = buổi đang diễn ra hoặc giải đang đánh
// (sân bận thật — form tạo giải không chọn sẵn); giải còn mở đăng ký cũng chọn sân đó thì chỉ ghi chú.

export const computeCourtUsage = (sessions, tournaments, exceptTournamentId = null) => {
  const out = new Map();
  for (const s of sessions) for (const c of s.courtRefs || []) out.set(c, { label: `buổi giao lưu "${s.name}" đang diễn ra`, live: true });
  for (const t of tournaments) {
    if (t.id === exceptTournamentId || !['open', 'drawn', 'in_progress'].includes(t.status) || !t.courtRefs) continue;
    const live = t.status !== 'open';
    for (const c of t.courtRefs) {
      if (!out.has(c) || (live && !out.get(c).live)) out.set(c, { label: `giải "${t.name}"${live ? ' đang đánh' : ' (chưa bốc thăm) cũng chọn'}`, live });
    }
  }
  return out;
};

export function useCourtUsage(exceptTournamentId = null) {
  const [state, setState] = useState({ usage: new Map(), loaded: false });
  useEffect(() => {
    let alive = true;
    Promise.all([
      sessionsApi.list({ status: 'open', limit: 50 }).catch(() => ({ items: [] })),
      tournamentsApi.list({ limit: 50 }).catch(() => ({ items: [] }))
    ]).then(([s, t]) => { if (alive) setState({ usage: computeCourtUsage(s.items, t.items, exceptTournamentId), loaded: true }); });
    return () => { alive = false; };
  }, [exceptTournamentId]);
  return state;
}
