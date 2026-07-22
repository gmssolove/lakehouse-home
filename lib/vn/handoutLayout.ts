import type { CSSProperties } from 'react';
import {
  clampHandoutRadius,
  type HandoutLayout,
} from '@/lib/vn/menuTheme';
import {
  normalizeStandPose,
  type StandPose,
} from '@/lib/vn/useStandPoseDrag';

/** 화면 중앙 기준. x·y=% · scale=배율 · radius=모서리 px */
export const DEFAULT_HANDOUT_LAYOUT: HandoutLayout = {
  x: 0,
  y: 0,
  scale: 1,
  radius: 0,
};

/** 인 — 대사창 lhVNInSlow(1.2s)보다 살짝 여유, 블러는 더 빨리 풀림 */
export const HANDOUT_ANIM_MS = 1550;
/** 아웃 */
export const HANDOUT_EXIT_MS = 720;

export function normalizeHandoutLayout(raw: unknown): HandoutLayout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  if (!('x' in p) && !('y' in p) && !('scale' in p) && !('radius' in p)) {
    return undefined;
  }
  const pose = normalizeStandPose({
    x: Number(p.x),
    y: Number(p.y),
    scale: Number(p.scale),
  });
  const radius = clampHandoutRadius(p.radius);
  return { ...pose, radius };
}

export function normalizeHandoutLayoutOrDefault(
  raw: HandoutLayout | StandPose | null | undefined,
): HandoutLayout {
  if (!raw) return { ...DEFAULT_HANDOUT_LAYOUT };
  const pose = normalizeStandPose(raw);
  const radius = clampHandoutRadius(
    'radius' in raw ? (raw as HandoutLayout).radius : 0,
  );
  return { ...pose, radius };
}

export function handoutFigureStyle(pose: StandPose): CSSProperties {
  const p = normalizeStandPose(pose);
  return {
    left: `calc(50% + ${p.x}%)`,
    top: `calc(50% + ${p.y}%)`,
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -50%)',
  };
}
