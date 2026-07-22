'use client';

import type { CSSProperties } from 'react';

type Props = {
  /** 이 시나리오의 VN 데이터가 준비돼 있는지 (없으면 비활성) */
  hasVnScene: boolean;
  onClick: () => void;
  /** 시나리오 제목 — 있으면 부제로 표시 */
  subtitle?: string;
  /** 액센트 색 (#rrggbb). 없으면 기본 골드 */
  accentColor?: string;
};

/** 시나리오 상세 — OC「Related scenario」링크와 동일 레이아웃 */
export function ScenarioVnPlayButton({ hasVnScene, onClick, subtitle, accentColor }: Props) {
  const accent = accentColor && /^#[0-9a-fA-F]{6}$/i.test(accentColor) ? accentColor : undefined;
  const style = accent
    ? ({ ['--vn-play-accent' as string]: accent } as CSSProperties)
    : undefined;

  return (
    <button
      type="button"
      className="oc-trpg-link-btn trpg-vn-play-btn"
      onClick={onClick}
      disabled={!hasVnScene}
      title={hasVnScene ? undefined : '아직 VN으로 변환된 대사가 없어요'}
      style={style}
    >
      <span className="oc-trpg-link-kicker">Visual novel</span>
      <span className="oc-trpg-link-title">
        <span className="trpg-vn-play-btn__icon" aria-hidden="true">
          ▶
        </span>
        비주얼 노벨로 보기
      </span>
      {subtitle ? <span className="oc-trpg-link-sub">{subtitle}</span> : null}
      <span className="oc-trpg-link-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}
