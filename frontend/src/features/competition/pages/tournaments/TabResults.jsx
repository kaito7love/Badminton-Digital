import React from 'react';
import { Card, EmptyState } from '../../components/ui';

// Tab Kết quả chung cuộc (sau khi chốt): thứ hạng + số trận thắng.
export default function TabResults({ model }) {
  const items = model.placements ? model.placements.items : [];
  if (!items.length) return <EmptyState>Chưa có kết quả chung cuộc.</EmptyState>;
  return (
    <Card title="Thứ hạng chung cuộc">
      <table className="w-full text-left text-sm">
        <tbody>
          {items.map((p) => (
            <tr key={`${p.from}-${p.teamId}`} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-2 pr-3 font-bold text-slate-900 dark:text-white">{p.label}</td>
              <td className="py-2 pr-3">{p.players.map((x) => x.name).join(' + ')}</td>
              <td className="py-2 text-slate-500 dark:text-slate-400">{p.wins} trận thắng</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
