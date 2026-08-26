import React from 'react';

// Lỗi tải chunk (deploy mới đổi hash file, mất mạng giữa chừng, cache cũ...)
// cần thông báo khác hẳn lỗi render thông thường — "tải lại trang" thực sự
// giải quyết được lỗi này (lấy đúng bundle mới), nên đáng nói rõ cho người
// dùng thay vì thông báo lỗi chung chung. Cả Vite lẫn Webpack đều báo lỗi
// dynamic import thất bại qua message dạng này, không có `error.name` chuẩn
// hoá giữa 2 bundler nên phải nhận diện qua nội dung message.
const isChunkLoadError = (error) => {
  const message = String(error?.message || '');
  return (
    error?.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk .* failed/i.test(
      message,
    )
  );
};

// Error boundary bắt buộc phải là class component — React chưa hỗ trợ hook
// tương đương cho getDerivedStateFromError/componentDidCatch.
//
// `fullScreen` (mặc định true) quyết định hiển thị: true = che kín màn hình
// (dùng ở gốc app trong App.jsx), false = gọn trong 1 khối, dùng để bọc
// riêng từng vùng nội dung (vd quanh <Outlet/> của khu vực admin) mà không
// đẩy layout tràn quá chiều cao viewport.
class ErrorBoundary extends React.Component {
  state = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.state.isChunkError ? 'Có bản cập nhật mới' : 'Đã có lỗi xảy ra';
    const message = this.state.isChunkError
      ? 'Trang vừa được cập nhật phiên bản mới nên không tải được phần này. Tải lại trang để lấy bản mới nhất.'
      : 'Trang gặp sự cố hiển thị. Thử tải lại trang — nếu vẫn còn lỗi, báo lại cho quản trị viên.';

    const card = (
      <div className="max-w-sm text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl">
        <p className="text-lg font-bold mb-2">{title}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Tải lại trang
        </button>
      </div>
    );

    if (this.props.fullScreen === false) {
      return <div className="flex items-center justify-center p-8">{card}</div>;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 p-6">
        {card}
      </div>
    );
  }
}

export default ErrorBoundary;
