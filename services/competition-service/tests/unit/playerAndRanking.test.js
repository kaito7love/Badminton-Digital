const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ageGroup, publicName, viewerKind, canViewProfile, validateProfilePatch } = require('../../src/modules/player/domain/profile');
const { isEligible, rankRows, projectedRank } = require('../../src/modules/ranking/domain/leaderboardRules');
const { loadConfig } = require('../../src/platform/config');
const { sign, verify } = require('../../src/platform/events/signature');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-26T00:00:00Z');

describe('hồ sơ người chơi (docs/05 mục 1)', () => {
  test('nhóm tuổi', () => {
    expect(ageGroup(2010, now)).toBe('U18');
    expect(ageGroup(1995, now)).toBe('18-34');
    expect(ageGroup(1985, now)).toBe('35-44');
    expect(ageGroup(1975, now)).toBe('45-54');
    expect(ageGroup(1960, now)).toBe('55+');
    expect(ageGroup(null, now)).toBeNull();
  });

  test('tên công khai: tên thi đấu, không thì "Tên + chữ đầu của họ"', () => {
    expect(publicName({ displayName: 'Nguyễn Văn An' })).toBe('An N.');
    expect(publicName({ displayName: 'Bình', nickname: null })).toBe('Bình');
    expect(publicName({ displayName: 'Trần Thị Hoa', nickname: 'Hoa Lưới' })).toBe('Hoa Lưới');
  });

  test('quyền xem theo visibility × người xem', () => {
    const scopes = (s) => ({ scopes: new Set(s.split(' ')), sub: 'bd:user:1' });
    expect(viewerKind(scopes('rating:read'))).toBe('staff');
    expect(viewerKind({ scopes: new Set(['ranking:read']), sub: 'anonymous' })).toBe('public');
    expect(viewerKind(scopes('rating:self ranking:read'))).toBe('member');
    const p = (visibility) => ({ visibility, status: 'active' });
    expect(canViewProfile(p('public'), 'public', false)).toBe(true);
    expect(canViewProfile(p('members'), 'public', false)).toBe(false);
    expect(canViewProfile(p('members'), 'member', false)).toBe(true);
    expect(canViewProfile(p('hidden'), 'member', false)).toBe(false);
    expect(canViewProfile(p('hidden'), 'member', true)).toBe(true);
    expect(canViewProfile(p('hidden'), 'staff', false)).toBe(true);
  });

  test('kiểm hồ sơ: năm hợp lệ, tên thi đấu, năm bắt đầu chơi không trước năm sinh', () => {
    expect(validateProfilePatch({ nickname: '  An Smash ', birthYear: 1995 }, now)).toEqual({ nickname: 'An Smash', birthYear: 1995 });
    expect(() => validateProfilePatch({ birthYear: 2030 }, now)).toThrow();
    expect(() => validateProfilePatch({ nickname: 'x' }, now)).toThrow();
    expect(() => validateProfilePatch({ birthYear: 2000, playingSinceYear: 1998 }, now)).toThrow();
  });
});

describe('luật BXH trình độ (docs/05 mục 3.1)', () => {
  test('điều kiện: ≥ 5 trận hoặc đã xác nhận, VÀ có trận trong 12 tháng', () => {
    const recent = new Date(now - 30 * DAY);
    expect(isEligible({ ratedMatches: 5, verified: false, lastMatchAt: recent }, now)).toBe(true);
    expect(isEligible({ ratedMatches: 4, verified: false, lastMatchAt: recent }, now)).toBe(false);
    expect(isEligible({ ratedMatches: 1, verified: true, lastMatchAt: recent }, now)).toBe(true);
    expect(isEligible({ ratedMatches: 30, verified: true, lastMatchAt: new Date(now - 400 * DAY) }, now)).toBe(false);
    expect(isEligible({ ratedMatches: 0, verified: true, lastMatchAt: null }, now)).toBe(false);
  });

  test('đồng hạng khi bằng điểm (tới 0.01) và bằng số trận', () => {
    const ranked = rankRows([
      { playerId: 'a', rating: 4.001, ratedMatches: 10 },
      { playerId: 'b', rating: 3.999, ratedMatches: 10 },
      { playerId: 'c', rating: 4.2, ratedMatches: 6 },
      { playerId: 'd', rating: 4.0, ratedMatches: 12 }
    ]);
    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([['c', 1], ['d', 2], ['a', 3], ['b', 3]]);
    expect(projectedRank(ranked, 4.1)).toBe(2);
  });
});

describe('platform', () => {
  test('cấu hình: secret webhook < 32 ký tự bị từ chối; khoá bí mật trong TRUSTED_ISSUERS bị từ chối; production bắt buộc có bên ký', () => {
    expect(() => loadConfig({ WEBHOOK_TARGETS: JSON.stringify([{ name: 'x', url: 'http://x', secret: 'short', types: ['*'] }]) })).toThrow(/32/);
    expect(() => loadConfig({ TRUSTED_ISSUERS: JSON.stringify([{ issuer: 'a', jwks: { keys: [{ kty: 'EC', d: 'secret' }] } }]) })).toThrow(/BÍ MẬT/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/TRUSTED_ISSUERS/);
    expect(loadConfig({}).http.port).toBe(5100);
  });

  test('chữ ký HMAC: đúng secret + đúng thời gian mới hợp lệ', () => {
    const t = Math.floor(Date.now() / 1000);
    const s = sign('k'.repeat(40), t, '{"a":1}');
    expect(verify({ secret: 'k'.repeat(40), signature: s, timestamp: t, body: '{"a":1}', toleranceSeconds: 300 })).toBe(true);
    expect(verify({ secret: 'k'.repeat(40), signature: s, timestamp: t, body: '{"a":2}', toleranceSeconds: 300 })).toBe(false);
    expect(verify({ secret: 'x'.repeat(40), signature: s, timestamp: t, body: '{"a":1}', toleranceSeconds: 300 })).toBe(false);
    expect(verify({ secret: 'k'.repeat(40), signature: s, timestamp: t - 1000, body: '{"a":1}', toleranceSeconds: 300 })).toBe(false);
  });
});

describe('ranh giới module (scripts/check-boundaries.js)', () => {
  const script = path.join(__dirname, '..', '..', 'scripts', 'check-boundaries.js');

  test('code hiện tại đạt', () => {
    expect(execFileSync(process.execPath, [script]).toString()).toMatch(/Ranh giới OK/);
  });

  test('thêm một require sai (player → rating, chui vào trong module) → exit 1', () => {
    const bad = path.join(__dirname, '..', '..', 'src', 'modules', 'player', '__boundary_probe.js');
    fs.writeFileSync(bad, "require('../rating/domain/levels');\n");
    try {
      let failed = false;
      try {
        execFileSync(process.execPath, [script], { stdio: 'pipe' });
      } catch (err) {
        failed = true;
        expect(err.stderr.toString()).toMatch(/chui vào bên trong module rating/);
        expect(err.stderr.toString()).toMatch(/module player không được phụ thuộc rating/);
      }
      expect(failed).toBe(true);
    } finally {
      fs.unlinkSync(bad);
    }
  });
});
