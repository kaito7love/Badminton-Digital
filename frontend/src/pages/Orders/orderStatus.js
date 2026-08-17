// Trạng thái đơn nhìn từ phía khách. Bảng sales_orders chỉ có 3 trạng thái
// thật (open / paid / cancelled) — không bịa thêm bước "đang giao" cho một
// luồng nhận hàng tại quầy vốn không có khâu vận chuyển nào.

export const ORDER_STATUS = {
  open: {
    label: 'Chờ nhận hàng',
    hint: 'Hàng đã được giữ tại quầy, mời bạn tới lấy và thanh toán.',
    cls: 'border-amber-500/30 bg-amber-500/15 text-amber-300'
  },
  paid: {
    label: 'Hoàn thành',
    hint: 'Bạn đã nhận hàng và thanh toán xong.',
    cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
  },
  cancelled: {
    label: 'Đã huỷ',
    hint: 'Đơn đã huỷ, hàng đã được trả lại kệ.',
    cls: 'border-rose-500/30 bg-rose-500/15 text-rose-300'
  },
  draft: {
    label: 'Nháp',
    hint: 'Đơn chưa được gửi đi.',
    cls: 'border-slate-600 bg-slate-800/60 text-slate-300'
  }
};

export const statusOf = (status) =>
  ORDER_STATUS[status] || { label: status, hint: '', cls: 'border-slate-600 bg-slate-800/60 text-slate-300' };

export const ORDER_TABS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'open', label: 'Chờ nhận hàng' },
  { value: 'paid', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã huỷ' }
];

export const orderTotal = (order) =>
  (order?.lines || []).reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);

export const orderQuantity = (order) =>
  (order?.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
