import type { CSSProperties } from 'react';

export type ImageFrame = {
  scale?: number;
  x?: number;
  y?: number;
};

export const DEFAULT_IMAGE_FRAME: ImageFrame = { scale: 1, x: 0, y: 0 };

export function normalizeImageFrame(frame?: ImageFrame): Required<ImageFrame> {
  return {
    scale: frame?.scale ?? 1,
    x: frame?.x ?? 0,
    y: frame?.y ?? 0,
  };
}

export function imageFrameTransform(frame?: ImageFrame): string {
  const { scale, x, y } = normalizeImageFrame(frame);
  return `translate(${x}%, ${y}%) scale(${scale})`;
}

export function framedImageStyle(
  frame?: ImageFrame,
  opts?: { fit?: string; pos?: string },
): CSSProperties {
  const { scale, x, y } = normalizeImageFrame(frame);
  const pos = opts?.pos || 'center top';
  const useTransform = scale !== 1 || x !== 0 || y !== 0;
  const origin = pos.includes('top') ? 'center top' : pos.includes('bottom') ? 'center bottom' : 'center center';

  return {
    objectFit: (opts?.fit || 'cover') as CSSProperties['objectFit'],
    objectPosition: pos,
    transform: useTransform ? `translate(${x}%, ${y}%) scale(${scale})` : undefined,
    transformOrigin: origin,
  };
}

export function clampFrameScale(n: number) {
  return Math.min(3, Math.max(0.55, n));
}

/** 확대 배율에 비례해 팬 한도 확장 (고배율에서 ±45%로는 부족) */
export function frameOffsetLimit(scale = 1) {
  const s = Math.max(0.55, scale);
  return Math.min(150, 24 + s * 36);
}

export function clampFrameOffset(n: number, scale = 1) {
  const limit = frameOffsetLimit(scale);
  return Math.min(limit, Math.max(-limit, n));
}
