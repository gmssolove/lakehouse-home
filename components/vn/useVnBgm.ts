'use client';

import { useEffect, useRef } from 'react';
import { playSafe, warnVnAudio } from '@/lib/vn/safeAudio';
import { getBgmVolume, subscribeBgmVolume } from '@/lib/vn/vnAudioVolume';

const CROSSFADE_MS = 1000;

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

/**
 * BGM 키 변경 시 크로스페이드.
 * ESC 음량 슬라이더는 페이드를 끊고 현재 재생 채널에 즉시 반영.
 */
export function useVnBgm(bgmKey: string | null, resolveUrl: (key: string) => string | undefined) {
  const aRef = useRef<HTMLAudioElement | null>(null);
  const bRef = useRef<HTMLAudioElement | null>(null);
  const activeIsA = useRef(true);
  const curKey = useRef<string | null>(null);
  const targetVol = useRef(getBgmVolume());

  useEffect(() => {
    targetVol.current = getBgmVolume();
    return subscribeBgmVolume((v) => {
      targetVol.current = v;
      const active = activeIsA.current ? aRef.current : bRef.current;
      /* 페이드 rAF가 volume을 다시 덮지 않도록 먼저 cancel */
      applyVolumeNow(active, v);
    });
  }, []);

  useEffect(() => {
    return () => {
      cancelFade(aRef.current);
      cancelFade(bRef.current);
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
      incoming.muted = false;
      incoming.volume = 0;
      playSafe(incoming, 'bgm', nextUrl);
      fadeVolume(incoming, 0, () => targetVol.current, CROSSFADE_MS);
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
  to: number | (() => number),
  ms: number,
  onDone?: () => void,
) {
  cancelFade(el);
  const handle: FadeHandle = { cancelled: false };
  fadeHandles.set(el, handle);

  const getTo = typeof to === 'function' ? to : () => to;
  const start = performance.now();
  try {
    el.volume = clamp(from);
  } catch {
    onDone?.();
    return;
  }

  function tick(now: number) {
    if (handle.cancelled) return;
    const t = Math.min(1, (now - start) / ms);
    const target = getTo();
    try {
      el.volume = clamp(from + (target - from) * t);
    } catch {
      onDone?.();
      return;
    }
    if (t < 1) {
      requestAnimationFrame(tick);
    } else if (!handle.cancelled) {
      onDone?.();
    }
  }
  requestAnimationFrame(tick);
}
