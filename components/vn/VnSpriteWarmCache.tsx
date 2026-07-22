'use client';

import { useMemo } from 'react';
import { markVnImageReady } from '@/lib/vn/preloadVnImages';

type Props = {
  urls: string[];
};

/**
 * 스탠딩 URL을 숨은 img 로 DOM에 유지.
 * 재등장 시 네트워크/디코드 대기를 없애기 위한 웜 캐시.
 */
export function VnSpriteWarmCache({ urls }: Props) {
  const list = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of urls) {
      const src = (u || '').trim();
      if (!src || seen.has(src)) continue;
      seen.add(src);
      out.push(src);
    }
    return out;
  }, [urls]);

  if (!list.length) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      {list.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          decoding="async"
          loading="eager"
          fetchPriority="low"
          onLoad={() => markVnImageReady(src)}
          onError={() => markVnImageReady(src)}
        />
      ))}
    </div>
  );
}
