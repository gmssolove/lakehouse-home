'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** 페이드 완료(애니 72% of 1.1s ≈ 792ms)와 맞춤 */
export const VN_CHOICE_RESOLVE_MS = 820;

/**
 * 선택지 클릭 시 곧바로 분기하지 않고, 고른 티가 나게 잠깐 연출한 뒤 onPick.
 */
export function useVnChoicePick(onPick: (next: string) => void, resetKey: string) {
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const locked = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    locked.current = false;
    setPickedIndex(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [resetKey]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const pick = useCallback((index: number, next: string) => {
    if (locked.current) return;
    locked.current = true;
    setPickedIndex(index);

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reduced ? 0 : VN_CHOICE_RESOLVE_MS;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onPickRef.current(next);
    }, delay);
  }, []);

  return {
    pickedIndex,
    resolving: pickedIndex !== null,
    pick,
  };
}
