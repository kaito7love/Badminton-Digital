import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/apiServices';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sentMessage, setSentMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await authService.forgotPassword({ email });
      setSentMessage(res.data?.message || 'Nếu email tồn tại, link đặt lại mật khẩu đã được gửi.');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không gửi được email đặt lại mật khẩu');
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
            <h1 className="text-2xl font-black text-white tracking-tight">Quên <span className="text-emerald-400">Mật Khẩu</span></h1>
            <p className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mt-1">Khôi Phục Truy Cập Tài Khoản</p>
          </div>
        </div>

        {sentMessage ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center space-y-2">
              <p className="text-3xl">📬</p>
              <p className="text-sm font-semibold text-emerald-300">{sentMessage}</p>
              <p className="text-xs text-slate-400">Link có hiệu lực trong 15 phút. Nhớ kiểm tra cả hộp thư rác.</p>
            </div>
            <Link
              to="/login"
              className="block w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-4 text-center text-sm font-black uppercase tracking-wider text-slate-950 transition hover:brightness-110"
            >
              Quay lại đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm text-slate-400">
              Nhập email tài khoản của bạn. Hệ thống sẽ gửi link đặt lại mật khẩu tới hộp thư đó.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-extrabold uppercase tracking-widest text-slate-300">Email tài khoản</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@badminton.com"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3.5 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
                required
                autoFocus
              />
            </div>

            {error && <p className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-4 text-sm font-black uppercase tracking-wider text-slate-950 transition hover:brightness-110 shadow-lg shadow-emerald-500/25 disabled:opacity-70 cursor-pointer"
            >
              {loading ? 'Đang gửi...' : 'Gửi link đặt lại ⚡'}
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
