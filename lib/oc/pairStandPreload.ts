import type { PairItem } from '@/lib/types/character';

/** 페어 상세 진입 전 전신 스탠딩 프리로드 */
export function preloadPairStandImages(p: PairItem) {
  if (typeof window === 'undefined') return;
  const urls = [p.charBodyImgs?.[0], p.charBodyImgs?.[1], p.charImgs?.[0], p.charImgs?.[1]]
    .map((u) => (u || '').trim())
    .filter(Boolean);
  Array.from(new Set(urls)).forEach((src) => {
    const img = new window.Image();
    img.decoding = 'async';
    try {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high';
    } catch {
      /* ignore */
    }
    img.src = src;
  });
}
