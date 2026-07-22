'use client';

import { useEffect, useRef } from 'react';
import { playSafe, warnVnAudio } from '@/lib/vn/safeAudio';
import { getSfxVolume, subscribeSfxVolume } from '@/lib/vn/vnAudioVolume';

/**
 * 라인 sfx 키 재생. 파일 없으면 경고만 하고 통과.
 * 재생 중 음량 슬라이더 변경 시 현재 SFX에도 즉시 반영.
 */
export function useVnSfx(sfxKey: string | null, resolveUrl: (key: string) => string | undefined) {
  const lastKey = useRef<string | null>(null);
  const currentRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return subscribeSfxVolume((v) => {
      const el = currentRef.current;
      if (!el) return;
      try {
        el.volume = Math.max(0, Math.min(1, v));
      } catch {
        /* ignore */
      }
    });
  }, []);

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
      el.volume = getSfxVolume();
      el.src = url;
      currentRef.current = el;
      const clear = () => {
        if (currentRef.current === el) currentRef.current = null;
      };
      el.addEventListener('ended', clear);
      el.addEventListener('error', clear);
      playSafe(el, 'sfx', url);
    } catch (err) {
      warnVnAudio('sfx', `재생 준비 실패: ${url}`, err);
    }
  }, [sfxKey, resolveUrl]);
}
