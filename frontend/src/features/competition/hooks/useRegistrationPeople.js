import { useEffect, useState } from 'react';
import { playersApi, sessionsApi, tournamentsApi } from '../api/tournaments';
import { courtName } from '../lib/format';
import { playerIdsOf } from '../lib/tournamentModel';

// Danh sách người để đăng ký + ai đang bận ở buổi giao lưu / giải khác (ghi chú ⚠, xếp cuối — 07, K3). Dùng lại trong 60 giây:
// đăng ký liền nhiều cặp không phải tải lại mỗi lần.

const TTL_MS = 60000;
const cache = { at: 0, key: '', people: null, busy: null };

export const loadBusyPeople = async (exceptTournamentId) => {
  const out = new Map();
  const [sessions, tournaments] = await Promise.all([
    sessionsApi.list({ status: 'open', limit: 20 }).catch(() => ({ items: [] })),
    tournamentsApi.list({ limit: 50 }).catch(() => ({ items: [] }))
  ]);
  await Promise.all(sessions.items.map(async (s) => {
    const r = await sessionsApi.players(s.id).catch(() => ({ items: [] }));
    for (const p of r.items) if (p.status === 'present') out.set(p.playerId, p.onCourt ? `đang đánh ${courtName(p.onCourt)} (giao lưu)` : `đang ở buổi giao lưu "${s.name}"`);
  }));
  await Promise.all(tournaments.items.filter((x) => x.id !== exceptTournamentId && ['drawn', 'in_progress'].includes(x.status)).map(async (x) => {
    const r = await tournamentsApi.matches(x.id).catch(() => ({ items: [] }));
    for (const m of r.items.filter((y) => y.status === 'in_play')) for (const pid of playerIdsOf(m)) out.set(pid, `đang đánh ${courtName(m.courtRef)} (giải "${x.name}")`);
  }));
  return out;
};

/** `enabled` false → không tải (chỉ tải khi form đăng ký thật sự hiện). Trả { people, busy, loading, refresh }. */
export function useRegistrationPeople(tournamentId, enabled) {
  const [state, setState] = useState({ people: cache.key === tournamentId ? cache.people : null, busy: cache.key === tournamentId ? cache.busy : null, loading: false });

  const load = async (force = false) => {
    if (!force && cache.key === tournamentId && cache.people && Date.now() - cache.at < TTL_MS) {
      setState({ people: cache.people, busy: cache.busy, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const [list, busy] = await Promise.all([playersApi.list().catch(() => ({ items: [] })), loadBusyPeople(tournamentId)]);
    Object.assign(cache, { at: Date.now(), key: tournamentId, people: list.items, busy });
    setState({ people: list.items, busy, loading: false });
  };

  useEffect(() => {
    if (enabled) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tournamentId]);

  return { ...state, refresh: () => load(true) };
}
