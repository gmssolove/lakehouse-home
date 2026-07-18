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

/** 상세 딥링크(?c= / view=detail) — 목록 깜빡임 방지를 위해 전환 애니 생략 */
export function isLakeDeepProfileHref(href: string) {
  try {
    const url = new URL(href, 'http://lake.local');
    if (url.searchParams.get('c')) return true;
    if (url.searchParams.get('view') === 'detail') return true;
    return false;
  } catch {
    return /[?&]c=/.test(href) || /[?&]view=detail/.test(href);
  }
}

export function shouldLakeRouteAnimate(from: string, to: string, href?: string) {
  // Verse gate/archive use their own page chrome — don't intercept
  if (VERSE_PATH.test(from) || VERSE_PATH.test(to)) return false;
  // 관련 프로필 바로가기(OC/홈 ↔ TRPG 시나리오)는 전환 애니메이션·딜레이 없이 즉시 이동
  if (TRPG_SCENARIO.test(from) || TRPG_SCENARIO.test(to)) return false;
  // 페어↔OC 상세 딥링크도 즉시 — 목록이 한 프레임 보이던 문제
  if (href && isLakeDeepProfileHref(href)) return false;
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

  // OC ↔ Pair — 아카이브 + 상세 스테이지까지 함께 페이드
  if ((from === '/oc' || from === '/pair') && (to === '/oc' || to === '/pair')) {
    document.querySelector('.layout.oc-archive-layout')?.classList.add('lh-route-panel-leaving');
    document.querySelector('#detail-screen')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.lh-archive-topbar')?.classList.add('lh-route-panel-leaving');
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
  pendingRouteLockUntil = Date.now() + 780;
  window.setTimeout(() => {
    clearLakeRouteClasses();
    resetPendingLakeRouteDir();
  }, 700);
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
  const fullHref = `${url.pathname}${url.search}${url.hash}`;
  if (nextPath === from && url.search === (typeof window !== 'undefined' ? window.location.search : '')) {
    return null;
  }
  /* 같은 path라도 ?c= 딥링크면 push (목록→상세) */
  if (nextPath === from && !url.search) return null;

  if (!shouldLakeRouteAnimate(from, nextPath, fullHref)) {
    router.push(fullHref);
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
  }, 340);

  return dir;
}

let pendingRouteDir: 'forward' | 'back' | 'neutral' = 'neutral';
let pendingRouteLockUntil = 0;

export function setPendingLakeRouteDir(dir: 'forward' | 'back' | 'neutral') {
  pendingRouteDir = dir;
  if (dir !== 'neutral') {
    pendingRouteLockUntil = Date.now() + 780;
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
