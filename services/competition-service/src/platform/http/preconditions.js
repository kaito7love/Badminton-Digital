const { AppError, conflict } = require('./errors');

// Optimistic lock qua header If-Match: "<version>" (docs/02 mục 1.3).
//  - required = true: thiếu → 412 PRECONDITION_REQUIRED
//  - có gửi mà lệch version → 409 VERSION_CONFLICT
const assertVersion = (ifMatch, version, { required = true, what = 'Dữ liệu' } = {}) => {
  if (ifMatch === undefined || ifMatch === null || ifMatch === '') {
    if (required) throw new AppError(412, 'PRECONDITION_REQUIRED', 'Thiếu header If-Match (version hiện tại)');
    return;
  }
  if (Number(String(ifMatch).replace(/"/g, '')) !== Number(version)) {
    throw conflict('VERSION_CONFLICT', `${what} vừa được người khác cập nhật — tải lại rồi thử lại`);
  }
};

module.exports = { assertVersion };
