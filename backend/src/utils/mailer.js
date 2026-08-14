const nodemailer = require('nodemailer');

let cachedTransporter = null;

const isMailConfigured = () =>
  Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASSWORD);

const getTransporter = () => {
  if (!isMailConfigured()) {
    const error = new Error(
      'Chưa cấu hình SMTP. Vui lòng khai báo MAIL_HOST, MAIL_USER, MAIL_PASSWORD trong backend/.env.'
    );
    error.statusCode = 500;
    throw error;
  }

  if (!cachedTransporter) {
    const port = Number(process.env.MAIL_PORT) || 587;
    cachedTransporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
      }
    });
  }

  return cachedTransporter;
};

const buildResetEmail = ({ fullName, resetUrl }) => {
  const greeting = fullName ? `Xin chào ${fullName},` : 'Xin chào,';

  const text = [
    greeting,
    '',
    'Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản Badminton Digital.',
    'Mở link dưới đây để đặt mật khẩu mới (link có hiệu lực trong 15 phút):',
    resetUrl,
    '',
    'Nếu bạn không yêu cầu điều này, hãy bỏ qua email.',
    'Badminton Digital Management'
  ].join('\n');

  const html = `
  <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#0f172a;padding:32px;color:#e2e8f0">
    <div style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#f8fafc">Badminton <span style="color:#10b981">Digital</span></h1>
      <p style="margin:0 0 24px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#94a3b8">Đặt lại mật khẩu</p>
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 24px">Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản Badminton Digital. Nhấn nút bên dưới để đặt mật khẩu mới.</p>
      <p style="margin:0 0 24px">
        <a href="${resetUrl}" style="display:inline-block;background:#10b981;color:#020617;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px">Đặt lại mật khẩu</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#94a3b8">Link có hiệu lực trong <strong>15 phút</strong> và chỉ dùng được một lần.</p>
      <p style="margin:0 0 24px;font-size:13px;color:#94a3b8">Nếu nút không hoạt động, sao chép link sau vào trình duyệt:<br>
        <span style="color:#38bdf8;word-break:break-all">${resetUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid #334155;margin:24px 0">
      <p style="margin:0;font-size:12px;color:#64748b">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại của bạn vẫn an toàn.</p>
    </div>
  </div>`;

  return { text, html };
};

const sendPasswordResetEmail = async ({ to, fullName, resetUrl }) => {
  const transporter = getTransporter();
  const { text, html } = buildResetEmail({ fullName, resetUrl });

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || `Badminton Digital <${process.env.MAIL_USER}>`,
    to,
    subject: 'Đặt lại mật khẩu — Badminton Digital',
    text,
    html
  });

  // Ethereal/test SMTP trả về link xem trước, tiện cho môi trường dev
  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`[Mailer] Đã gửi email đặt lại mật khẩu tới ${to} (id: ${info.messageId})${previewUrl ? ` | preview: ${previewUrl}` : ''}`);

  return info;
};

module.exports = {
  isMailConfigured,
  sendPasswordResetEmail
};
