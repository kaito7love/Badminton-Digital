const jwt = require('jsonwebtoken');

// Service token ES256 (docs/01 mục 6): ký cho TỪNG request, sống 60 giây (đường SSE 300 giây — service đóng
// luồng đúng lúc token hết hạn và EventSource tự nối lại). Service chỉ giữ khoá CÔNG KHAI.
const TOKEN_TTL_SECONDS = 60;
const STREAM_TOKEN_TTL_SECONDS = 300;

const signServiceToken = (config, principal, { stream = false } = {}) => {
  const claims = {
    tenant: config.tenant,
    scope: principal.scope.join(' '),
    org: principal.org
  };
  if (principal.player) {
    claims.player = principal.player;
    if (principal.playerName) claims.player_name = principal.playerName;
  }
  return jwt.sign(claims, config.signingKey, {
    algorithm: 'ES256',
    issuer: config.issuer,
    audience: config.audience,
    subject: principal.sub,
    keyid: config.keyId,
    expiresIn: stream ? STREAM_TOKEN_TTL_SECONDS : TOKEN_TTL_SECONDS
  });
};

module.exports = { signServiceToken, TOKEN_TTL_SECONDS, STREAM_TOKEN_TTL_SECONDS };
