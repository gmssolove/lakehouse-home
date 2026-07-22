'use client';

import { useEffect, useRef } from 'react';
import { playSafe, warnVnAudio } from '@/lib/vn/safeAudio';
import { getSfxVolume, subscribeSfxVolume } from '@/lib/vn/vnAudioVolume';

const FADE_MS = 700;

type FadeHandle = { cancelled: boolean };
const fadeHandles = new WeakMap<HTMLAudioElement, FadeHandle>();

function cancelFade(el: HTMLAudioElement | null | undefined) {
  if (!el) return;
  const h = fadeHandles.get(el);
  if (h) h.cancelled = true;
}

function clamp(n: number) {
  return Math.max(0, Math.min(1, n));
}

function applyVolumeNow(el: HTMLAudioElement | null | undefined, v: number) {
  if (!el) return;
  cancelFade(el);
  try {
    el.muted = false;
    el.volume = clamp(v);
  } catch {
    /* ignore */
  }
}

function fadeVolume(
  el: HTMLAudioElement,
  from: number,
  to: number,
  ms: number,
  onDone?: () => void,
) {
  cancelFade(el);
  const handle: FadeHandle = { cancelled: false };
  fadeHandles.set(el, handle);
  const start = performance.now();
  const tick = (now: number) => {
    if (handle.cancelled) return;
    const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
    try {
      el.volume = clamp(from + (to - from) * t);
    } catch {
      /* ignore */
    }
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
    onDone?.();
  };
  requestAnimationFrame(tick);
}

/**
 * BGM과 별개인 환경음(루프). sticky 키로 켜고 끌 때까지 재생.
 * 음량은 효과음 슬라이더를 따름.
 */
export function useVnAmbient(
  ambientKey: string | null,
  resolveUrl: (key: string) => string | undefined,
) {
  const elRef = useRef<HTMLAudioElement | null>(null);
  const curKey = useRef<string | null>(null);
  const targetVol = useRef(getSfxVolume());

  useEffect(() => {
    targetVol.current = getSfxVolume();
    return subscribeSfxVolume((v) => {
      targetVol.current = v;
      applyVolumeNow(elRef.current, v);
    });
  }, []);

  useEffect(() => {
    return () => {
      cancelFade(elRef.current);
      elRef.current?.pause();
      elRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ambientKey === curKey.current) return;

    const nextUrl = ambientKey ? resolveUrl(ambientKey) : undefined;
    const el = elRef.current;

    if (!ambientKey) {
      curKey.current = null;
      if (el) {
        fadeVolume(el, el.volume, 0, FADE_MS, () => {
          el.pause();
          el.loop = false;
        });
      }
      return;
    }

    if (!nextUrl) {
      warnVnAudio('sfx', `환경음 URL 없음 — 스킵: ${ambientKey}`);
      curKey.current = ambientKey;
      return;
    }

    let audio = el;
    try {
      if (!audio) {
        audio = new Audio();
        elRef.current = audio;
      }
    } catch (err) {
      warnVnAudio('sfx', '환경음 Audio 생성 실패', err);
      curKey.current = ambientKey;
      return;
    }

    const startNext = () => {
      try {
        cancelFade(audio!);
        audio!.loop = true;
        audio!.preload = 'auto';
        audio!.src = nextUrl;
        audio!.currentTime = 0;
        audio!.volume = 0;
        playSafe(audio!, 'sfx', nextUrl);
        fadeVolume(audio!, 0, targetVol.current, FADE_MS);
      } catch (err) {
        warnVnAudio('sfx', `환경음 재생 준비 실패: ${nextUrl}`, err);
      }
    };

    curKey.current = ambientKey;

    if (audio && !audio.paused && audio.src) {
      fadeVolume(audio, audio.volume, 0, FADE_MS, () => {
        audio!.pause();
        startNext();
      });
    } else {
      startNext();
    }
  }, [ambientKey, resolveUrl]);
}
