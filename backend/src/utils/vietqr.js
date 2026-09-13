/**
 * VietQR Link Generator Helper
 *
 * Tài khoản nhận tiền chỉ lấy từ cấu hình (`utils/paymentConfig`), không còn giá
 * trị mặc định nào trong code: trước đây thiếu cấu hình là QR trỏ thẳng vào tài
 * khoản demo MB-0987654321, tiền khách chuyển cho người lạ. Chuyển khoản chưa bật
 * thì trả null — không có QR còn hơn QR trỏ sai tài khoản.
 */
const { getTransferAccount, isTransferEnabled } = require('./paymentConfig');

const generateVietQRUrl = ({ amount = 0, addInfo = '' } = {}) => {
  if (!isTransferEnabled()) return null;
  const { bankId, accountNo, accountName } = getTransferAccount();
  const cleanAmount = Math.max(0, Math.round(Number(amount) || 0));

  return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?amount=${cleanAmount}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(accountName)}`;
};

module.exports = {
  generateVietQRUrl
};
