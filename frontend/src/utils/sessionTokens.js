/**
 * Lưu cặp token mới mà server cấp giữa chừng phiên — hiện chỉ là `PUT /auth/change-password`:
 * đổi mật khẩu thu hồi refresh token cũ, nên thiết bị vừa đổi phải giữ cặp mới để không bị đăng xuất
 * khi access token hết hạn.
 *
 * Chỉ ghi khi CẢ HAI là chuỗi không rỗng; thiếu một trong hai thì bỏ qua và KHÔNG xoá token đang có
 * (response lạ không được phép làm mất phiên). Trả `true` nếu đã ghi.
 */
export function storeSessionTokens(data, storage = globalThis.localStorage) {
  const accessToken = data?.accessToken;
  const refreshToken = data?.refreshToken;
  const valid = (v) => typeof v === 'string' && v.length > 0;
  if (!valid(accessToken) || !valid(refreshToken) || !storage) return false;
  storage.setItem('access_token', accessToken);
  storage.setItem('refresh_token', refreshToken);
  return true;
}
