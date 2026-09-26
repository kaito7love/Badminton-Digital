// Dựng khung sơ đồ loại trực tiếp từ các vị trí (docs/06 mục 5):
//  - vòng r trận m → vòng r+1 trận ceil(m/2), ô A nếu m lẻ, ô B nếu m chẵn
//  - lượt miễn đấu (bye) ở vòng 1: không tạo trận, đội được đặt thẳng vào ô vòng 2
//  - có tranh hạng 3: hai đội thua bán kết tự vào trận tranh hạng 3

const roundLabel = (round, rounds) => {
  const remaining = 2 ** (rounds - round + 1);
  if (remaining === 2) return 'Chung kết';
  if (remaining === 4) return 'Bán kết';
  if (remaining === 8) return 'Tứ kết';
  return `Vòng 1/${remaining / 2}`;
};

const planBracket = ({ positions, thirdPlace = false }) => {
  const size = positions.length;
  const rounds = Math.log2(size);
  const key = (r, m) => `R${r}M${m}`;
  const matches = new Map();
  for (let r = 1; r <= rounds; r += 1) {
    const count = size / 2 ** r;
    for (let m = 1; m <= count; m += 1) {
      matches.set(key(r, m), {
        key: key(r, m),
        roundNo: r,
        bracketPos: m,
        label: roundLabel(r, rounds),
        teamA: null,
        teamB: null,
        nextKey: r < rounds ? key(r + 1, Math.ceil(m / 2)) : null,
        nextSlot: r < rounds ? (m % 2 === 1 ? 'A' : 'B') : null,
        loserNextKey: null,
        loserNextSlot: null
      });
    }
  }
  if (thirdPlace && rounds >= 2) {
    matches.set('TP', {
      key: 'TP', roundNo: rounds, bracketPos: 2, label: 'Tranh hạng 3', teamA: null, teamB: null,
      nextKey: null, nextSlot: null, loserNextKey: null, loserNextSlot: null, thirdPlace: true
    });
    matches.get(key(rounds - 1, 1)).loserNextKey = 'TP';
    matches.get(key(rounds - 1, 1)).loserNextSlot = 'A';
    matches.get(key(rounds - 1, 2)).loserNextKey = 'TP';
    matches.get(key(rounds - 1, 2)).loserNextSlot = 'B';
  }
  // Vòng 1: đặt đội; bye → đẩy thẳng lên vòng 2.
  for (let m = 1; m <= size / 2; m += 1) {
    const a = positions[2 * m - 2];
    const b = positions[2 * m - 1];
    const match = matches.get(key(1, m));
    if (a && b) {
      match.teamA = a;
      match.teamB = b;
    } else {
      const advancing = a || b;
      if (advancing && match.nextKey) matches.get(match.nextKey)[match.nextSlot === 'A' ? 'teamA' : 'teamB'] = advancing;
      match.bye = true;
    }
  }
  return { size, rounds, matches: [...matches.values()].filter((m) => !m.bye) };
};

module.exports = { planBracket, roundLabel };
