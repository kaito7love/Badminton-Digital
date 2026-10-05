import React, { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartRows } from '../lib/customer';
import { fmtDate, fmtNumber } from '../lib/format';

// Biểu đồ điểm theo thời gian (Đơn xanh lá, Đôi xanh dương) từ sổ điểm. Tải riêng (recharts) — chỉ trang "Trình độ của tôi" kéo về.

function Tip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white shadow-xl">
      <b>{fmtDate(row.at)}</b> · {row.reason}
      {['singles', 'doubles'].filter((d) => row[d] !== undefined).map((d) => <div key={d}>{d === 'singles' ? 'Đơn' : 'Đôi'}: <b>{fmtNumber(row[d])}</b></div>)}
    </div>
  );
}

export default function RatingChart({ history }) {
  const rows = useMemo(() => chartRows(history), [history]);
  if (rows.length < 2) return <p className="text-sm text-slate-400">Biểu đồ hiện khi điểm của bạn đã đổi ít nhất một lần.</p>;
  return (
    <div className="h-64 w-full" data-testid="rating-chart">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="4 4" />
          <XAxis dataKey="at" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmtDate(v)} stroke="#94a3b8" fontSize={11} />
          <YAxis domain={['dataMin - 0.25', 'dataMax + 0.25']} tickFormatter={(v) => Number(v).toFixed(1)} stroke="#94a3b8" fontSize={11} width={44} />
          <Tooltip content={<Tip />} />
          <Line type="monotone" dataKey="singles" name="Đơn" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="doubles" name="Đôi" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-slate-400"><span className="text-emerald-400">●</span> Đơn <span className="ml-3 text-sky-400">●</span> Đôi</p>
    </div>
  );
}
