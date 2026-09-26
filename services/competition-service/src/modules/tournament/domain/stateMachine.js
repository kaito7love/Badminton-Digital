const { DomainError } = require('../../../shared/domainError');

// Vòng đời giải (docs/06 mục 4.1):
//   draft → open → drawn → in_progress (stage group → knockout) → finalized
//   drawn → open (reopen, chưa có kết quả) · finalized → in_progress (unfinalize)
//   mọi trạng thái trừ finalized → cancelled

const ALLOWED = Object.freeze({
  update: ['draft', 'open'],
  open: ['draft'],
  register: ['open'],
  withdraw: ['open', 'drawn', 'in_progress'],
  draw: ['open', 'drawn'],
  reopen: ['drawn'],
  record: ['drawn', 'in_progress'],
  addMatch: ['drawn', 'in_progress'],
  knockout: ['in_progress'],
  finalize: ['in_progress'],
  unfinalize: ['finalized'],
  cancel: ['draft', 'open', 'drawn', 'in_progress']
});

const LABELS = {
  draft: 'nháp',
  open: 'đang mở đăng ký',
  drawn: 'đã bốc thăm',
  in_progress: 'đang thi đấu',
  finalized: 'đã chốt',
  cancelled: 'đã huỷ'
};

const canDo = (status, action) => (ALLOWED[action] || []).includes(status);

const assertAction = (tournament, action) => {
  if (!canDo(tournament.status, action)) {
    throw new DomainError('INVALID_STATE', `Giải đang ${LABELS[tournament.status] || tournament.status} — không thể thực hiện thao tác này`, null, 409);
  }
};

module.exports = { ALLOWED, canDo, assertAction, LABELS };
