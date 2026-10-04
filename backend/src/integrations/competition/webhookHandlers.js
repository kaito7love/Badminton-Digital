// Sự kiện competition-service → app chính (plan 23, câu 3): chốt / huỷ chốt / huỷ giải và đóng buổi giao lưu thành
// một dòng ActivityLog ở chi nhánh tổ chức. Các loại còn lại (match.completed, player.rating_changed, tournament.drawn,
// assessment.submitted) nhận 2xx và bỏ qua có chủ ý — lịch / TV của giải đã tự cập nhật qua luồng SSE của service.

const BRANCH_REF = /^bd:branch:(\d+)$/;

const branchIdOf = (organizerRef) => {
  const match = BRANCH_REF.exec(String(organizerRef || ''));
  return match ? Number(match[1]) : null;
};

const count = (value) => (Array.isArray(value) ? value.length : 0);

const HANDLERS = {
  'competition.tournament.finalized': (data) => ({
    action: 'competition.tournament_finalized',
    newValues: { tournamentId: data.tournamentId, placements: count(data.placements), ratingChanges: count(data.ratingChanges), rankingPoints: count(data.rankingPoints) }
  }),
  'competition.tournament.unfinalized': (data) => ({
    action: 'competition.tournament_unfinalized',
    newValues: { tournamentId: data.tournamentId, reason: data.reason }
  }),
  'competition.tournament.cancelled': (data) => ({
    action: 'competition.tournament_cancelled',
    newValues: { tournamentId: data.tournamentId, reason: data.reason }
  }),
  'competition.session.closed': (data) => ({
    action: 'competition.session_closed',
    newValues: { sessionId: data.sessionId, rated: data.rated, matches: data.matches, ratingChanges: count(data.ratingChanges) }
  })
};

/** `ActivityLog` cho sự kiện có handler; `null` nếu bỏ qua. `record` = AuditService.record (tiêm vào để test). */
const handleEvent = async (event, { transaction, record }) => {
  const handler = HANDLERS[event.type];
  if (!handler) return null;
  const data = event.data || {};
  const { action, newValues } = handler(data);
  return record({
    actor: null,
    branchId: branchIdOf(data.organizerRef),
    action,
    targetType: 'competition',
    targetId: null,
    newValues: { ...newValues, organizerRef: data.organizerRef || null, eventId: event.id },
    requestId: event.id,
    transaction
  });
};

module.exports = { handleEvent, branchIdOf, HANDLED_TYPES: Object.keys(HANDLERS) };
