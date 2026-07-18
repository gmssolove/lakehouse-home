'use client';

import {
  isUnknownRisk,
  riskBadgeStyleForStage,
  riskBadgeText,
  visibleRiskStages,
} from '@/lib/oc/riskStages';
import type { RiskStage } from '@/lib/types/character';

type Props = {
  riskStages?: RiskStage[];
  riskLevel?: string;
  className?: string;
};

/** OC·페어 공통 위험도 배지(단계별 색상 · 미상은 독립 스타일) */
export function RiskBadges({ riskStages, riskLevel, className }: Props) {
  const stages = visibleRiskStages({ riskStages, riskLevel });
  if (!stages.length) return null;

  return (
    <div className={['lh-risk-badges', className].filter(Boolean).join(' ')}>
      {stages.map((s) => {
        const unknown = isUnknownRisk(s);
        return (
          <span
            key={s.id}
            className={['lh-risk-badge', unknown ? 'lh-risk-badge--unknown' : '']
              .filter(Boolean)
              .join(' ')}
            style={riskBadgeStyleForStage(s)}
            title={s.notice?.trim() || undefined}
          >
            위험도 · {riskBadgeText(s)}
          </span>
        );
      })}
    </div>
  );
}
