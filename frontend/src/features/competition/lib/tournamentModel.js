import { isPairsTournament, disciplineText, FORMAT, PAIRING } from './labels';
import { courtName, fmtNumber, orgName } from './format';
import { phaseOf } from './phase';

// Mô hình dẫn xuất của trang một giải (dữ liệu tải về → những thứ nhiều tab dùng chung). Hàm thuần, có test.

/** Giải tạo trước plan 20 chỉ có số sân → coi như Sân 1..n. */
export const tourCourts = (t) => t.courtRefs || Array.from({ length: t.courtCount || 1 }, (_, i) => `bd:court:${i + 1}`);

export const playerIdsOf = (m) => [...(m.teamA ? m.teamA.players : []), ...(m.teamB ? m.teamB.players : [])].map((p) => p.id);

/** Nhãn một trận: "Bảng 2 · lượt 3", "Bán kết · lượt 7", "Trận thêm". */
export const matchTitle = (m) => {
  if (m.stage === 'group') return `Bảng ${m.groupNo} · lượt ${m.slotNo}`;
  if (m.stage === 'extra') return m.label || 'Trận thêm';
  return `${m.label || `Vòng ${m.roundNo}`}${m.slotNo ? ` · lượt ${m.slotNo}` : ''}`;
};

/** Gom entries thành "đơn vị đăng ký": cặp (đôi cặp sẵn, hai người cùng trạng thái) hoặc từng người. */
export const entryUnits = (t, es) => {
  const pairs = isPairsTournament(t);
  const byPlayer = new Map(es.map((e) => [e.playerId, e]));
  const seen = new Set();
  const units = [];
  for (const e of es) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const partner = pairs && e.partnerPlayerId ? byPlayer.get(e.partnerPlayerId) : null;
    if (partner && partner.status === e.status) {
      seen.add(partner.id);
      units.push([e, partner]);
    } else {
      units.push([e]);
    }
  }
  return units;
};

/**
 * Gợi ý cho từng sân TRỐNG THẬT (sân bận việc khác không nhận), không trùng người giữa các sân:
 * đi qua các sân trống, mỗi sân lấy trận ứng viên đầu tiên mà không ai đã được gợi ý ở sân khác.
 */
export const suggestForCourts = (freeCourts, candidates) => {
  const suggestion = new Map();
  const used = new Set();
  for (const court of freeCourts) {
    const pick = candidates.find((it) => !playerIdsOf(it.match).some((pid) => used.has(pid)));
    if (!pick) break;
    playerIdsOf(pick.match).forEach((pid) => used.add(pid));
    suggestion.set(court, pick);
  }
  return suggestion;
};

/**
 * @param bundle { t, entries, matches, standings, bracket, placements, next } — mỗi phần có thể null
 */
export const buildModel = (bundle) => {
  const { t } = bundle;
  const ms = bundle.matches || [];
  const es = bundle.entries || [];
  const next = bundle.next || null;
  const drawn = !['draft', 'open', 'cancelled'].includes(t.status);
  const live = ['drawn', 'in_progress'].includes(t.status);
  const courts = tourCourts(t);
  const onCourt = new Map(ms.filter((m) => m.status === 'in_play' && m.courtRef).map((m) => [m.courtRef, m]));
  const candidates = next ? next.items : [];
  const blocked = new Map(next ? next.blocked.map((b) => [b.matchId, b.players]) : []);
  // `freeCourts` của service = sân của giải không bận ở buổi giao lưu / giải khác.
  const busyElsewhere = next && next.freeCourts ? courts.filter((c) => !onCourt.has(c) && !next.freeCourts.includes(c)) : [];
  const freeCourts = courts.filter((c) => !onCourt.has(c) && !busyElsewhere.includes(c));
  const suggestion = suggestForCourts(freeCourts, candidates);
  const active = es.filter((e) => e.status !== 'withdrawn');
  const units = entryUnits(t, es);
  const done = ms.filter((m) => m.status === 'completed').length;
  const total = ms.filter((m) => m.status !== 'cancelled').length;

  const nameIn = (m, pid) => {
    const x = [...(m.teamA ? m.teamA.players : []), ...(m.teamB ? m.teamB.players : [])].find((y) => y.id === pid);
    return x ? x.name : '?';
  };
  const blockedText = (m) => (blocked.get(m.id) || []).map((b) => `${nameIn(m, b.id)} đang ở ${b.courtRef ? courtName(b.courtRef) : 'trận khác'}`).join(', ');

  const info = [
    `${disciplineText(t)} · ${FORMAT[t.format]}${t.discipline === 'doubles' ? ` · ${PAIRING[t.pairingMode]}` : ''}`,
    `${t.scoring.bestOf} game × ${t.scoring.points}`,
    courts.map(courtName).join(', '),
    `${t.startsOn}${t.startTime ? ` từ ${t.startTime}` : ''}`,
    t.checkInRequired ? 'bốc thăm tại sân' : 'bốc thăm trước',
    t.ratingRule
      ? `điều kiện ${t.ratingRule.scope === 'team_sum' ? 'tổng trình cặp' : 'trình'} ${[t.ratingRule.min != null ? `≥ ${fmtNumber(t.ratingRule.min, 1)}` : '', t.ratingRule.max != null ? `≤ ${fmtNumber(t.ratingRule.max, 1)}` : ''].filter(Boolean).join(', ')}`
      : '',
    orgName(t.organizerRef)
  ].filter(Boolean).join(' · ');

  return {
    t,
    ms,
    es,
    drawn,
    live,
    courts,
    onCourt,
    candidates,
    blocked,
    busyElsewhere,
    freeCourts,
    suggestion,
    active,
    units,
    done,
    total,
    hasResults: ms.some((m) => ['completed', 'in_play'].includes(m.status)),
    pairsMode: isPairsTournament(t),
    phase: phaseOf(t, ms, es),
    blockedText,
    info,
    standings: bundle.standings || null,
    bracket: bundle.bracket || null,
    placements: bundle.placements || null
  };
};

/** Các tab hiện được theo giai đoạn: [khoá, nhãn]. */
export const tabsOf = (model) => {
  const { t, live, drawn, onCourt, courts, done, total, active } = model;
  const registered = active.filter((e) => e.status === 'registered').length;
  return [
    live ? ['san', `Sân (${onCourt.size}/${courts.length})`] : null,
    t.status !== 'cancelled' ? ['dangky', `${t.status === 'open' || t.status === 'draft' ? 'Đăng ký' : 'Đăng ký & điểm danh'} (${registered})`] : null,
    drawn ? ['lich', `Lịch & kết quả (${done}/${total})`] : null,
    drawn ? ['bang', t.format === 'knockout' ? 'Sơ đồ' : t.format === 'round_robin' ? 'Bảng xếp hạng' : 'Bảng đấu & sơ đồ'] : null,
    t.status === 'finalized' ? ['ketqua', 'Kết quả chung cuộc'] : null
  ].filter(Boolean);
};

/** Tab mở sẵn theo giai đoạn: đã chốt → kết quả; đang đấu → sân; còn lại → đăng ký. */
export const defaultTab = (t) => (t.status === 'finalized' ? 'ketqua' : ['drawn', 'in_progress'].includes(t.status) ? 'san' : 'dangky');
