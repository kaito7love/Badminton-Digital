import React from 'react';

// Error boundary bắt buộc phải là class component — React chưa hỗ trợ hook
// tương đương cho getDerivedStateFromError/componentDidCatch.
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 p-6">
          <div className="max-w-sm text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl">
            <p className="text-lg font-bold mb-2">Đã có lỗi xảy ra</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Trang gặp sự cố hiển thị. Thử tải lại trang — nếu vẫn còn lỗi, báo lại cho quản trị viên.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
