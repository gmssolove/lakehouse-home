import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const ARCHIVE_PATHS = new Set(['/', '/oc', '/pair']);
const TRPG_SCENARIO = /^\/trpg\/[^/]+$/;
const VERSE_PATH = /^\/verse(\/|$)/;

const ARCHIVE_ORDER: Record<string, number> = {
  '/': 0,
  '/oc': 1,
  '/pair': 2,
};

export function normalizeLakePath(path: string) {
  return path.replace(/\/$/, '') || '/';
}

export function lakeRouteDirection(from: string, to: string): 'forward' | 'back' | 'neutral' {
  if (from === '/' && TRPG_SCENARIO.test(to)) return 'forward';
  if (TRPG_SCENARIO.test(from) && to === '/') return 'back';
  if (from === '/oc' && TRPG_SCENARIO.test(to)) return 'forward';
  if (TRPG_SCENARIO.test(from) && to === '/oc') return 'back';

  const a = ARCHIVE_ORDER[from] ?? 0;
  const b = ARCHIVE_ORDER[to] ?? 0;
  if (b > a) return 'forward';
  if (b < a) return 'back';
  return 'neutral';
}

export function shouldLakeRouteAnimate(from: string, to: string) {
  // Verse gate/archive use their own page chrome — don't intercept
  if (VERSE_PATH.test(from) || VERSE_PATH.test(to)) return false;
  if (from === '/' && TRPG_SCENARIO.test(to)) return true;
  if (TRPG_SCENARIO.test(from) && to === '/') return true;
  if (from === '/oc' && TRPG_SCENARIO.test(to)) return true;
  if (TRPG_SCENARIO.test(from) && to === '/oc') return true;
  return ARCHIVE_PATHS.has(from) || ARCHIVE_PATHS.has(to);
}

export function clearLakeRouteClasses() {
  document.body.classList.remove(
    'lh-route-leaving',
    'lh-route-enter',
    'lh-route-forward',
    'lh-route-back',
    'lh-route-trpg-enter',
  );
  document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
    el.classList.remove('lh-route-panel-leaving');
  });
}

export function markLakeLeavingPanel(from: string, to: string) {
  document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
    el.classList.remove('lh-route-panel-leaving');
  });

  if (TRPG_SCENARIO.test(from)) {
    document.querySelector('.trpg-scenario-shell')?.classList.add('lh-route-panel-leaving');
    return;
  }

  if (from === '/oc' && TRPG_SCENARIO.test(to)) {
    document.querySelector('#detail-screen')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.layout.oc-archive-layout')?.classList.add('lh-route-panel-leaving');
    return;
  }

  // OC ↔ Pair — 아카이브 패널 슬라이드
  if ((from === '/oc' || from === '/pair') && (to === '/oc' || to === '/pair')) {
    document.querySelector('.layout.oc-archive-layout')?.classList.add('lh-route-panel-leaving');
    return;
  }

  if (from === '/' && TRPG_SCENARIO.test(to)) {
    document.querySelector('#page-trpg.active')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.layout.layout--home > .right-panel')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.layout.layout--home > .content-area')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.layout.layout--home')?.classList.add('lh-route-panel-leaving');
    return;
  }

  document
    .querySelector('.layout, .main-content.pair-main, .content-area')
    ?.classList.add('lh-route-panel-leaving');
}

export function beginLakeRouteLeave(from: string, to: string): 'forward' | 'back' | null {
  const dir = lakeRouteDirection(from, to);
  if (dir === 'neutral') return null;

  clearLakeRouteClasses();
  document.body.classList.add('lh-route-leaving', dir === 'forward' ? 'lh-route-forward' : 'lh-route-back');
  markLakeLeavingPanel(from, to);
  void document.body.offsetHeight;
  return dir;
}

export function beginLakeRouteEnter(pathname: string, dir: 'forward' | 'back') {
  clearLakeRouteClasses();
  document.body.classList.add('lh-route-enter', dir === 'forward' ? 'lh-route-forward' : 'lh-route-back');
  if (TRPG_SCENARIO.test(pathname)) {
    document.body.classList.add('lh-route-trpg-enter');
  }
  pendingRouteLockUntil = Date.now() + 1000;
  window.setTimeout(() => {
    clearLakeRouteClasses();
    resetPendingLakeRouteDir();
  }, 900);
}

export function lakeNavigate(
  router: AppRouterInstance,
  href: string,
  currentPath: string,
): 'forward' | 'back' | null {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    router.push(href);
    return null;
  }

  const nextPath = normalizeLakePath(url.pathname);
  const from = normalizeLakePath(currentPath);
  if (nextPath === from) return null;

  if (!shouldLakeRouteAnimate(from, nextPath)) {
    router.push(`${url.pathname}${url.search}${url.hash}`);
    return null;
  }

  const dir = beginLakeRouteLeave(from, nextPath);
  if (!dir) {
    router.push(`${url.pathname}${url.search}${url.hash}`);
    return null;
  }

  setPendingLakeRouteDir(dir);

  window.setTimeout(() => {
    router.push(`${url.pathname}${url.search}${url.hash}`);
  }, 480);

  return dir;
}

let pendingRouteDir: 'forward' | 'back' | 'neutral' = 'neutral';
let pendingRouteLockUntil = 0;

export function setPendingLakeRouteDir(dir: 'forward' | 'back' | 'neutral') {
  pendingRouteDir = dir;
  if (dir !== 'neutral') {
    pendingRouteLockUntil = Date.now() + 1000;
  }
}

export function consumePendingLakeRouteDir() {
  const dir = pendingRouteDir;
  if (dir === 'neutral') return 'neutral';
  pendingRouteDir = 'neutral';
  return dir;
}

export function peekPendingLakeRouteDir() {
  return pendingRouteDir;
}

export function resetPendingLakeRouteDir() {
  pendingRouteDir = 'neutral';
}

export function isLakeRouteEnterLocked() {
  return Date.now() < pendingRouteLockUntil;
}
