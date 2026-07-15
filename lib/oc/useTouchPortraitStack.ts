'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

type Stack = { front: 0 | 1; layers: [string, string] };

/* 밑장 불투명 → 위장만 페이드아웃 (캐릭터 소멸 없음) */
const SOFT_MS = 280;

const portraitCache = new Map<string, HTMLImageElement>();

/** useEffect 등 렌더 사이클 중 flushSync 금지 → 다음 마이크로태스크로 미룸 */
function commitSync(fn: () => void, after?: () => void) {
  queueMicrotask(() => {
    flushSync(fn);
    after?.();
  });
}

export function warmTouchPortrait(url: string, priority: 'low' | 'high' = 'low') {
  const src = url.trim();
  if (!src) return;
  let img = portraitCache.get(src);
  if (!img) {
    img = new Image();
    try {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = priority;
    } catch {
      /* ignore */
    }
    img.decoding = 'async';
    img.src = src;
    portraitCache.set(src, img);
    return;
  }
  if (priority === 'high') {
    try {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high';
    } catch {
      /* ignore */
    }
  }
}

/**
 * 터치 표정 더블버퍼
 * - 모든 표정 전환: 다음 표정을 아래에 깔고 위만 페이드아웃
 * - softRevertToBase = softSwap(기본)
 */
export function useTouchPortraitStack(baseSrc: string) {
  const stackRef = useRef<Stack>({ front: 0, layers: ['', ''] });
  const [stack, setStack] = useState<Stack>(stackRef.current);
  const [softRevert, setSoftRevert] = useState(false);
  const genRef = useRef(0);
  const softTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseRef = useRef(baseSrc);
  const prevBaseSrcRef = useRef(baseSrc.trim());
  baseRef.current = baseSrc;
  /** 현재 목표로 보여 주는(또는 전환 중인) 표정 URL */
  const targetRef = useRef('');

  const clearSoftTimer = useCallback(() => {
    if (softTimerRef.current) {
      clearTimeout(softTimerRef.current);
      softTimerRef.current = null;
    }
  }, []);

  const softSwapTo = useCallback(
    (url: string, onDone?: () => void) => {
      const nextSrc = url.trim();
      if (!nextSrc) {
        onDone?.();
        return;
      }

      clearSoftTimer();

      const current = stackRef.current;
      /* 같은 파일 연속 → 애니 없이 유지 (전환 중이어도 목표 동일하면 스킵) */
      if (current.layers[current.front] === nextSrc || targetRef.current === nextSrc) {
        genRef.current += 1;
        targetRef.current = nextSrc;
        if (current.layers[current.front] !== nextSrc) {
          /* 페이드 도중 같은 표정 재요청 → 즉시 정착 */
          const idx = current.layers[0] === nextSrc ? 0 : current.layers[1] === nextSrc ? 1 : -1;
          if (idx === 0 || idx === 1) {
            const settled: Stack = {
              front: idx,
              layers: [...current.layers] as [string, string],
            };
            stackRef.current = settled;
            commitSync(() => {
              setSoftRevert(false);
              setStack(settled);
            }, onDone);
            return;
          }
        }
        commitSync(() => setSoftRevert(false), onDone);
        return;
      }

      targetRef.current = nextSrc;
      const gen = ++genRef.current;
      const back = (current.front ^ 1) as 0 | 1;
      const layers: [string, string] = [...current.layers];
      if (!layers[current.front]) {
        layers[current.front] = baseRef.current.trim() || nextSrc;
      }
      layers[back] = nextSrc;
      warmTouchPortrait(nextSrc, 'high');

      const primed: Stack = { front: current.front, layers };
      stackRef.current = primed;

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const settle = () => {
        if (gen !== genRef.current) return;
        const settled: Stack = {
          front: back,
          layers: [layers[0], layers[1]],
        };
        settled.layers[back] = nextSrc;
        /* 반대편도 다음 전환용으로 맞춰 두되, 보이는 장만 next */
        stackRef.current = settled;
        commitSync(() => {
          setStack(settled);
          setSoftRevert(false);
        }, onDone);
      };

      commitSync(() => {
        setSoftRevert(false);
        setStack(primed);
      }, () => {
        if (gen !== genRef.current) return;
        if (reduced) {
          settle();
          return;
        }
        requestAnimationFrame(() => {
          if (gen !== genRef.current) return;
          requestAnimationFrame(() => {
            if (gen !== genRef.current) return;
            setSoftRevert(true);
            softTimerRef.current = setTimeout(() => {
              softTimerRef.current = null;
              settle();
            }, SOFT_MS);
          });
        });
      });
    },
    [clearSoftTimer],
  );

  const hardSwap = useCallback(
    (url: string, onDone?: () => void) => {
      softSwapTo(url, onDone);
    },
    [softSwapTo],
  );

  const softRevertToBase = useCallback(
    (onCleared?: () => void) => {
      const base = baseRef.current.trim();
      if (!base) {
        genRef.current += 1;
        clearSoftTimer();
        targetRef.current = '';
        setSoftRevert(false);
        onCleared?.();
        return;
      }
      softSwapTo(base, () => {
        const settled: Stack = { front: stackRef.current.front, layers: [base, base] };
        stackRef.current = settled;
        targetRef.current = base;
        setStack(settled);
        onCleared?.();
      });
    },
    [clearSoftTimer, softSwapTo],
  );

  const reset = useCallback(
    (src?: string) => {
      genRef.current += 1;
      clearSoftTimer();
      setSoftRevert(false);
      const url = (src ?? baseRef.current).trim();
      if (url) warmTouchPortrait(url, 'high');
      const init: Stack = {
        front: 0,
        layers: url ? [url, url] : ['', ''],
      };
      stackRef.current = init;
      targetRef.current = url;
      setStack(init);
    },
    [clearSoftTimer],
  );

  useEffect(() => {
    const base = baseSrc.trim();
    const prevBase = prevBaseSrcRef.current;
    prevBaseSrcRef.current = base;
    if (!base) return;
    warmTouchPortrait(base, 'high');
    const cur = stackRef.current;
    if (!cur.layers[0] && !cur.layers[1]) {
      reset(base);
      return;
    }
    /* AU/디폴트 기본 일러 변경 → 표정 잔여 버리고 새 기본으로 */
    if (prevBase && prevBase !== base) {
      reset(base);
      return;
    }
    if (cur.layers[0] === cur.layers[1] && cur.layers[0] !== base) {
      reset(base);
    }
  }, [baseSrc, reset]);

  useEffect(() => () => clearSoftTimer(), [clearSoftTimer]);

  return {
    stack,
    softRevert,
    hardSwap,
    softRevertToBase,
    reset,
  };
}
