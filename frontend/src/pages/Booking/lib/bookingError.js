// Đổi lỗi của `POST /bookings` thành điều trang cần làm tiếp (kế hoạch 29).
//
// Server trả thông điệp tiếng Việt cho các luật nghiệp vụ (đã qua, ngoài giờ,
// trùng lịch, quá 14 ngày…), nên trang hiện nguyên văn. Hai chỗ phải tự dịch:
// lỗi mạng (không có phản hồi) và lỗi validator ("Validation failed", tiếng Anh).

/**
 * @returns {{ kind: 'network'|'conflict'|'rejected'|'auth'|'other', message: string, refreshGrid: boolean }}
 *   `refreshGrid`: trang phải tải lại lưới (khung đã đổi dưới chân khách).
 */
export function classifyBookingError(error) {
  const response = error?.response;
  if (!response) {
    return {
      kind: 'network',
      message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại, lựa chọn của bạn vẫn được giữ.',
      refreshGrid: false
    };
  }

  const status = response.status;
  const serverMessage = response.data?.message;
  const vietnamese = serverMessage && serverMessage !== 'Validation failed' ? serverMessage : null;

  if (status === 409) {
    return {
      kind: 'conflict',
      message: vietnamese || 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác',
      refreshGrid: true
    };
  }
  if (status === 400) {
    return {
      kind: 'rejected',
      message: vietnamese || 'Khung giờ này chưa hợp lệ. Mời bạn chọn lại khung giờ.',
      refreshGrid: true
    };
  }
  if (status === 401) {
    return { kind: 'auth', message: 'Phiên đăng nhập đã hết hạn. Mời bạn đăng nhập lại.', refreshGrid: false };
  }
  return {
    kind: 'other',
    message: vietnamese || 'Đặt sân không thành công. Vui lòng thử lại.',
    refreshGrid: false
  };
}
