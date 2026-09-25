// Sinh cặp khoá ES256 cho DEV: khoá bí mật để ký token thử (npm run token:dev),
// khoá công khai để service tin (TRUSTED_ISSUERS_FILE). Không dùng cho production —
// ở production khoá bí mật nằm ở gateway của app chính.
//   npm run keys:generate            → .keys/dev-private.jwk.json + .keys/trusted-issuers.json
const fs = require('fs');
const path = require('path');
const { generateKeyPair, exportJWK } = require('jose');

const ISSUER = process.argv[2] || 'dev-local';

(async () => {
  const dir = path.join(__dirname, '..', '.keys');
  fs.mkdirSync(dir, { recursive: true });
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const kid = `${ISSUER}-${new Date().toISOString().slice(0, 10)}`;
  const priv = { ...(await exportJWK(privateKey)), kid, alg: 'ES256' };
  const pub = { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' };
  fs.writeFileSync(path.join(dir, 'dev-private.jwk.json'), JSON.stringify({ issuer: ISSUER, key: priv }, null, 2));
  fs.writeFileSync(path.join(dir, 'trusted-issuers.json'), JSON.stringify([{ issuer: ISSUER, jwks: { keys: [pub] } }], null, 2));
  console.log(`Đã tạo khoá ${kid} trong .keys/`);
  console.log('Thêm vào .env:  TRUSTED_ISSUERS_FILE=.keys/trusted-issuers.json');
})();
