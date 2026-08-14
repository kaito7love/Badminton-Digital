import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// Đăng ký bằng số điện thoại. Email để tuỳ chọn — phần lớn khách đặt sân chỉ
// có số, nhưng ai điền email thì sau này lấy lại mật khẩu được qua thư.
export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const change = (e) => setForm((cur) => ({ ...cur, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError('Hai lần nhập mật khẩu không khớp.');
      return;
    }

    setLoading(true);
    try {
      const { mergedHistory } = await register({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password
      });
      // Khách từng ra chơi tại quầy thì hồ sơ cũ được gắn vào tài khoản này,
      // nên đưa thẳng sang trang lịch để họ thấy lịch sử của mình.
      navigate('/my-bookings', { replace: true, state: { mergedHistory } });
    } catch (err) {
      const detail = err.response?.data?.errors?.[0]?.msg || err.response?.data?.errors?.[0]?.message;
      setError(detail || err.response?.data?.message || err.message || 'Đăng ký không thành công');
    } finally {
      setLoading(false);
    }
  };

  const field = 'w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3.5 text-sm text-slate-100 outline-none transition focus:border-emerald-400';
  const label = 'block text-xs font-extrabold uppercase tracking-widest text-slate-300';

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden font-sans">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md space-y-7">
        <div className="text-center space-y-3">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-xl">🏸</div>
            </div>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Tạo tài khoản <span className="text-emerald-400">đặt sân</span>
            </h1>
            <p className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mt-1">
              Chỉ cần số điện thoại
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className={label} htmlFor="reg-name">Họ và tên</label>
            <input id="reg-name" name="fullName" type="text" required autoFocus
              value={form.fullName} onChange={change} className={field} placeholder="Nguyễn Văn A" />
          </div>

          <div className="space-y-2">
            <label className={label} htmlFor="reg-phone">Số điện thoại</label>
            <input id="reg-phone" name="phone" type="tel" required autoComplete="tel"
              value={form.phone} onChange={change} className={field} placeholder="0903 333 333" />
            <p className="text-[11px] text-slate-500">Đây cũng là tên đăng nhập của bạn.</p>
          </div>

          <div className="space-y-2">
            <label className={label} htmlFor="reg-email">Email <span className="text-slate-500 normal-case font-semibold">(không bắt buộc)</span></label>
            <input id="reg-email" name="email" type="email" autoComplete="email"
              value={form.email} onChange={change} className={field} placeholder="de-lay-lai-mat-khau@email.com" />
          </div>

          <div className="space-y-2">
            <label className={label} htmlFor="reg-pass">Mật khẩu</label>
            <input id="reg-pass" name="password" type="password" required minLength={6} autoComplete="new-password"
              value={form.password} onChange={change} className={field} placeholder="Tối thiểu 6 ký tự" />
          </div>

          <div className="space-y-2">
            <label className={label} htmlFor="reg-confirm">Nhập lại mật khẩu</label>
            <input id="reg-confirm" name="confirm" type="password" required autoComplete="new-password"
              value={form.confirm} onChange={change} className={field} />
          </div>

          {error && (
            <p className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-4 text-sm font-black uppercase tracking-wider text-slate-950 transition hover:brightness-110 shadow-lg shadow-emerald-500/25 disabled:opacity-70">
            {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản ⚡'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-bold text-emerald-400 hover:underline">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
