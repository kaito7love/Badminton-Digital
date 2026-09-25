const {
  expectedScore,
  effectiveMatches,
  kFactor,
  reliability,
  isProvisional,
  marginMultiplier,
  computePeriodRatings
} = require('../../src/modules/rating/domain/ratingEngine');
const { pairingRating } = require('../../src/modules/rating/domain/pairingRating');

const DAY = 24 * 60 * 60 * 1000;

describe('công thức cơ bản (docs/03 mục 3.2)', () => {
  test('chênh 0.5 ≈ 76% thắng, chênh 1.0 ≈ 91%', () => {
    expect(expectedScore(3.5, 3.0)).toBeCloseTo(0.76, 2);
    expect(expectedScore(4.0, 3.0)).toBeCloseTo(0.909, 3);
    expect(expectedScore(3, 3)).toBe(0.5);
  });

  test('K: người mới 0.30 → ≥ 20 trận 0.08', () => {
    expect(kFactor(0)).toBeCloseTo(0.3, 10);
    expect(kFactor(2)).toBeCloseTo(0.278, 10);
    expect(kFactor(15)).toBeCloseTo(0.135, 10);
    expect(kFactor(20)).toBeCloseTo(0.08, 10);
    expect(kFactor(40)).toBeCloseTo(0.08, 10);
  });

  test('độ tin cậy 5%/trận, tối đa 100%; dưới 10 trận là tạm tính', () => {
    expect(reliability(4)).toBe(20);
    expect(reliability(23)).toBe(100);
    expect(isProvisional(9)).toBe(true);
    expect(isProvisional(10)).toBe(false);
  });

  test('nghỉ > 180 ngày → số trận hiệu dụng giảm một nửa', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    expect(effectiveMatches(21, new Date(now - 100 * DAY), now)).toBe(21);
    expect(effectiveMatches(21, new Date(now - 181 * DAY), now)).toBe(10);
    expect(effectiveMatches(0, null, now)).toBe(0);
  });

  test('hệ số chênh tỉ số trong [0.9, 1.25]', () => {
    expect(marginMultiplier([[21, 17], [21, 19]], 'A')).toBeCloseTo(0.977, 3);
    expect(marginMultiplier([[21, 5], [21, 3]], 'A')).toBe(1.25);
    // A thắng 2–1 nhưng ghi ít điểm hơn (47 / 106) → kẹp ở 0.9, vẫn là hệ số dương
    expect(marginMultiplier([[5, 21], [21, 19], [21, 19]], 'A')).toBe(0.9);
  });
});

const doublesExample = {
  players: [
    { playerId: 'A1', rating: 3.2, ratedMatches: 2 },
    { playerId: 'A2', rating: 3.8, ratedMatches: 30 },
    { playerId: 'B1', rating: 3.6, ratedMatches: 15 },
    { playerId: 'B2', rating: 3.6, ratedMatches: 40 }
  ],
  matches: [
    { matchId: 'm1', sideA: ['A1', 'A2'], sideB: ['B1', 'B2'], games: [[21, 17], [21, 19]], outcome: 'normal', winnerSide: 'A' }
  ]
};

