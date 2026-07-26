'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'lh_vn_autoplay';

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
   * 'scenario' — 시나리오 VN (localStorage 유지)
   * 'detail' — OC/Pair 대사창 (세션만, 기본 OFF — 저장된 AUTO가 새지 않음)
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
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef(false);
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;
  autoPlayRef.current = autoPlay;

  useEffect(() => {
    if (scope === 'detail') {
      /* OC/Pair: 저장된 AUTO 절대 복원 안 함. 예전 키도 지움 */
      try {
        localStorage.removeItem('lh_vn_autoplay_detail');
      } catch {
        /* ignore */
      }
      setAutoPlay(false);
      autoPlayRef.current = false;
      return;
    }
    const stored = readStored(STORAGE_KEY);
    setAutoPlay(stored);
    autoPlayRef.current = stored;
  }, [scope]);

  /* 대사창이 닫히면 detail AUTO도 끔 — 다시 열 때 자동 넘김 방지 */
  useEffect(() => {
    if (scope !== 'detail') return;
    if (!active || leaving) {
      setAutoPlay(false);
      autoPlayRef.current = false;
    }
  }, [scope, active, leaving]);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay((prev) => {
      const next = !prev;
      autoPlayRef.current = next;
      if (scope === 'scenario') writeStored(STORAGE_KEY, next);
      return next;
    });
  }, [scope]);

  useEffect(() => {
    if (!autoPlay || !active || leaving || isTyping || hasChoices) return;
    const delay = vnAutoHoldMs(textLength);
    const t = window.setTimeout(() => {
      /* 타이머 동안 사용자가 AUTO를 끈 경우 무시 */
      if (!autoPlayRef.current) return;
      onAdvanceRef.current();
    }, delay);
    return () => window.clearTimeout(t);
  }, [autoPlay, active, leaving, isTyping, hasChoices, lineKey, textLength]);

  return { autoPlay, toggleAutoPlay };
}
