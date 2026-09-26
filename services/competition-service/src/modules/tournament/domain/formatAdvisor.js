const { DomainError } = require('../../../shared/domainError');
const { roundRobin, scheduleSlots, nextPow2 } = require('../../matchmaking').domain;

// Gợi ý thể thức + ước tính số trận / lượt / thời gian (docs/06 mục 2–3).
//  ≤ 6 đội → vòng tròn · ≤ 32 → vòng bảng + loại trực tiếp · còn lại → loại trực tiếp
//  số bảng = round(đội / 4), mỗi bảng 3–5 đội; đi tiếp 2 đội / bảng nếu tổng ≤ 16

const suggestFormat = (teams) => (teams <= 6 ? 'round_robin' : teams <= 32 ? 'groups_knockout' : 'knockout');

const suggestGroups = (teams) => {
  let groups = Math.max(2, Math.round(teams / 4));
  while (groups > 2 && teams / groups < 3) groups -= 1;
  while (teams / groups > 5) groups += 1;
  return groups;
};

const groupSizes = (teams, groups) =>
  Array.from({ length: groups }, (_, i) => Math.floor(teams / groups) + (i < teams % groups ? 1 : 0));

// Ước tính số lượt vòng bảng bằng chính thuật toán xếp lượt.
const groupStageSlots = (sizes, courts) => {
  const matches = [];
  sizes.forEach((size, g) => {
    const ids = Array.from({ length: size }, (_, i) => `G${g}T${i}`);
    roundRobin(ids).rounds.forEach((r) => r.matches.forEach(([a, b], k) => matches.push({ id: `${g}-${r.round}-${k}`, teams: [a, b], groupNo: g, round: r.round })));
  });
  return { matches: matches.length, slots: scheduleSlots({ matches, courts }).slots.length };
};

// Vòng 1 chỉ có (số đội − size/2) trận thật (còn lại là bye); các vòng sau đủ trận.
const knockoutSlots = (qualified, courts, thirdPlace) => {
  const size = nextPow2(qualified);
  const rounds = Math.log2(size);
  let matches = 0;
  let slots = 0;
  for (let r = 1; r <= rounds; r += 1) {
    let count = r === 1 ? qualified - size / 2 : size / 2 ** r;
    if (r === rounds && thirdPlace && rounds >= 2) count += 1;
    matches += count;
    slots += Math.ceil(count / courts);
  }
  return { matches, slots };
};

const advise = ({ teams, courts = 2, matchMinutes = 15, format, groupCount, advancePerGroup, thirdPlace = false }) => {
  if (!Number.isInteger(teams) || teams < 2) throw new DomainError('INVALID_ADVICE', 'Cần ít nhất 2 đội');
  const chosen = format || suggestFormat(teams);
  let groups = null;
  let advance = null;
  let est;
  if (chosen === 'round_robin') {
    est = groupStageSlots([teams], courts);
  } else if (chosen === 'groups_knockout') {
    groups = groupCount || suggestGroups(teams);
    if (teams < groups * 2) throw new DomainError('INVALID_ADVICE', `${teams} đội không đủ chia ${groups} bảng`);
    advance = advancePerGroup || (groups * 2 <= 16 ? 2 : 1);
    const g = groupStageSlots(groupSizes(teams, groups), courts);
    const k = knockoutSlots(groups * advance, courts, thirdPlace);
    est = { matches: g.matches + k.matches, slots: g.slots + k.slots, groupMatches: g.matches, knockoutMatches: k.matches };
  } else {
    est = knockoutSlots(teams, courts, thirdPlace);
  }
  return {
    format: chosen,
    suggestedFormat: suggestFormat(teams),
    groupCount: groups,
    groupSizes: groups ? groupSizes(teams, groups) : chosen === 'round_robin' ? [teams] : null,
    advancePerGroup: advance,
    estimate: { matches: est.matches, slots: est.slots, minutes: est.slots * matchMinutes }
  };
};

module.exports = { advise, suggestFormat, suggestGroups, groupSizes };
