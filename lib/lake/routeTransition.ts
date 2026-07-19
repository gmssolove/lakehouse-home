import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const TRPG_SCENARIO = /^\/trpg\/[^/]+$/;
const VERSE_PATH = /^\/verse(\/|$)/;
const ARCHIVE = new Set(['/', '/oc', '/pair']);
/** leave 연출 후 hard — 메인→아카이브도 체감되게 */
const HARD_LEAVE_MS = 280;

const ARCHIVE_ORDER: Record<string, number> = {
  '/': 0,
  '/oc': 1,
  '/pair': 2,
};

export const LAKE_ROUTE_ENTER_KEY = 'lh_route_enter';
export const LAKE_NAV_INSTANT_KEY = 'lh_nav_instant';
const VEIL_ID = 'lh-route-veil';

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
  return ARCHIVE.has(from) && ARCHIVE.has(to) && from !== to;
}

function isArchiveTabSwap(from: string, to: string) {
  return (from === '/oc' || from === '/pair') && (to === '/oc' || to === '/pair');
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
  removeLeaveVeil();
}

/** React 밖(html)에만 두는 leave 오버레이 — body portal/레이아웃 DOM을 만지지 않음 */
function showLeaveVeil(dir: 'forward' | 'back') {
  removeLeaveVeil();
  const el = document.createElement('div');
  el.id = VEIL_ID;
  el.className = `lh-route-veil lh-route-veil--${dir}`;
  el.setAttribute('aria-hidden', 'true');
  document.documentElement.appendChild(el);
  void el.offsetWidth;
  el.classList.add('is-on');
}

function removeLeaveVeil() {
  document.getElementById(VEIL_ID)?.remove();
}

