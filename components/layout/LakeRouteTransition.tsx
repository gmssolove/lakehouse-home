'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const ARCHIVE_PATHS = new Set(['/', '/oc', '/pair']);

/** OC(1) ↔ Pair(2) — 슬라이드 방향 결정 */
const ARCHIVE_ORDER: Record<string, number> = {
  '/': 0,
  '/oc': 1,
  '/pair': 2,
};

function normalizePath(path: string) {
  return path.replace(/\/$/, '') || '/';
}

function routeDirection(from: string, to: string): 'forward' | 'back' | 'neutral' {
  const a = ARCHIVE_ORDER[from] ?? 0;
  const b = ARCHIVE_ORDER[to] ?? 0;
  if (b > a) return 'forward';
  if (b < a) return 'back';
  return 'neutral';
}

function clearRouteClasses() {
  document.body.classList.remove(
    'lh-route-leaving',
    'lh-route-enter',
    'lh-route-forward',
    'lh-route-back',
  );
  document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
    el.classList.remove('lh-route-panel-leaving');
  });
}

export function LakeRouteTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const pendingDir = useRef<'forward' | 'back' | 'neutral'>('neutral');

  useEffect(() => {
    clearRouteClasses();
    const dir = pendingDir.current;
    pendingDir.current = 'neutral';

    if (dir === 'neutral') return;

    document.body.classList.add('lh-route-enter', dir === 'forward' ? 'lh-route-forward' : 'lh-route-back');
    const id = window.setTimeout(() => {
      document.body.classList.remove('lh-route-enter', 'lh-route-forward', 'lh-route-back');
    }, 900);
    return () => window.clearTimeout(id);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!anchor || anchor.getAttribute('target') || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const nextPath = normalizePath(url.pathname);
      const currentPath = normalizePath(pathname);
      if (nextPath === currentPath) return;

      if (!ARCHIVE_PATHS.has(nextPath) && !ARCHIVE_PATHS.has(currentPath)) return;

      const dir = routeDirection(currentPath, nextPath);
      if (dir === 'neutral') return;

      e.preventDefault();

      pendingDir.current = dir;
      clearRouteClasses();
      document.body.classList.add('lh-route-leaving', dir === 'forward' ? 'lh-route-forward' : 'lh-route-back');

      const panel = document.querySelector('.layout, .main-content.pair-main');
      panel?.classList.add('lh-route-panel-leaving');

      window.setTimeout(() => {
        router.push(`${url.pathname}${url.search}${url.hash}`);
      }, 540);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [pathname, router]);

  return null;
}
