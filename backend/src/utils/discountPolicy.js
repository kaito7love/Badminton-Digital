// Giảm giá tay lúc thanh toán (sân và POS). Trước đây nhân viên nhập số nào
// cũng được, kể cả 100%: hoá đơn 0đ "đã thanh toán", tiền mặt thu ngoài sổ mà
// không để lại dấu vết nào. Giờ:
// - mọi mức giảm tay đều phải có lý do (ghi vào dòng hoá đơn và nhật ký);
// - `employee` bị chặn ở mức trần theo setting `discount_policy`;
// - `branch_manager`/`admin` không bị trần — họ là người được nhờ khi vượt trần.
//
// Hàm thuần, không đọc DB: nơi gọi tự nạp policy (SettingService) và vai trò
// (req.user), nên test được không cần DB.

const DEFAULT_DISCOUNT_POLICY = Object.freeze({ employeeMaxPercent: 10 });
const DISCOUNT_REASON_MAX_LENGTH = 200;
const UNCAPPED_ROLES = ['admin', 'branch_manager'];

const roleOf = (actor) => (typeof actor?.role === 'string' ? actor.role : actor?.role?.name) || null;

const badRequest = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const formatVnd = (amount) => `${Math.round(amount).toLocaleString('vi-VN')}đ`;

/** Setting lưu sai kiểu hoặc ngoài 0–100 thì dùng mặc định, không để trần thành NaN (= không chặn gì). */
const normalizeDiscountPolicy = (value) => {
  const percent = Number(value?.employeeMaxPercent);
  const valid = value?.employeeMaxPercent !== null && value?.employeeMaxPercent !== ''
    && Number.isFinite(percent) && percent >= 0 && percent <= 100;
  return { employeeMaxPercent: valid ? percent : DEFAULT_DISCOUNT_POLICY.employeeMaxPercent };
};

/**
 * Số tiền giảm tay tính ra đồng nguyên, không vượt `baseAmount`.
 * `isDiscountPercent` thì `discountAmount` là % (tối đa 100).
 */
const resolveManualDiscount = ({ baseAmount, discountAmount = 0, isDiscountPercent = false }) => {
  const base = Math.max(0, Number(baseAmount) || 0);
  const input = Math.max(0, Number(discountAmount) || 0);
  const raw = isDiscountPercent ? (base * Math.min(input, 100)) / 100 : input;
  return Math.round(Math.min(raw, base));
};

/**
 * Ném 400 nếu có giảm mà thiếu lý do, 403 nếu `employee` giảm vượt trần.
 * `discountAmount` là số tiền đã qua `resolveManualDiscount`.
 * Trả về `{ reason, percent }` để ghi dòng hoá đơn và nhật ký.
 */
const assertManualDiscountAllowed = ({ actor, baseAmount, discountAmount, reason, policy }) => {
  const amount = Number(discountAmount) || 0;
  if (amount <= 0) return { reason: null, percent: 0 };

  const trimmed = String(reason ?? '').trim();
  if (!trimmed) throw badRequest('Giảm giá tay phải kèm lý do');
  if (trimmed.length > DISCOUNT_REASON_MAX_LENGTH) {
    throw badRequest(`Lý do giảm giá tối đa ${DISCOUNT_REASON_MAX_LENGTH} ký tự`);
  }

  const base = Math.max(0, Number(baseAmount) || 0);
  const percent = base > 0 ? Math.round((amount / base) * 10000) / 100 : 100;

  if (!UNCAPPED_ROLES.includes(roleOf(actor))) {
    const { employeeMaxPercent } = normalizeDiscountPolicy(policy);
    // Làm tròn cùng kiểu với resolveManualDiscount: giảm đúng X% của một số lẻ
    // không được bị chặn vì chênh 1 đồng do làm tròn.
    const maxAmount = Math.round((base * employeeMaxPercent) / 100);
    if (amount > maxAmount) {
      throw badRequest(
        `Nhân viên chỉ được giảm tay tối đa ${employeeMaxPercent}% (${formatVnd(maxAmount)}) cho hoá đơn này. Nhờ quản lý chi nhánh thanh toán giúp.`,
        403
      );
    }
  }

  return { reason: trimmed, percent };
};

module.exports = {
  DEFAULT_DISCOUNT_POLICY,
  DISCOUNT_REASON_MAX_LENGTH,
  normalizeDiscountPolicy,
  resolveManualDiscount,
  assertManualDiscountAllowed
};
