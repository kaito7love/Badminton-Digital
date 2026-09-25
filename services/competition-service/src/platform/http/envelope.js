// Envelope giống app chính ({ success, data, message, errors }) để gateway chuyển
// thẳng. Thêm `code` khi lỗi.

const ok = (res, data, { status = 200, message = null, etag = null } = {}) => {
  if (etag !== null && etag !== undefined) res.set('ETag', `"${etag}"`);
  return res.status(status).json({ success: true, data, message, errors: null });
};

const fail = (res, status, code, message, errors = null) =>
  res.status(status).json({ success: false, data: null, message, code, errors });

const paged = (items, total, page, limit) => ({
  items,
  total,
  page,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

module.exports = { ok, fail, paged };
