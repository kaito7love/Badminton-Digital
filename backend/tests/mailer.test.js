// R13 (kế hoạch 36): lưới an toàn cho bản nâng nodemailer 9 → 10. Mail quên mật khẩu bị nuốt lỗi có chủ đích
// (xem AuthService.forgotPassword), nên hỏng ở đây sẽ KHÔNG hiện ra ở response — phải có test riêng.
// Dựng một SMTP giả ngay trong test (module `net`), không cần mạng ngoài.
const net = require('net');

const SAVED = {};
const ENV_KEYS = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASSWORD', 'MAIL_FROM'];
const CRLF = String.fromCharCode(13, 10);

const createFakeSmtp = () => {
  const received = { authUser: null, authPass: null, mailFrom: null, rcptTo: [], data: '' };
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8');
    let buffer = '';
    let mode = 'command'; // command | data | auth-plain | auth-user | auth-pass
    const reply = (line) => socket.write(line + CRLF);
    const splitPlain = (b64) => Buffer.from(b64, 'base64').toString('utf8').split(String.fromCharCode(0));
    reply('220 fake.smtp.local ESMTP');

    const handleLine = (line) => {
      if (mode === 'auth-plain') {
        const [, user, pass] = splitPlain(line);
        received.authUser = user; received.authPass = pass; mode = 'command';
        return reply('235 2.7.0 Authentication successful');
      }
      if (mode === 'auth-user') {
        received.authUser = Buffer.from(line, 'base64').toString('utf8'); mode = 'auth-pass';
        return reply('334 UGFzc3dvcmQ6');
      }
      if (mode === 'auth-pass') {
        received.authPass = Buffer.from(line, 'base64').toString('utf8'); mode = 'command';
        return reply('235 2.7.0 Authentication successful');
      }
      const upper = line.toUpperCase();
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        socket.write(['250-fake.smtp.local', '250-AUTH PLAIN LOGIN', '250 8BITMIME', ''].join(CRLF));
        return null;
      }
      if (upper.startsWith('AUTH PLAIN')) {
        const initial = line.slice('AUTH PLAIN'.length).trim();
        if (!initial) { mode = 'auth-plain'; return reply('334 '); }
        const [, user, pass] = splitPlain(initial);
        received.authUser = user; received.authPass = pass;
        return reply('235 2.7.0 Authentication successful');
      }
      if (upper.startsWith('AUTH LOGIN')) { mode = 'auth-user'; return reply('334 VXNlcm5hbWU6'); }
      if (upper.startsWith('MAIL FROM:')) { received.mailFrom = line.slice(10).trim(); return reply('250 OK'); }
      if (upper.startsWith('RCPT TO:')) { received.rcptTo.push(line.slice(8).trim()); return reply('250 OK'); }
      if (upper === 'DATA') { mode = 'data'; return reply('354 End data with <CR><LF>.<CR><LF>'); }
      if (upper === 'QUIT') { reply('221 Bye'); return socket.end(); }
      return reply('250 OK');
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      for (;;) {
        if (mode === 'data') {
          const terminator = CRLF + '.' + CRLF;
          const end = buffer.indexOf(terminator);
          if (end === -1) return;
          received.data = buffer.slice(0, end);
          buffer = buffer.slice(end + terminator.length);
          mode = 'command';
          reply('250 2.0.0 OK: queued as FAKE-1');
          continue;
        }
        const nl = buffer.indexOf(CRLF);
        if (nl === -1) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        handleLine(line);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      received,
      close: () => new Promise((done) => { sockets.forEach((s) => s.destroy()); server.close(done); })
    }));
  });
};

