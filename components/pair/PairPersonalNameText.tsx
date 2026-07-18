'use client';

import { pairPersonalNameTextStyle } from '@/lib/pair/personalNameGlow';

/**
 * 페어 소개 전용 — 퍼스널컬러 이름(+선택 글로우).
 * OC 개별 프로필 컴포넌트와 분리됨. 페어 intro에만 사용.
 */
type Props = {
  name: string;
  personalColor?: string;
  glowColor?: string;
  glow?: boolean;
  className?: string;
};

export function PairPersonalNameText({
  name,
  personalColor,
  glowColor,
  glow,
  className,
}: Props) {
  const style = pairPersonalNameTextStyle(personalColor, glowColor, glow);
  return (
    <span className={className} style={style}>
      {name}
    </span>
  );
}
