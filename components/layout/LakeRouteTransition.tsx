'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect } from 'react';
import {
  beginLakeRouteEnter,
  clearLakeRouteClasses,
  consumePendingLakeRouteDir,
  lakeNavigate,
  normalizeLakePath,
  shouldLakeRouteAnimate,
} from '@/lib/lake/routeTransition';

export function LakeRouteTransition() {
  const router = useRouter();
  const pathname = usePathname();

  /* paint 전에 enter 클래스를 붙여 새 페이지가 한 프레임 확 뜨는 "뚝" 끊김 방지 */
  useLayoutEffect(() => {
    const dir = consumePendingLakeRouteDir();
    if (dir === 'neutral') {
      // lock 중이어도 leaving을 남기면 opacity/pointer-events가 영구 고정됨
      clearLakeRouteClasses();
      return;
    }
    beginLakeRouteEnter(pathname, dir);
  }, [pathname]);

  useEffect(() => {
    // Archive 전환 애니 비활성 — Link 기본 동작 유지. 잔여 leaving만 정리.
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        const nextPath = normalizeLakePath(url.pathname);
        const currentPath = normalizeLakePath(pathname);
        if (nextPath === currentPath) return;
        // 즉시 이동 경로에서도 잔여 전환 클래스 제거
        if (!shouldLakeRouteAnimate(currentPath, nextPath, `${url.pathname}${url.search}`)) {
          clearLakeRouteClasses();
        }
      } catch {
        /* ignore */
      }
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname]);

  return null;
}
