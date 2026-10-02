// Danh sách sân của một buổi giao lưu / một giải (mã sân do app chính cấp, vd `bd:court:12`).
// Trả về danh sách lỗi; ngữ cảnh tự gói vào mã lỗi của mình.

const MAX_COURTS = 32;

const courtErrors = (courtRefs) => {
  const list = Array.isArray(courtRefs) ? courtRefs : [];
  const errors = [];
  if (!list.length || list.length > MAX_COURTS) errors.push({ field: 'courtRefs', message: `Chọn từ 1 đến ${MAX_COURTS} sân` });
  if (list.some((c) => typeof c !== 'string' || !c.trim() || c.length > 64)) errors.push({ field: 'courtRefs', message: 'Mã sân không được trống, tối đa 64 ký tự' });
  if (new Set(list).size !== list.length) errors.push({ field: 'courtRefs', message: 'Mã sân bị trùng' });
  return errors;
};

module.exports = { MAX_COURTS, courtErrors };
