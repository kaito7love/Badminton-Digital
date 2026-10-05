import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useCompetition } from '../context/CompetitionContext';
import { permissionsFor } from '../lib/permissions';
import { Card, EmptyState, Notice, PageHeader } from '../components/ui';

// Trang chủ khu vực Thi đấu của nhân viên: trạng thái dịch vụ + lối vào từng phần. Mỗi slice của plan 25 bật thêm một thẻ (`ready`).

const AREAS = [
  { key: 'tournaments', to: '/competition/tournaments', icon: '🏆', title: 'Giải đấu', text: 'Tạo giải, đăng ký, bốc thăm, vận hành ngày thi đấu, sơ đồ, chốt giải.', ready: true },
  { key: 'sessions', to: '/competition/sessions', icon: '🏸', title: 'Giao lưu', text: 'Buổi giao lưu: điểm danh, xếp sân trống, bấm điểm, đóng buổi.', ready: false },
  { key: 'players', to: '/competition/players', icon: '👥', title: 'Người chơi', text: 'Điểm trình, chấm trình, sổ điểm, hồ sơ thi đấu.', ready: false },
  { key: 'reviews', to: '/competition/reviews', icon: '📋', title: 'Hàng chờ duyệt', text: 'Bài chấm trình cần quản lý xác nhận.', ready: false, managerOnly: true }
];

export default function CompetitionHome() {
  const { user } = useAuth();
  const { enabled, available, loading } = useCompetition();
  const perms = permissionsFor(user);
  const areas = AREAS.filter((a) => !a.managerOnly || perms.isManager);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader title="Thi đấu" subtitle="Giải đấu, giao lưu, điểm trình và xếp hạng của chuỗi sân." />

      {!loading && !enabled && (
        <Notice kind="warn">
          Tính năng thi đấu chưa được bật trên hệ thống này (chưa cấu hình dịch vụ thi đấu). Liên hệ quản trị viên — các phần khác của app không bị ảnh hưởng.
        </Notice>
      )}
      {!loading && enabled && !available && (
        <Notice kind="warn">Dịch vụ thi đấu đang tạm ngưng sau nhiều lỗi liên tiếp; hệ thống tự thử lại sau ít phút.</Notice>
      )}

      {enabled && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {areas.map((area) => {
            const body = (
              <Card className={area.ready ? 'h-full transition hover:border-emerald-500/50' : 'h-full opacity-60'}>
                <div className="flex items-start gap-3">
                  <span className="text-3xl" aria-hidden="true">{area.icon}</span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {area.title}
                      {!area.ready && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">Sắp có</span>}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{area.text}</p>
                  </div>
                </div>
              </Card>
            );
            return area.ready ? <Link key={area.key} to={area.to}>{body}</Link> : <div key={area.key}>{body}</div>;
          })}
        </div>
      )}

      {!loading && !enabled && <div className="mt-5"><EmptyState title="Chưa có gì để hiển thị">Bật dịch vụ thi đấu rồi quay lại trang này.</EmptyState></div>}
    </div>
  );
}
