import React, { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { playersApi, ratingApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { permissionsFor } from '../../lib/permissions';
import { ratingOf } from '../../lib/rating';
import { Card, Notice, PageHeader, Spinner } from '../../components/ui';
import AssessmentWizard from '../../components/AssessmentWizard';

// Nhân viên chấm trình (07: cùng form với người chơi, thêm ô ghi chú, không có trần 4.5). Người đã có trận tính điểm: chỉ quản lý chấm được và
// điểm hiện tại KHÔNG đổi (bài chấm chỉ được ghi lại — điểm giờ do kết quả thi đấu quyết định).

export default function PlayerAssessPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const perms = permissionsFor(user);
  const load = useCallback(async () => {
    const [player, rubric] = await Promise.all([playersApi.get(id), ratingApi.rubric()]);
    return { player, rubric };
  }, [id]);
  const { data, loading, error, reload } = useLiveResource({ load });

  if (loading && !data) return <div className="mx-auto max-w-3xl p-4 sm:p-8"><Spinner label="Đang tải form chấm trình…" /></div>;
  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4 sm:p-8">
        <Notice error={error} onRetry={() => reload()} />
        <Link to="/competition/players" className="text-sm font-bold text-emerald-600 hover:underline">← Danh sách người chơi</Link>
      </div>
    );
  }
  if (!data) return null;

  const { player, rubric } = data;
  const hasMatches = ['singles', 'doubles'].some((d) => (ratingOf(player, d) || {}).ratedMatches > 0);
  const locked = hasMatches && !perms.canAssessAny ? 'Người chơi đã có trận tính điểm — chỉ quản lý chấm lại được.' : '';
  const goProfile = () => navigate(`/competition/players/${id}`);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-8">
      <Link to={`/competition/players/${id}`} className="inline-block text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400">← Hồ sơ {player.displayName}</Link>
      <PageHeader title={`Chấm trình — ${player.displayName}`} subtitle="Chọn mô tả giống nhất ở phần lớn các buổi chơi. Nhân viên chấm không bị trần 4.5." />
      {hasMatches && !locked && <Notice kind="warn">Người chơi đã có trận tính điểm: bài chấm chỉ được ghi lại, <b>điểm hiện tại không đổi</b> (điểm do kết quả thi đấu quyết định).</Notice>}
      <Card>
        <AssessmentWizard
          rubric={rubric}
          mode="staff"
          who={`staff-${id}`}
          initialProfile={{ gender: player.gender || '', birthYear: player.birthYear || '', dominantHand: player.dominantHand || '', playingSinceYear: player.playingSinceYear || '', sessionsPerWeek: player.sessionsPerWeek || '', preferredPlay: player.preferredPlay || '', doublesPosition: player.doublesPosition || '' }}
          hasGender={Boolean(player.gender)}
          locked={locked}
          submit={(body) => playersApi.assess(id, body)}
          onFinish={goProfile}
        />
      </Card>
    </div>
  );
}
