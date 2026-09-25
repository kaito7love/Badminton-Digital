const { jwtVerify, createLocalJWKSet, decodeJwt, errors: joseErrors } = require('jose');
const { unauthenticated, forbiddenScope } = require('./errors');

// Service token: app chính (gateway) ký ES256 cho từng request, service chỉ giữ
// khoá CÔNG KHAI → service bị lộ cũng không ký giả được token. Xem
// docs/01-kien-truc.md mục 6.

const createAuthenticator = (authConfig) => {
  const issuers = new Map(
    authConfig.trustedIssuers.map((item) => [item.issuer, createLocalJWKSet(item.jwks)])
  );

  const verify = async (token) => {
    let unverified;
    try {
      unverified = decodeJwt(token);
    } catch {
      throw unauthenticated('Token không đúng định dạng JWT');
    }
    const keySet = issuers.get(unverified.iss);
    if (!keySet) throw unauthenticated('Bên ký token không nằm trong danh sách tin cậy');

    let payload;
    try {
      ({ payload } = await jwtVerify(token, keySet, {
        issuer: unverified.iss,
        audience: authConfig.audience,
        algorithms: ['ES256'],
        clockTolerance: authConfig.clockToleranceSeconds,
        requiredClaims: ['exp', 'iat', 'sub', 'tenant']
      }));
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw unauthenticated('Token đã hết hạn');
      throw unauthenticated('Token không hợp lệ');
    }

    // Token sống quá lâu = rủi ro nếu bị lộ; gateway ký token 60 giây.
    if (payload.exp - payload.iat > authConfig.maxTokenLifetimeSeconds) {
      throw unauthenticated('Thời hạn token quá dài');
    }
    if (typeof payload.tenant !== 'string' || !payload.tenant) throw unauthenticated('Token thiếu tenant');

    const org = Array.isArray(payload.org) ? payload.org.filter((o) => typeof o === 'string') : [];
    return {
      issuer: payload.iss,
      tenant: payload.tenant,
      sub: String(payload.sub),
      clientId: `${payload.iss}|${payload.sub}`,
      scopes: new Set(typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : []),
      org,
      allOrgs: org.includes('*'),
      player: typeof payload.player === 'string' ? payload.player : null,
      playerName: typeof payload.player_name === 'string' ? payload.player_name : null
    };
  };

  const middleware = async (req, res, next) => {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return next(unauthenticated('Thiếu header Authorization: Bearer <service token>'));
    try {
      req.auth = await verify(match[1].trim());
      return next();
    } catch (err) {
      return next(err);
    }
  };

  return { verify, middleware };
};

const hasScope = (req, scope) => Boolean(req.auth && req.auth.scopes.has(scope));

// Cần ÍT NHẤT MỘT trong các scope liệt kê.
const requireScope = (...scopes) => (req, res, next) =>
  scopes.some((s) => hasScope(req, s)) ? next() : next(forbiddenScope(scopes));

// Organizer (vd chi nhánh) nằm trong claim `org` của token không.
const canAccessOrganizer = (auth, organizerRef) => auth.allOrgs || auth.org.includes(organizerRef);

module.exports = { createAuthenticator, hasScope, requireScope, canAccessOrganizer };
