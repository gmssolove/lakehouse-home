'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'lh_vn_autoplay';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** 타자 끝난 뒤 읽는 여유 (ms) — 길이 비례, 상·하한 */
export function vnAutoHoldMs(textLen: number): number {
  const n = Number.isFinite(textLen) ? Math.max(0, textLen) : 0;
  return Math.min(4800, Math.max(1200, 1000 + n * 38));
}

type Options = {
  active: boolean;
  leaving: boolean;
  isTyping: boolean;
  /** 선택지가 있으면 자동 진행 멈춤 */
  hasChoices: boolean;
  /** 라인 식별 — 바뀌면 타이머 리셋 */
  lineKey: string | number;
  textLength: number;
  onAdvance: () => void;
};

/**
 * OC / Pair 대사창 자동 재생.
 * 타자 완료 후 잠시 대기 → 다음 대사. 선택지에서는 대기.
 */
export function useVnAutoPlay({
  active,
  leaving,
  isTyping,
  hasChoices,
  lineKey,
  textLength,
  onAdvance,
}: Options) {
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    setAutoPlay(readStored());
  }, []);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay((prev) => {
      const next = !prev;
      writeStored(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!autoPlay || !active || leaving || isTyping || hasChoices) return;
    const delay = vnAutoHoldMs(textLength);
    const t = window.setTimeout(() => {
      onAdvance();
    }, delay);
    return () => window.clearTimeout(t);
  }, [autoPlay, active, leaving, isTyping, hasChoices, lineKey, textLength, onAdvance]);

  return { autoPlay, toggleAutoPlay };
}
