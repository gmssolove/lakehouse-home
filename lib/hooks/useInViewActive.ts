'use client';

import { useEffect, useState, type RefObject } from 'react';

type Options = {
  /** 기본 true — 마운트 직후 한 프레임은 켠 상태로 시작 */
  initial?: boolean;
  rootMargin?: string;
  threshold?: number | number[];
  /** false면 observe 안 함 (편집 모드 등) */
  enabled?: boolean;
};

/**
 * IntersectionObserver — 요소가 뷰포트에 있을 때만 true.
 * GPU blur/먼지/글리프 등 상시 이펙트 게이트용.
 */
export function useInViewActive(
  ref: RefObject<Element | null>,
  options: Options = {},
): boolean {
  const {
    initial = true,
    rootMargin = '64px 0px',
    threshold = [0, 0.05, 0.15],
    enabled = true,
  } = options;
  const [active, setActive] = useState(initial);

  useEffect(() => {
    if (!enabled) {
      setActive(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0);
        setActive(hit);
      },
      { root: null, rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, enabled, threshold]);

  return enabled ? active : true;
}

/** document.visibilityState === 'visible' */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return visible;
}