export function stashNavInstant() {
  try {
    sessionStorage.setItem(LAKE_NAV_INSTANT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeNavInstant() {
  try {
    if (sessionStorage.getItem(LAKE_NAV_INSTANT_KEY) !== '1') return false;
    sessionStorage.removeItem(LAKE_NAV_INSTANT_KEY);
  } catch {
    return false;
  }
  document.documentElement.classList.add('lh-nav-instant');
  document.body.classList.add('lh-nav-instant');
  window.setTimeout(() => {
    document.documentElement.classList.remove('lh-nav-instant');
    document.body.classList.remove('lh-nav-instant');
  }, 1200);
  return true;
}

let pendingRouteDir: 'forward' | 'back' | 'neutral' = 'neutral';
let pendingRouteLockUntil = 0;
let leaveGuardUntil = 0;
let pendingSkipEnter = false;
let navToken = 0;

export function beginLakeRouteLeave(from: string, to: string): 'forward' | 'back' | null {
  const dir = lakeRouteDirection(from, to);
  if (dir === 'neutral') return null;
  const leaveDir: 'forward' | 'back' = dir === 'back' ? 'back' : 'forward';
  clearLakeRouteClasses();
  document.body.classList.add('lh-route-leaving', leaveDir === 'forward' ? 'lh-route-forward' : 'lh-route-back');
  showLeaveVeil(leaveDir);
  /* hard-nav 직전이라 React reconcile 전에 unload — 패널 leave 클래스 OK */
  document.querySelectorAll('.layout, .main-content.pair-main, .archive-layout').forEach((el) => {
    el.classList.add('lh-route-panel-leaving');
  });
  leaveGuardUntil = Date.now() + HARD_LEAVE_MS + 80;
  return leaveDir;
}

export function beginLakeRouteEnter(pathname: string, dir: 'forward' | 'back') {
  clearLakeRouteClasses();
  document.documentElement.classList.add('lh-nav-instant');
  document.body.classList.add('lh-nav-instant');
  document.body.classList.add('lh-route-enter', dir === 'forward' ? 'lh-route-forward' : 'lh-route-back');
  if (TRPG_SCENARIO.test(pathname)) {
    document.body.classList.add('lh-route-trpg-enter');
  }
  pendingRouteLockUntil = Date.now() + 900;
  /* enter 슬라이드(~480ms) 끝난 뒤에도 카드 등장은 nav-instant로 잠시 더 막음 */
  window.setTimeout(() => {
    document.body.classList.remove('lh-route-enter', 'lh-route-forward', 'lh-route-back', 'lh-route-trpg-enter');
  }, 520);
  window.setTimeout(() => {
    document.documentElement.classList.remove('lh-nav-instant');
    document.body.classList.remove('lh-nav-instant');
    resetPendingLakeRouteDir();
    pendingRouteLockUntil = 0;
  }, 1100);
}

function stashRouteEnter(dir: 'forward' | 'back', path: string, skipEnter = false) {
  try {
    sessionStorage.setItem(
      LAKE_ROUTE_ENTER_KEY,
      JSON.stringify({ dir, path, t: Date.now(), skipEnter }),
    );
  } catch {
    /* ignore */
  }
}

export function consumeStashedRouteEnter(pathname: string): 'forward' | 'back' | 'skip' | null {
  try {
    const raw = sessionStorage.getItem(LAKE_ROUTE_ENTER_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(LAKE_ROUTE_ENTER_KEY);
    const data = JSON.parse(raw) as { dir?: string; path?: string; t?: number; skipEnter?: boolean };
    if (!data?.dir || !data.path || !data.t) return null;
    if (Date.now() - data.t > 8000) return null;
    if (normalizeLakePath(data.path) !== normalizeLakePath(pathname)) return null;
    if (data.skipEnter) return 'skip';
    return data.dir === 'back' ? 'back' : 'forward';
  } catch {
    return null;
  }
}

function flushBgmAndAssign(fullHref: string) {
  try {
    window.dispatchEvent(new Event('lh-before-hard-nav'));
  } catch {
    /* ignore */
  }
  /* leave 클래스·베일 유지한 채 이탈 — 여기서 지우면 leave 연출이 끊김 */
  document.body.style.setProperty('opacity', '1');
  window.location.assign(fullHref);
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
    clearLakeRouteClasses();
    window.location.assign(href);
    return null;
  }

  const nextPath = normalizeLakePath(url.pathname);
  const from = normalizeLakePath(currentPath);
  const fullHref = `${url.pathname}${url.search}${url.hash}`;
  const samePath =
    nextPath === from &&
    url.search === (typeof window !== 'undefined' ? window.location.search : '');

  if (samePath) {
    clearLakeRouteClasses();
    document.body.style.setProperty('opacity', '1');
    return null;
  }

  const animate = shouldLakeRouteAnimate(from, nextPath, fullHref);

  if (animate) {
    const rawDir = lakeRouteDirection(from, nextPath);
    const leaveDir: 'forward' | 'back' = rawDir === 'back' ? 'back' : 'forward';
    const tabSwap = isArchiveTabSwap(from, nextPath);
    const token = ++navToken;

    stashNavInstant();
    stashRouteEnter(leaveDir, nextPath, tabSwap);
    beginLakeRouteLeave(from, nextPath);

    window.setTimeout(() => {
      if (token !== navToken) return;
      flushBgmAndAssign(fullHref);
    }, HARD_LEAVE_MS);
    return leaveDir;
  }

  clearLakeRouteClasses();
  resetPendingLakeRouteDir();
  pendingRouteLockUntil = 0;
  document.body.style.setProperty('opacity', '1');
  router.push(fullHref);
  return null;
}

export function setPendingLakeRouteDir(dir: 'forward' | 'back' | 'neutral') {
  pendingRouteDir = dir;
  if (dir !== 'neutral') {
    pendingRouteLockUntil = Date.now() + 560;
  }
}

export function consumePendingLakeRouteDir(): 'forward' | 'back' | 'neutral' | 'skip' {
  if (pendingSkipEnter) {
    pendingSkipEnter = false;
    pendingRouteDir = 'neutral';
    return 'skip';
  }
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
  pendingSkipEnter = false;
}

export function isLakeRouteEnterLocked() {
  return Date.now() < pendingRouteLockUntil;
}

export function isLakeRouteLeaveGuarded() {
  return Date.now() < leaveGuardUntil;
}

/** 메뉴 등 portal용 — React body 자식과 분리해 removeChild 레이스 방지 */
export function getLakePortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('lh-portal-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lh-portal-root';
    document.documentElement.appendChild(el);
  }
  return el;
}
