// Nhật ký thao tác của service (sửa tỉ số, chỉnh điểm, đổi tay bốc thăm…). Ghi
// trong cùng transaction với thay đổi nghiệp vụ.
const createAudit = ({ AuditLog }) => ({
  record: (transaction, { tenant, actorRef, action, targetType, targetId, before = null, after = null, requestId = null }) =>
    AuditLog.create(
      { tenantId: tenant, actorRef, action, targetType, targetId: String(targetId), before, after, requestId },
      { transaction }
    )
});

module.exports = { createAudit };
