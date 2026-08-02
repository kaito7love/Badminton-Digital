/**
 * VietQR Link Generator Helper
 */

const generateVietQRUrl = ({ bankId = 'MB', accountNo = '0987654321', accountName = 'BADMINTON DIGITAL', amount = 0, addInfo = '' }) => {
  const encodedInfo = encodeURIComponent(addInfo);
  const encodedName = encodeURIComponent(accountName);
  const cleanAmount = Math.max(0, Math.round(Number(amount) || 0));

  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${cleanAmount}&addInfo=${encodedInfo}&accountName=${encodedName}`;
};

module.exports = {
  generateVietQRUrl
};
