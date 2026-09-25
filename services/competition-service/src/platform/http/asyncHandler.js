// Express 4 không tự bắt lỗi của handler async.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
