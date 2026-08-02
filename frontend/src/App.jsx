import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import apiClient from './services/apiClient';

function StatusDashboard() {
  const { user, login, logout, loading } = useAuth();
  const [beStatus, setBeStatus] = useState('Checking...');
  const [beError, setBeError] = useState(null);
  const [email, setEmail] = useState('admin@badminton.com');
  const [password, setPassword] = useState('Admin@123');
  const [loginMsg, setLoginMsg] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const checkBackendHealth = async () => {
    setBeStatus('Connecting...');
    setBeError(null);
    try {
      const res = await apiClient.get('/health');
      if (res.data?.status === 'ok') {
        setBeStatus('ONLINE ✅');
      } else {
        setBeStatus('UNKNOWN ⚠️');
      }
    } catch (err) {
      setBeStatus('OFFLINE / UNCONNECTED ❌');
      setBeError(err.message || 'Không thể kết nối đến Backend tại http://localhost:5000');
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMsg(null);
    try {
      await login(email, password);
      setLoginMsg('✅ Đăng nhập thành công!');
    } catch (err) {
      setLoginMsg(`❌ Lỗi: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xl">
              🏸
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Badminton Digital Management</h1>
              <p className="text-xs text-slate-400">System Connection Verification & Diagnostics</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Phase 3 Active
          </span>
        </div>

        {/* Connection Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Frontend Status */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Frontend (React + Vite)</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-emerald-400">Running on Port 5173</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
          </div>

          {/* Backend Status */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Backend API (Express)</span>
              <button 
                onClick={checkBackendHealth} 
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Re-check
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-sm font-bold ${beStatus.includes('ONLINE') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {beStatus}
              </span>
              <span className={`w-2.5 h-2.5 rounded-full ${beStatus.includes('ONLINE') ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
            </div>
            {beError && <p className="text-xs text-rose-400 mt-2 font-mono">{beError}</p>}
          </div>

        </div>

        {/* API Authentication Diagnostics */}
        <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-700">
          <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center space-x-2">
            <span>🔑 API Auth Test (Backend DB Connection & JWT verification)</span>
          </h2>

          {loading ? (
            <p className="text-sm text-slate-400">Đang tải thông tin người dùng...</p>
          ) : user ? (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-xs text-emerald-400 font-semibold">Tài khoản đã đăng nhập thành công!</p>
                <div className="mt-2 text-sm text-slate-300 space-y-1 font-mono text-xs">
                  <p><span className="text-slate-500">ID:</span> {user.id}</p>
                  <p><span className="text-slate-500">Email:</span> {user.email}</p>
                  <p><span className="text-slate-500">Họ tên:</span> {user.fullName}</p>
                  <p><span className="text-slate-500">Vai trò (Role):</span> <span className="text-amber-400 font-bold uppercase">{user.role?.name || user.role}</span></p>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition"
              >
                Đăng xuất (Logout)
              </button>
            </div>
          ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Email mẫu:</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Mật khẩu mẫu:</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              {loginMsg && <p className="text-xs font-mono">{loginMsg}</p>}
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition shadow-lg shadow-emerald-900/30"
              >
                {loginLoading ? 'Đang xác thực với Backend...' : 'Thử đăng nhập (Test Login API)'}
              </button>
            </form>
          )}
        </div>

        {/* Database instructions */}
        <div className="text-xs text-slate-400 border-t border-slate-700/60 pt-4 space-y-1">
          <p className="font-semibold text-slate-300">💡 Hướng dẫn kiểm tra nhanh:</p>
          <p>1. Đảm bảo MySQL local đang bật và đã tạo database <code className="text-emerald-400 font-mono">badminton_digital_management</code> (hoặc chạy <code className="text-emerald-400 font-mono">npm run migrate && npm run seed</code> ở folder <code className="text-indigo-400">backend</code>).</p>
          <p>2. Chạy <code className="text-indigo-400 font-mono">npm run dev</code> ở cả folder <code className="text-indigo-400">backend</code> và <code className="text-indigo-400">frontend</code>.</p>
        </div>

      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <StatusDashboard />
    </AuthProvider>
  );
}

export default App;
