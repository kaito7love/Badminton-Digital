import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/apiServices';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword({ token, newPassword });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không đặt lại được mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden font-sans selection:bg-emerald-500 selection:text-slate-950">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/15 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-2xl relative z-10">
        <div className="text-center space-y-3">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="transparent" />
                  <path d="M50 18 L68 45 L50 38 L32 45 Z" fill="#CCFF00" />
                  <path d="M50 38 L50 82" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </Link>

          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Đặt Lại <span className="text-emerald-400">Mật Khẩu</span></h1>
            <p className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mt-1">Tạo Mật Khẩu Mới</p>
          </div>
        </div>

        {!token ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-center space-y-2">
              <p className="text-3xl">⚠️</p>
              <p className="text-sm font-semibold text-rose-300">Link không hợp lệ — thiếu mã đặt lại mật khẩu.</p>
              <p className="text-xs text-slate-400">Hãy mở đúng link trong email hoặc yêu cầu gửi lại.</p>
            </div>
            <Link
              to="/forgot-password"
              className="block w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-4 text-center text-sm font-black uppercase tracking-wider text-slate-950 transition hover:brightness-110"
            >
              Yêu cầu link mới
            </Link>
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center space-y-2">
            <p className="text-3xl">✅</p>
            <p className="text-sm font-semibold text-emerald-300">Đặt lại mật khẩu thành công!</p>
            <p className="text-xs text-slate-400">Đang chuyển về trang đăng nhập...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-xs font-extrabold uppercase tracking-widest text-slate-300">Mật khẩu mới</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3.5 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-extrabold uppercase tracking-widest text-slate-300">Xác nhận mật khẩu</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3.5 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
                required
              />
            </div>

            {error && <p className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-4 text-sm font-black uppercase tracking-wider text-slate-950 transition hover:brightness-110 shadow-lg shadow-emerald-500/25 disabled:opacity-70 cursor-pointer"
            >
              {loading ? 'Đang xử lý...' : 'Đặt Lại Mật Khẩu ⚡'}
            </button>
          </form>
        )}

        <div className="text-center pt-2">
          <Link to="/login" className="text-xs font-semibold text-slate-400 hover:text-emerald-400 transition-colors">
            ← Quay lại trang đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
