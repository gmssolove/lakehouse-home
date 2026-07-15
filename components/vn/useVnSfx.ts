'use client';

import { useEffect, useRef } from 'react';
import { playSafe, warnVnAudio } from '@/lib/vn/safeAudio';

/**
 * 라인 sfx 키 재생. 파일 없으면 경고만 하고 통과.
 */
export function useVnSfx(sfxKey: string | null, resolveUrl: (key: string) => string | undefined) {
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!sfxKey) {
      lastKey.current = null;
      return;
    }
    if (sfxKey === lastKey.current) return;
    lastKey.current = sfxKey;

    const url = resolveUrl(sfxKey);
    if (!url) {
      warnVnAudio('sfx', `URL 없음 — 스킵: ${sfxKey}`);
      return;
    }

    try {
      const el = new Audio();
      el.volume = 0.7;
      el.src = url;
      playSafe(el, 'sfx', url);
    } catch (err) {
      warnVnAudio('sfx', `재생 준비 실패: ${url}`, err);
    }
  }, [sfxKey, resolveUrl]);
}
