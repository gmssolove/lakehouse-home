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
  const useTransform = scale !== 1 || x !== 0 || y !== 0;

  return {
    objectFit: (opts?.fit || 'cover') as CSSProperties['objectFit'],
    objectPosition: useTransform ? 'center center' : opts?.pos || 'center top',
    transform: useTransform ? `translate(${x}%, ${y}%) scale(${scale})` : undefined,
    transformOrigin: 'center center',
  };
}

export function clampFrameScale(n: number) {
  return Math.min(3, Math.max(0.55, n));
}

export function clampFrameOffset(n: number) {
  return Math.min(45, Math.max(-45, n));
}
