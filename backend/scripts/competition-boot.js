'use strict';

/**
 * Bản demo MỘT container (docker/demo-entrypoint.sh, plan 24): backend và competition-service cùng chạy trong
 * một container Render, nên không cần khoá cố định — mỗi lần khởi động tự sinh một cặp ES256 mới và suy ra mọi
 * biến cho cả hai process. Chủ dự án không phải dán khoá hay JSON nào lên Render; chỉ cần hai secret HMAC
 * (Render tự sinh bằng generateValue) và tên DB thứ hai.
 *
 *   eval "$(node scripts/competition-boot.js)"     # entrypoint: in ra các dòng `export NAME='…'`
 *
 * Khoá bí mật nằm trong RAM của container (biến môi trường), không ghi đĩa, không in ra log; container dậy lại thì
 * khoá mới — token chỉ sống 60 giây nên không mất gì. Đường compose / VPS thật dùng khoá cố định (`npm run competition:keys`).
 *
 * Đầu vào: COMPETITION_EVENT_SECRET, COMPETITION_WEBHOOK_SECRET (≥ 32 ký tự, khác nhau); tuỳ chọn PORT của backend (mặc định 5000),
 * COMPETITION_SERVICE_PORT (mặc định 5100). Thiếu / sai → thoát mã 1 kèm lý do trên stderr (entrypoint dừng container).
 */
const { generateKeyset } = require('./competition-keys');

const MIN_SECRET_LENGTH = 32;

/** Trích dẫn an toàn cho sh: bọc nháy đơn, nháy đơn bên trong thành '\''. */
const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

/** Hàm thuần (test được): trả về { exports: [[tên, giá trị]…] } hoặc ném lỗi nêu rõ cấu hình sai. */
const buildBootEnv = (env = process.env, { now = new Date() } = {}) => {
  const eventSecret = String(env.COMPETITION_EVENT_SECRET || '').trim();
  const webhookSecret = String(env.COMPETITION_WEBHOOK_SECRET || '').trim();
  for (const [name, value] of [['COMPETITION_EVENT_SECRET', eventSecret], ['COMPETITION_WEBHOOK_SECRET', webhookSecret]]) {
    if (value.length < MIN_SECRET_LENGTH) throw new Error(`${name} thiếu hoặc ngắn hơn ${MIN_SECRET_LENGTH} ký tự.`);
  }
  if (eventSecret === webhookSecret) throw new Error('COMPETITION_EVENT_SECRET và COMPETITION_WEBHOOK_SECRET phải khác nhau.');

  const servicePort = Number(env.COMPETITION_SERVICE_PORT || 5100);
  const backendPort = Number(env.PORT || 5000);
  const { vars } = generateKeyset({
    now,
    kid: `demo-${now.getTime().toString(36)}`,
    serviceUrl: `http://127.0.0.1:${servicePort}`,
    backendUrl: `http://127.0.0.1:${backendPort}`,
    eventSecret,
    webhookSecret
  });
  return { exports: [...Object.entries(vars.backend), ...Object.entries(vars.service)] };
};

const main = () => {
  try {
    const { exports } = buildBootEnv();
    process.stdout.write(`${exports.map(([name, value]) => `export ${name}=${shellQuote(value)}`).join('\n')}\n`);
  } catch (err) {
    process.stderr.write(`[competition-boot] ${err.message}\n`);
    process.exit(1);
  }
};

if (require.main === module) main();

module.exports = { buildBootEnv, shellQuote };
