/**
 * Pagination Helper
 */

const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

const getPagingData = (data, page, limit) => {
  const { count: total, rows } = data;
  const totalPages = Math.ceil(total / limit);

  return {
    rows,
    meta: {
      page,
      limit,
      total,
      totalPages
    }
  };
};

module.exports = {
  getPagination,
  getPagingData
};
