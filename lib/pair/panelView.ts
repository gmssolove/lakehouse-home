import type {
  PairItem,
  PairPanelLayout,
  PairPanelSectionKey,
  PairPanelView,
  PairPanelViews,
  TouchHoverStyle,
  TouchZone,
} from '@/lib/types/character';
import { normalizeImageFrame, type ImageFrame } from '@/lib/shared/imageFrame';
import {
  normalizeTouchHoverStyle,
  normalizeTouchZones,
} from '@/lib/pair/touchZones';

export const PAIR_PANEL_LAYOUTS: {
  id: PairPanelLayout;
  label: string;
}[] = [
  { id: 'panel', label: '패널' },
  { id: 'floating', label: '플로팅' },
  { id: 'wide-split', label: '와이드 스플릿' },
  { id: 'cinematic', label: '시네마틱' },
  { id: 'banner', label: '배너' },
  { id: 'diagonal', label: '다이아고널' },
  { id: 'book', label: '북 스프레드' },
];

export const DEFAULT_PANEL_LAYOUT: PairPanelLayout = 'panel';

const LAYOUT_SET = new Set<string>(PAIR_PANEL_LAYOUTS.map((l) => l.id));

export function normalizePanelLayout(v?: string): PairPanelLayout {
  if (v && LAYOUT_SET.has(v)) return v as PairPanelLayout;
  return DEFAULT_PANEL_LAYOUT;
}

/** 패널 이미지 줌 1.0~2.0 */
export function clampPanelImageScale(n: number) {
  return Math.min(2, Math.max(1, n));
}

export function clampPanelImageOffset(n: number, scale = 1) {
  const limit = Math.min(80, 28 + scale * 28);
  return Math.min(limit, Math.max(-limit, n));
}

export function normalizePanelView(view?: PairPanelView): Required<
  Pick<PairPanelView, 'layout' | 'echo' | 'touchReactionOnly'>
> & {
  img: string;
  frame: Required<ImageFrame>;
  touchZones: TouchZone[];
  touchHoverStyle: TouchHoverStyle;
  touchSpeaker: string;
} {
  return {
    layout: normalizePanelLayout(view?.layout),
    echo: Boolean(view?.echo),
    img: view?.img?.trim() || '',
    frame: normalizeImageFrame({
      ...view?.frame,
      scale: clampPanelImageScale(view?.frame?.scale ?? 1),
    }),
    touchZones: normalizeTouchZones(view?.touchZones),
    touchHoverStyle: normalizeTouchHoverStyle(view?.touchHoverStyle),
    touchReactionOnly: Boolean(view?.touchReactionOnly),
    touchSpeaker: view?.touchSpeaker?.trim() || '',
  };
}

export function getPanelView(
  views: PairPanelViews | undefined,
  key: PairPanelSectionKey,
): PairPanelView {
  return views?.[key] ?? {};
}

/** 탭 히어로 이미지 URL 폴백 */
export function resolvePanelImageSrc(pair: PairItem, key: PairPanelSectionKey): string {
  const custom = pair.panelViews?.[key]?.img?.trim();
  if (custom) return custom;
  if (key === 'gallery') {
    const first = (pair.gallery ?? []).find((g) => g.src?.trim())?.src?.trim();
    if (first) return first;
  }
  const cover = pair.img?.trim();
  if (cover) return cover;
  const body = pair.charBodyImgs?.find((u) => u?.trim())?.trim();
  return body || '';
}

export function patchPanelView(
  pair: PairItem,
  key: PairPanelSectionKey,
  patch: Partial<PairPanelView>,
): PairItem {
  const prev = pair.panelViews?.[key] ?? {};
  const nextView: PairPanelView = {
    ...prev,
    ...patch,
    frame: patch.frame ? { ...prev.frame, ...patch.frame } : prev.frame,
  };
  if (patch.layout !== undefined) nextView.layout = normalizePanelLayout(patch.layout);
  if (patch.echo !== undefined) nextView.echo = Boolean(patch.echo);
  if (patch.img !== undefined) nextView.img = patch.img.trim();
  if (patch.touchZones !== undefined) {
    nextView.touchZones = normalizeTouchZones(patch.touchZones);
  }
  if (patch.touchHoverStyle !== undefined) {
    nextView.touchHoverStyle = normalizeTouchHoverStyle(patch.touchHoverStyle);
  }
  if (patch.touchReactionOnly !== undefined) {
    nextView.touchReactionOnly = Boolean(patch.touchReactionOnly);
  }
  if (patch.touchSpeaker !== undefined) {
    nextView.touchSpeaker = patch.touchSpeaker.trim();
  }
  return {
    ...pair,
    panelViews: {
      ...pair.panelViews,
      [key]: nextView,
    },
  };
}
