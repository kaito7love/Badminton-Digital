/**
 * Ngưỡng hạng hội viên theo tổng chi tiêu toàn chuỗi (Customer.totalSpent).
 * Dùng chung cho mọi nơi cộng/trừ totalSpent (checkout tiền mặt, webhook
 * chuyển khoản, void hoá đơn) — trước đây 3 nơi tự lặp lại cùng 2 ngưỡng,
 * tách ra đây để sửa 1 chỗ khi ngưỡng đổi.
 */
const computeLoyaltyTier = (totalSpent) => {
  if (totalSpent >= 15000000) return 'vip';
  if (totalSpent >= 5000000) return 'gold';
  return 'normal';
};

module.exports = { computeLoyaltyTier };
