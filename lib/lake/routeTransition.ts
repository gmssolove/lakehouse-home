import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const TRPG_SCENARIO = /^\/trpg\/[^/]+$/;
const VERSE_PATH = /^\/verse(\/|$)/;
const ARCHIVE = new Set(['/', '/oc', '/pair']);
const LEAVE_MS = 340;
const SOFT_NAV_FALLBACK_MS = 900;

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
  if (VERSE_PATH.test(from) || VERSE_PATH.test(to)) return false;
  if (TRPG_SCENARIO.test(from) || TRPG_SCENARIO.test(to)) return false;
  if (href && isLakeDeepProfileHref(href)) return false;
  /* 홈 ↔ OC ↔ Pair 만 leave/enter (BGM 유지용 soft-nav와 맞춤) */
  return ARCHIVE.has(from) && ARCHIVE.has(to) && from !== to;
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

  /* 아카이브 상호 이동 — 레이아웃·상단바·상세까지 */
  if (ARCHIVE.has(from) && ARCHIVE.has(to)) {
    document.querySelector('.layout.layout--home')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.layout.oc-archive-layout')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.main-content.pair-main')?.classList.add('lh-route-panel-leaving');
    document.querySelector('#detail-screen')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.lh-archive-topbar')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.layout.layout--home > .right-panel')?.classList.add('lh-route-panel-leaving');
    document.querySelector('.layout.layout--home > .content-area')?.classList.add('lh-route-panel-leaving');
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

let navSeq = 0;

export function lakeNavigate(
  router: AppRouterInstance,
  href: string,
  currentPath: string,
): 'forward' | 'back' | null {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    clearLakeRouteClasses();
    window.location.assign(href);
    return null;
  }

  const nextPath = normalizeLakePath(url.pathname);
  const from = normalizeLakePath(currentPath);
  const fullHref = `${url.pathname}${url.search}${url.hash}`;
  if (nextPath === from && url.search === (typeof window !== 'undefined' ? window.location.search : '')) {
    return null;
  }
  if (nextPath === from && !url.search) return null;

  const animate = shouldLakeRouteAnimate(from, nextPath, fullHref);
  const seq = ++navSeq;

  if (animate) {
    const dir = beginLakeRouteLeave(from, nextPath) ?? lakeRouteDirection(from, nextPath);
    const leaveDir: 'forward' | 'back' = dir === 'back' ? 'back' : 'forward';
    setPendingLakeRouteDir(leaveDir);

    window.setTimeout(() => {
      if (seq !== navSeq) return;
      try {
        router.push(fullHref);
      } catch {
        clearLakeRouteClasses();
        window.location.assign(fullHref);
        return;
      }
      /* OpenNext soft-nav 실패 시 hard fallback — BGM은 잃지만 먹통은 방지 */
      window.setTimeout(() => {
        if (seq !== navSeq) return;
        const now = normalizeLakePath(window.location.pathname);
        if (now !== nextPath) {
          clearLakeRouteClasses();
          resetPendingLakeRouteDir();
          window.location.assign(fullHref);
          return;
        }
        /* 도착했는데 leaving이 남으면 정리 (enter가 안 탄 경우) */
        if (document.body.classList.contains('lh-route-leaving')) {
          clearLakeRouteClasses();
        }
      }, SOFT_NAV_FALLBACK_MS);
    }, LEAVE_MS);

    return leaveDir;
  }

  clearLakeRouteClasses();
  resetPendingLakeRouteDir();
  pendingRouteLockUntil = 0;
  router.push(fullHref);
  return null;
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