const decodeQuotedPrintable = (input) => {
  const unfolded = input.split('=' + CRLF).join('').split('=\n').join('');
  const bytes = [];
  for (let i = 0; i < unfolded.length; i += 1) {
    const hex = unfolded.slice(i + 1, i + 3);
    if (unfolded[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(unfolded[i], 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
};

// Giải RFC 2047 (=?UTF-8?B?...?= hoặc =?UTF-8?Q?...?=). Gấp dòng và khoảng trắng GIỮA hai encoded-word
// liền nhau không thuộc nội dung.
const decodeMime = (input) => {
  const lineBreak = new RegExp('(' + String.fromCharCode(13) + ')?' + String.fromCharCode(10) + '[ ' + String.fromCharCode(9) + ']+', 'g');
  const unfolded = input.replace(lineBreak, ' ').replace(/(\?=)\s+(?==\?)/g, '$1');
  const afterB = unfolded.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b64) => Buffer.from(b64, 'base64').toString('utf8'));
  return afterB.replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi, (_, q) => decodeQuotedPrintable(q.replace(/_/g, ' ')));
};

// Thân thư có thể là quoted-printable hoặc base64 tuỳ phiên bản; giải cả hai rồi tìm trong chuỗi gộp.
const decodeBody = (raw) => {
  const parts = raw.split(CRLF + CRLF);
  const asBase64 = parts.map((part) => {
    const compact = part.split(CRLF).join('').split('\n').join('');
    if (!/^[A-Za-z0-9+/=]{16,}$/.test(compact)) return '';
    return Buffer.from(compact, 'base64').toString('utf8');
  });
  return [decodeQuotedPrintable(raw), ...asBase64].join('\n');
};

const loadMailer = () => {
  let mailer;
  jest.isolateModules(() => { mailer = require('../src/utils/mailer'); });
  return mailer;
};

describe('mailer — gửi mail đặt lại mật khẩu qua SMTP', () => {
  let smtp;

  beforeEach(async () => {
    ENV_KEYS.forEach((k) => { SAVED[k] = process.env[k]; delete process.env[k]; });
    smtp = await createFakeSmtp();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await smtp.close();
    ENV_KEYS.forEach((k) => { if (SAVED[k] === undefined) delete process.env[k]; else process.env[k] = SAVED[k]; });
  });

  const configure = () => {
    process.env.MAIL_HOST = '127.0.0.1';
    process.env.MAIL_PORT = String(smtp.port);
    process.env.MAIL_USER = 'mailer-user';
    process.env.MAIL_PASSWORD = 'mailer-pass-123';
    process.env.MAIL_FROM = 'Badminton Digital <no-reply@badminton.test>';
  };

  test('isMailConfigured chỉ true khi đủ HOST, USER, PASSWORD', () => {
    expect(loadMailer().isMailConfigured()).toBe(false);
    process.env.MAIL_HOST = 'smtp.test';
    process.env.MAIL_USER = 'u';
    expect(loadMailer().isMailConfigured()).toBe(false);
    process.env.MAIL_PASSWORD = 'p';
    expect(loadMailer().isMailConfigured()).toBe(true);
  });

  test('chưa cấu hình SMTP → lỗi 500 nói rõ biến cần khai báo', async () => {
    const { sendPasswordResetEmail } = loadMailer();
    await expect(sendPasswordResetEmail({ to: 'a@example.test', fullName: 'A', resetUrl: 'http://x/reset?token=1' }))
      .rejects.toMatchObject({ statusCode: 500, message: expect.stringContaining('MAIL_HOST') });
  });

  test('gửi đúng người nhận, đăng nhập SMTP đúng, tiêu đề và link đặt lại có trong nội dung', async () => {
    configure();
    const { sendPasswordResetEmail } = loadMailer();
    const resetUrl = 'https://demo.example.test/reset-password?token=abc.DEF-123_xyz';

    const info = await sendPasswordResetEmail({ to: 'khach@example.test', fullName: 'Nguyễn Văn A', resetUrl });

    expect(info.messageId).toBeTruthy();
    expect(smtp.received.authUser).toBe('mailer-user');
    expect(smtp.received.authPass).toBe('mailer-pass-123');
    expect(smtp.received.mailFrom).toContain('no-reply@badminton.test');
    expect(smtp.received.rcptTo).toHaveLength(1);
    expect(smtp.received.rcptTo[0]).toContain('khach@example.test');

    const raw = smtp.received.data;
    expect(raw).toMatch(/^From: .*no-reply@badminton\.test/mi);
    expect(raw).toMatch(/^To: .*khach@example\.test/mi);

    const headerBlock = raw.split(CRLF + CRLF)[0];
    const subjectStart = headerBlock.indexOf('Subject:');
    expect(subjectStart).toBeGreaterThanOrEqual(0);
    const subject = decodeMime(headerBlock.slice(subjectStart + 'Subject:'.length).split(CRLF + 'X-').join('\n').split(/\r\n(?=[A-Za-z-]+: )/)[0]);
    expect(subject).toContain('Đặt lại mật khẩu');

    const everything = decodeBody(raw);
    expect(everything).toContain(resetUrl);
    expect(everything).toContain('Nguyễn Văn A');
    expect(everything).toMatch(/<a href="https:\/\/demo\.example\.test/);
  });

  test('transporter được tái sử dụng: hai lần gửi liên tiếp đều tới nơi', async () => {
    configure();
    const { sendPasswordResetEmail } = loadMailer();
    await sendPasswordResetEmail({ to: 'a@example.test', fullName: 'A', resetUrl: 'http://x/r?token=1' });
    await sendPasswordResetEmail({ to: 'b@example.test', fullName: 'B', resetUrl: 'http://x/r?token=2' });
    expect(smtp.received.rcptTo.join(' ')).toContain('a@example.test');
    expect(smtp.received.rcptTo.join(' ')).toContain('b@example.test');
  });

  test('SMTP không kết nối được → lỗi ném ra cho nơi gọi (AuthService mới là nơi nuốt lỗi)', async () => {
    configure();
    process.env.MAIL_PORT = '1'; // cổng đóng
    const { sendPasswordResetEmail } = loadMailer();
    await expect(sendPasswordResetEmail({ to: 'a@example.test', fullName: 'A', resetUrl: 'http://x/r?token=1' })).rejects.toBeTruthy();
  });
});
