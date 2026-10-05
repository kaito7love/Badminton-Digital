import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playersApi } from '../api/tournaments';
import { useCompetition } from '../context/CompetitionContext';
import { toCompetitionError } from '../lib/errors';

// Nút "Trình độ" ở trang Khách hàng của nhân viên (07 mục 1.1): mở hồ sơ thi đấu của khách. Khách chưa có hồ sơ thi đấu thì tạo (nối `bd:customer:<id>`) rồi mở.
// Ẩn khi tính năng thi đấu tắt — trang Khách hàng không đổi gì khác.

export default function CustomerRatingButton({ customer }) {
  const { enabled, toast } = useCompetition();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    const ref = `bd:customer:${customer.id}`;
    try {
      let player;
      try {
        player = await playersApi.byRef(ref);
      } catch (err) {
        const e = toCompetitionError(err);
        if (e.status !== 404) throw e;
        player = await playersApi.upsertByRef(ref, { displayName: customer.fullName || customer.name || `Khách ${customer.id}` });
      }
      navigate(`/competition/players/${player.id}`);
    } catch (err) {
      toast(toCompetitionError(err).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={open} disabled={busy} data-testid="customer-rating" className="text-amber-600 dark:text-amber-400 hover:underline text-xs font-medium disabled:opacity-50">
      🏆 Trình độ
    </button>
  );
}
