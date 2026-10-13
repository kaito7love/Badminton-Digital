import React, { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { meApi, ratingApi } from '../../api/tournaments';
import { useLiveResource } from '../../hooks/useLiveResource';
import { selfAssessState } from '../../lib/customer';
import { Card, Notice, Spinner } from '../../components/ui';
import CustomerShell from '../../components/CustomerShell';
import AssessmentWizard from '../../components/AssessmentWizard';

// Khách tự chấm trình (docs/03 mục 2.4): cùng form với nhân viên nhưng có trần 4.5 và không có ô ghi chú. Đã có trận tính điểm / nhân viên đã xác nhận → chỉ xem,
// ghi rõ lý do. Bản nháp tự lưu trên máy.

export default function SelfAssessPage() {
  const navigate = useNavigate();
  const load = useCallback(async () => {
    const [me, rubric] = await Promise.all([meApi.get(), ratingApi.rubric()]);
    return { me, rubric };
  }, []);
  const { data, loading, error, reload } = useLiveResource({ load });

  return (
    <CustomerShell title="Tự chấm trình" subtitle="Chọn mô tả giống bạn nhất ở phần lớn các buổi chơi — không chọn theo lúc chơi hay nhất.">
      <Link to="/my-rating" className="mb-4 inline-block text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline">← Trình độ của tôi</Link>
      {loading && !data && <Spinner label="Đang tải form…" />}
      {error && !data && <Notice error={error} onRetry={() => reload()} />}
      {data && (() => {
        const { me, rubric } = data;
        const state = selfAssessState(me);
        if (!state.can) {
          return (
            <div className="space-y-3" data-testid="assess-locked">
              <Notice kind="warn">{state.reason}</Notice>
              <Link to="/my-rating" className="text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:underline">Về trình độ của tôi</Link>
            </div>
          );
        }
        return (
          <Card>
            <AssessmentWizard
              rubric={rubric}
              mode="self"
              who={`self-${me.id}`}
              initialProfile={{ gender: me.gender || '', birthYear: me.birthYear || '', dominantHand: me.dominantHand || '', playingSinceYear: me.playingSinceYear || '', sessionsPerWeek: me.sessionsPerWeek ?? '', preferredPlay: me.preferredPlay || '', doublesPosition: me.doublesPosition || '' }}
              hasGender={Boolean(me.gender)}
              submit={(body) => ratingApi.submitSelf(body)}
              onFinish={() => navigate('/my-rating')}
            />
          </Card>
        );
      })()}
    </CustomerShell>
  );
}
