'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect } from 'react';
import {
  beginLakeRouteEnter,
  clearLakeRouteClasses,
  consumePendingLakeRouteDir,
  isLakeRouteEnterLocked,
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
      if (!isLakeRouteEnterLocked()) clearLakeRouteClasses();
      return;
    }
    beginLakeRouteEnter(pathname, dir);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.getAttribute('target') || anchor.hasAttribute('download')) return;
      if (anchor.dataset.lakeRoute === 'off') return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      const currentPath = normalizeLakePath(pathname);
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const nextPath = normalizeLakePath(url.pathname);
      if (nextPath === currentPath) return;
      if (!shouldLakeRouteAnimate(currentPath, nextPath)) return;

      e.preventDefault();
      e.stopPropagation();

      const dir = lakeNavigate(router, `${url.pathname}${url.search}${url.hash}`, currentPath);
      void dir;
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname, router]);

  return null;
}