describe('computePeriodRatings', () => {
  test('ví dụ đôi ở docs/03 mục 3.2: +0.151 / +0.044 / −0.074 / −0.044', () => {
    const { changes } = computePeriodRatings(doublesExample);
    const by = Object.fromEntries(changes.map((c) => [c.playerId, c]));
    expect(by.A1.delta).toBe(0.151);
    expect(by.A1.after).toBe(3.351);
    expect(by.A2.delta).toBe(0.044);
    expect(by.B1.delta).toBe(-0.074);
    expect(by.B2.delta).toBe(-0.044);
    expect(by.A1.calc.matches[0]).toMatchObject({ E: 0.443, S: 1, m: 0.977, K: 0.278 });
  });

  test('bảng "lên/xuống bao nhiêu" (docs/03 mục 3.1, m = 1)', () => {
    const cases = [
      // [điểm mình, điểm đối thủ, số trận, thắng?, Δ kỳ vọng]
      [3.5, 3.0, 0, true, 0.072],
      [3.5, 3.0, 0, false, -0.228],
      [3.0, 3.0, 0, true, 0.15],
      [3.0, 3.5, 0, true, 0.228],
      [3.5, 3.0, 20, true, 0.019],
      [3.0, 3.0, 20, false, -0.04]
    ];
    for (const [me, opp, n, win, expected] of cases) {
      const { changes } = computePeriodRatings({
        players: [
          { playerId: 'me', rating: me, ratedMatches: n },
          { playerId: 'opp', rating: opp, ratedMatches: 0 }
        ],
        // games rỗng → m = 1, để so thẳng với bảng trong tài liệu
        matches: [{ matchId: 'x', sideA: ['me'], sideB: ['opp'], games: [], outcome: 'normal', winnerSide: win ? 'A' : 'B' }]
      });
      expect(changes.find((c) => c.playerId === 'me').delta).toBeCloseTo(expected, 3);
    }
  });

  test('đội thắng không bao giờ bị trừ, kể cả tỉ số rất sát', () => {
    const { changes } = computePeriodRatings({
      players: [
        { playerId: 'strong', rating: 5.5, ratedMatches: 30 },
        { playerId: 'weak', rating: 2.0, ratedMatches: 30 }
      ],
      matches: [{ matchId: 'x', sideA: ['strong'], sideB: ['weak'], games: [[30, 29]], outcome: 'normal', winnerSide: 'A' }]
    });
    expect(changes.find((c) => c.playerId === 'strong').delta).toBeGreaterThanOrEqual(0);
  });

  test('W.O. và bỏ cuộc chưa xong game nào không tính; bỏ cuộc có game xong thì tính', () => {
    const { changes, skipped } = computePeriodRatings({
      players: [
        { playerId: 'a', rating: 3, ratedMatches: 0 },
        { playerId: 'b', rating: 3, ratedMatches: 0 }
      ],
      matches: [
        { matchId: 'w', sideA: ['a'], sideB: ['b'], games: [], outcome: 'walkover', winnerSide: 'A' },
        { matchId: 'r0', sideA: ['a'], sideB: ['b'], games: [], outcome: 'retired', winnerSide: 'A' },
        { matchId: 'r1', sideA: ['a'], sideB: ['b'], games: [[21, 15]], outcome: 'retired', winnerSide: 'A' }
      ]
    });
    expect(skipped.map((s) => s.reason).sort()).toEqual(['RETIRED_NO_COMPLETED_GAME', 'WALKOVER']);
    expect(changes.find((c) => c.playerId === 'a').ratedMatchesAdded).toBe(1);
  });

  test('không phụ thuộc thứ tự trận', () => {
    const matches = [
      { matchId: 'm1', sideA: ['a'], sideB: ['b'], games: [[21, 10]], outcome: 'normal', winnerSide: 'A' },
      { matchId: 'm2', sideA: ['a'], sideB: ['c'], games: [[15, 21]], outcome: 'normal', winnerSide: 'B' },
      { matchId: 'm3', sideA: ['b'], sideB: ['c'], games: [[21, 19]], outcome: 'normal', winnerSide: 'A' }
    ];
    const players = [
      { playerId: 'a', rating: 3.1, ratedMatches: 3 },
      { playerId: 'b', rating: 2.7, ratedMatches: 12 },
      { playerId: 'c', rating: 3.4, ratedMatches: 25 }
    ];
    const forward = computePeriodRatings({ players, matches }).changes;
    const backward = computePeriodRatings({ players, matches: [...matches].reverse() }).changes;
    expect(backward).toEqual(forward);
  });

  test('hệ số trận giao lưu 0.5 → Δ còn một nửa', () => {
    const base = { playerId: 'a', rating: 3, ratedMatches: 0 };
    const opp = { playerId: 'b', rating: 3, ratedMatches: 0 };
    const match = { matchId: 'm', sideA: ['a'], sideB: ['b'], games: [], outcome: 'normal', winnerSide: 'A' };
    const full = computePeriodRatings({ players: [base, opp], matches: [match] }).changes[0].delta;
    const half = computePeriodRatings({ players: [base, opp], matches: [{ ...match, weight: 0.5 }] }).changes[0].delta;
    expect(half).toBeCloseTo(full / 2, 3);
  });

  test('điểm bị kẹp trong [1.0, 7.0]', () => {
    const { changes } = computePeriodRatings({
      players: [
        { playerId: 'a', rating: 1.0, ratedMatches: 0 },
        { playerId: 'b', rating: 1.0, ratedMatches: 0 }
      ],
      matches: [{ matchId: 'm', sideA: ['a'], sideB: ['b'], games: [], outcome: 'normal', winnerSide: 'A' }]
    });
    expect(changes.find((c) => c.playerId === 'b').after).toBe(1.0);
  });
});

describe('pairingRating — chống giấu trình', () => {
  test('ví dụ docs/02 §4.1: điểm 3.47, đỉnh 12 tháng 4.05 → 3.55', () => {
    expect(pairingRating(3.47, 4.05)).toBe(3.55);
  });
  test('đỉnh không cao hơn điểm + 0.5 → giữ điểm hiện tại', () => {
    expect(pairingRating(3.47, 3.8)).toBe(3.47);
    expect(pairingRating(3.47, null)).toBe(3.47);
  });
});
