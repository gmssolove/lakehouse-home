'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'lh_vn_autoplay';
/** OC/Pair 상세 대사창 — 시나리오 VN AUTO와 분리 (시나리오에서 켠 값이 새지 않게) */
const DETAIL_STORAGE_KEY = 'lh_vn_autoplay_detail';

function readStored(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeStored(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
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
  /**
   * 'scenario' — 시나리오 VN (기본, lh_vn_autoplay)
   * 'detail' — OC/Pair 대사창 (별도 키, 기본 OFF)
   */
  scope?: 'scenario' | 'detail';
};

/**
 * OC / Pair / 시나리오 대사창 자동 재생.
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
  scope = 'scenario',
}: Options) {
  const storageKey = scope === 'detail' ? DETAIL_STORAGE_KEY : STORAGE_KEY;
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    setAutoPlay(readStored(storageKey));
  }, [storageKey]);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay((prev) => {
      const next = !prev;
      writeStored(storageKey, next);
      return next;
    });
  }, [storageKey]);

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
