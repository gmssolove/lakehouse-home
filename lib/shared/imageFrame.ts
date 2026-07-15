import type { CSSProperties } from 'react';

export type ImageFrame = {
  scale?: number;
  x?: number;
  y?: number;
  /** 하단 잘림 페이드 블러 높이 0~100 (뷰포트 %) */
  bottomBlur?: number;
};

export const DEFAULT_IMAGE_FRAME: ImageFrame = { scale: 1, x: 0, y: 0, bottomBlur: 0 };

export function normalizeImageFrame(frame?: ImageFrame): Required<ImageFrame> {
  return {
    scale: clampFrameScale(frame?.scale ?? 1),
    x: frame?.x ?? 0,
    y: frame?.y ?? 0,
    bottomBlur: Math.max(0, Math.min(100, frame?.bottomBlur ?? 0)),
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
  const origin =
    pos.includes('top') ? 'center top' : pos.includes('bottom') ? 'center bottom' : 'center center';
  /* 치수 없이 쓰는 폴백: 축소는 contain(전체 표시), 확대만 scale — 카드/에디터는 ImageFrameView 레이아웃 사용 */
  const zoomOut = scale < 1;
  const displayScale = zoomOut ? 1 : scale;
  const useTransform = displayScale !== 1 || x !== 0 || y !== 0;

  /* --oc-pf-* : 상세 포트레이트 CSS의 translateX(-50%) 와 합성용 */
  return {
    objectFit: zoomOut ? 'contain' : frameObjectFit(opts?.fit, scale),
    objectPosition: pos,
    ['--oc-pf-x' as string]: `${x}%`,
    ['--oc-pf-y' as string]: `${y}%`,
    ['--oc-pf-s' as string]: String(displayScale),
    ['--oc-pf-o' as string]: origin,
    transform: useTransform ? `translate(${x}%, ${y}%) scale(${displayScale})` : undefined,
    transformOrigin: origin,
  };
}

export function clampFrameScale(n: number) {
  return Math.min(3, Math.max(0.7, n));
}

/**
 * 휠 한 틱당 배율 — 1%보다 작게 해서 슬라이더/휠이 덜 튀게
 */
export function wheelScaleStep(deltaY: number, step = 0.005): number {
  if (!deltaY || !Number.isFinite(deltaY)) return 0;
  const sign = deltaY > 0 ? -1 : 1;
  const mag = Math.abs(deltaY);
  if (mag < 1) return 0;
  const ticks = Math.min(2, Math.max(1, Math.round(mag / 120)));
  return sign * step * ticks;
}

/** 확대 배율에 비례해 팬 한도 확장 */
export function frameOffsetLimit(scale = 1) {
  const s = Math.max(0.7, scale);
  if (s < 1) return Math.min(40, 10 + s * 24);
  return Math.min(150, 24 + s * 36);
}

export function clampFrameOffset(n: number, scale = 1) {
  const limit = frameOffsetLimit(scale);
  return Math.min(limit, Math.max(-limit, n));
}

/** object-fit — scale과 무관하게 고정(contain↔cover 전환 시 100% 부근 급확대 방지) */
export function frameObjectFit(fit: string | undefined, _scale?: number): NonNullable<CSSProperties['objectFit']> {
  return ((fit || 'cover') as CSSProperties['objectFit']) || 'cover';
}

/** @deprecated 실제 scale을 그대로 사용 — UI %와 transform 일치 */
export function frameTransformScale(scale?: number) {
  return scale ?? 1;
}

export function coverContainFits(frameW: number, frameH: number, imgW: number, imgH: number) {
  const coverFit = Math.max(frameW / imgW, frameH / imgH);
  const containFit = Math.min(frameW / imgW, frameH / imgH);
  return {
    coverFit,
    containFit,
    /** scale=1 이 cover, 이 값이면 원본 전체가 프레임 안에 들어옴 */
    minScale: containFit / coverFit,
  };
}

export type FrameImageLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
  minScale: number;
};

/**
 * cover 기준 연속 줌 레이아웃.
 * scale=1 → cover(카드 꽉 채움), 축소할수록 원본이 더 보임(contain에 근접).
 * 이전처럼 cover 후 transform scale을 주면 잘린 채 통째로만 줄어든다.
 */
export function frameImageLayout(
  frameW: number,
  frameH: number,
  imgW: number,
  imgH: number,
  frame?: ImageFrame,
  pos = 'center top',
): FrameImageLayout | null {
  if (frameW <= 0 || frameH <= 0 || imgW <= 0 || imgH <= 0) return null;
  const { scale, x, y } = normalizeImageFrame(frame);
  const { coverFit, minScale } = coverContainFits(frameW, frameH, imgW, imgH);
  const width = imgW * coverFit * scale;
  const height = imgH * coverFit * scale;

  let left: number;
  if (pos.includes('left')) left = 0;
  else if (pos.includes('right')) left = frameW - width;
  else left = (frameW - width) / 2;

  let top: number;
  if (pos.includes('top')) top = 0;
  else if (pos.includes('bottom')) top = frameH - height;
  else top = (frameH - height) / 2;

  left += (x / 100) * frameW;
  top += (y / 100) * frameH;

  return { width, height, left, top, minScale };
}
