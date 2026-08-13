import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@badminton.com');
  const [password, setPassword] = useState('Admin@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Đăng nhập không thành công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/15 rounded-full blur-[140px] pointer-events-none"></div>
      
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-2xl relative z-10">
        
        <div className="text-center space-y-3">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="transparent"/>
                  <path d="M50 18 L68 45 L50 38 L32 45 Z" fill="#CCFF00"/>
                  <path d="M50 38 L50 82" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          </Link>

          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Badminton <span className="text-emerald-400">Digital</span></h1>
            <p className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mt-1">Hệ Thống Quản Trị Sân Cầu Lông</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-extrabold uppercase tracking-widest text-slate-300">Email Quản Trị</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3.5 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold uppercase tracking-widest text-slate-300">Mật Khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading ? 'Đang Đăng Nhập...' : 'Đăng Nhập Quản Trị ⚡'}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 text-xs text-slate-400 space-y-1">
          <p className="font-bold text-slate-200 uppercase tracking-wider mb-1">Tài Khoản Thử Nghiệm System</p>
          <p>Email: <span className="text-emerald-400 font-mono">admin@badminton.com</span></p>
          <p>Mật khẩu: <span className="text-emerald-400 font-mono">Admin@123</span></p>
        </div>

        <div className="text-center pt-2">
          <Link to="/" className="text-xs font-semibold text-slate-400 hover:text-emerald-400 transition-colors">
            ← Quay lại trang chủ Đặt Sân
          </Link>
        </div>

      </div>
    </div>
  );
}
