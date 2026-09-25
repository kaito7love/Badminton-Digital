const crypto = require('crypto');

// PRNG tái lập được: cùng seed → cùng dãy số. Seed được lưu ở giải / buổi nên
// ai cũng kiểm chứng lại được kết quả bốc thăm. (mulberry32, seed băm sha256)

const newSeed = () => crypto.randomBytes(4).toString('hex');

const createRng = (seed) => {
  let state = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  const shuffle = (items) => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (items) => items[int(items.length)];
  return { next, int, shuffle, pick };
};

module.exports = { newSeed, createRng };
