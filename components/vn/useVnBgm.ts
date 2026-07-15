'use client';

import { useEffect, useRef } from 'react';
import { playSafe, warnVnAudio } from '@/lib/vn/safeAudio';

const CROSSFADE_MS = 1000;

/**
 * BGM 키 변경 시 크로스페이드.
 * mp3 부재·404·autoplay 차단 시 console.warn만 하고 크래시하지 않음.
 */
export function useVnBgm(bgmKey: string | null, resolveUrl: (key: string) => string | undefined) {
  const aRef = useRef<HTMLAudioElement | null>(null);
  const bRef = useRef<HTMLAudioElement | null>(null);
  const activeIsA = useRef(true);
  const curKey = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      aRef.current?.pause();
      bRef.current?.pause();
      aRef.current = null;
      bRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (bgmKey === curKey.current) return;

    const nextUrl = bgmKey ? resolveUrl(bgmKey) : undefined;
    const prev = activeIsA.current ? aRef.current : bRef.current;

    if (!bgmKey) {
      curKey.current = null;
      if (prev) fadeVolume(prev, prev.volume, 0, CROSSFADE_MS, () => prev.pause());
      return;
    }

    if (!nextUrl) {
      warnVnAudio('bgm', `URL 없음 — 스킵: ${bgmKey}`);
      curKey.current = bgmKey;
      if (prev) fadeVolume(prev, prev.volume, 0, CROSSFADE_MS, () => prev.pause());
      return;
    }

    try {
      if (!aRef.current) aRef.current = new Audio();
      if (!bRef.current) bRef.current = new Audio();
    } catch (err) {
      warnVnAudio('bgm', 'Audio 생성 실패', err);
      curKey.current = bgmKey;
      return;
    }

    const incoming = activeIsA.current ? bRef.current : aRef.current;
    const outgoing = activeIsA.current ? aRef.current : bRef.current;
    activeIsA.current = !activeIsA.current;
    curKey.current = bgmKey;

    try {
      incoming.src = nextUrl;
      incoming.loop = true;
      incoming.volume = 0;
      playSafe(incoming, 'bgm', nextUrl);
      fadeVolume(incoming, 0, 0.55, CROSSFADE_MS);
      if (outgoing && !outgoing.paused) {
        fadeVolume(outgoing, outgoing.volume, 0, CROSSFADE_MS, () => {
          try {
            outgoing.pause();
            outgoing.removeAttribute('src');
            outgoing.load();
          } catch {
            /* ignore */
          }
        });
      }
    } catch (err) {
      warnVnAudio('bgm', `재생 준비 실패: ${nextUrl}`, err);
    }
  }, [bgmKey, resolveUrl]);
}

function fadeVolume(
  el: HTMLAudioElement,
  from: number,
  to: number,
  ms: number,
  onDone?: () => void,
) {
  const start = performance.now();
  try {
    el.volume = clamp(from);
  } catch {
    onDone?.();
    return;
  }

  function tick(now: number) {
    const t = Math.min(1, (now - start) / ms);
    try {
      el.volume = clamp(from + (to - from) * t);
    } catch {
      onDone?.();
      return;
    }
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  }
  requestAnimationFrame(tick);
}

function clamp(n: number) {
  return Math.max(0, Math.min(1, n));
}
