const { randomUUID } = require('crypto');

// Dùng lại X-Request-Id do gateway của app chính gửi sang → log hai service
// tra chéo được bằng cùng một id.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

module.exports = (config) => (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.requestId);
  res.set('X-Service-Version', config.version);
  next();
};
