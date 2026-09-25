// Ký service token thử bằng khoá dev (.keys/dev-private.jwk.json) — để gọi API
// bằng curl / Swagger khi chạy service một mình, không cần app chính.
//   npm run token:dev -- --scope "rating:read player:write" --org bd:branch:1
//   npm run token:dev -- --scope rating:self --player bd:customer:12 --name "Nguyễn Văn An"
// Tuỳ chọn: --tenant (mặc định badminton-digital) --sub --ttl (giây, mặc định 300)
const fs = require('fs');
const path = require('path');
const { SignJWT, importJWK } = require('jose');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

(async () => {
  const file = path.join(__dirname, '..', '.keys', 'dev-private.jwk.json');
  if (!fs.existsSync(file)) {
    console.error('Chưa có khoá dev — chạy: npm run keys:generate');
    process.exit(1);
  }
  const { issuer, key } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const privateKey = await importJWK(key, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    tenant: args.tenant || 'badminton-digital',
    scope: args.scope || '',
    org: args.org ? args.org.split(',') : []
  };
  if (args.player) claims.player = args.player;
  if (args.name) claims.player_name = args.name;
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: key.kid })
    .setIssuer(issuer)
    .setAudience(args.aud || 'competition-service')
    .setSubject(args.sub || 'dev:user')
    .setIssuedAt(now)
    .setExpirationTime(now + Number(args.ttl || 300))
    .sign(privateKey);
  process.stdout.write(token);
})();
