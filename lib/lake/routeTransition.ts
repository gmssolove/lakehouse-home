import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const TRPG_SCENARIO = /^\/trpg\/[^/]+$/;
const VERSE_PATH = /^\/verse(\/|$)/;
const ARCHIVE = new Set(['/', '/oc', '/pair']);
/** OC↔Pair 는 공유 레이아웃 — soft push 가능 (LeftNav portal 제거됨) */
const ARCHIVE_SOFT = new Set(['/oc', '/pair']);
/** leave 연출 후 hard — 메인↔아카이브 */
const HARD_LEAVE_MS = 280;
/** OC↔Pair soft — 짧은 leave 후 push (딜레이 체감 최소) */
const SOFT_LEAVE_MS = 200;

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
  if (from === '/pair' && TRPG_SCENARIO.test(to)) return 'forward';
  if (TRPG_SCENARIO.test(from) && to === '/pair') return 'back';
  if (from === '/pair' && to === '/oc') return 'back';
  if (from === '/oc' && to === '/pair') return 'forward';

  const a = ARCHIVE_ORDER[from] ?? 0;
  const b = ARCHIVE_ORDER[to] ?? 0;
  if (ARCHIVE.has(from) && ARCHIVE.has(to)) {
    if (b > a) return 'forward';
    if (b < a) return 'back';
  }
  if (ARCHIVE.has(from) && TRPG_SCENARIO.test(to)) return 'forward';
  if (TRPG_SCENARIO.test(from) && ARCHIVE.has(to)) return 'back';
  return 'neutral';
}

export function isLakeDeepProfileHref(href: string) {
  try {
    const url = new URL(href, 'http://lake.local');
    const path = url.pathname.replace(/\/$/, '') || '/';
    if (url.searchParams.get('c')) return true;
    if (url.searchParams.get('view') === 'detail') return true;
    /* 페어 상세 복귀 */
    if (path === '/pair' && url.searchParams.get('p')) return true;
    return false;
  } catch {
    return (
      /[?&]c=/.test(href) ||
      /[?&]view=detail/.test(href) ||
      /\/pair(?:\?|&|#|$).*[?&]p=/.test(href) ||
      /\/pair\?p=/.test(href)
    );
  }
}

/** 아카이브·TRPG 시나리오 간 전환만 패널 leave/enter (베일 없음) */
export function shouldLakeRouteAnimate(from: string, to: string, href?: string) {
  void href;
  if (from === to) return false;
  if (VERSE_PATH.test(from) || VERSE_PATH.test(to)) return false;
  if (ARCHIVE.has(from) && ARCHIVE.has(to)) return true;
  if (ARCHIVE.has(from) && TRPG_SCENARIO.test(to)) return true;
  if (TRPG_SCENARIO.test(from) && (ARCHIVE.has(to) || to === '/')) return true;
  return false;
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

/** React 밖(html)에만 두는 leave 오버레이 — 현재는 사용하지 않음(무한 로딩 방지) */
function showLeaveVeil(dir: 'forward' | 'back') {
  void dir;
  /* 베일은 고착 시 검은 화면이 되므로 만들지 않음 */
  removeLeaveVeil();
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
let navInFlight = false;

const LEAVE_PANEL_SEL =
  '.layout, .main-content.pair-main, .archive-layout, .pair-layout, .trpg-scenario-shell, #page-trpg, #detail-screen, .pair-detail-screen, .layout.layout--home > .content-area, .layout.layout--home .content-block.active';

export function beginLakeRouteLeave(from: string, to: string): 'forward' | 'back' | null {
  const dir = lakeRouteDirection(from, to);
  if (dir === 'neutral') return null;
  const leaveDir: 'forward' | 'back' = dir === 'back' ? 'back' : 'forward';
  clearLakeRouteClasses();
  document.body.classList.add('lh-route-leaving', leaveDir === 'forward' ? 'lh-route-forward' : 'lh-route-back');
  /* 베일 없이 패널만 페이드/슬라이드 */
  showLeaveVeil(leaveDir);
  document.querySelectorAll(LEAVE_PANEL_SEL).forEach((el) => {
    el.classList.add('lh-route-panel-leaving');
  });
  leaveGuardUntil = Date.now() + HARD_LEAVE_MS + 80;
  return leaveDir;
}

export function beginLakeRouteEnter(pathname: string, dir: 'forward' | 'back') {
  clearLakeRouteClasses();
  removeLeaveVeil();
  document.documentElement.classList.add('lh-nav-instant');
  document.body.classList.add('lh-nav-instant');
  document.body.classList.add('lh-route-enter', dir === 'forward' ? 'lh-route-forward' : 'lh-route-back');
  if (TRPG_SCENARIO.test(pathname)) {
    document.body.classList.add('lh-route-trpg-enter');
  }
  pendingRouteLockUntil = Date.now() + 900;
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
  document.body.style.setProperty('opacity', '1');
  window.location.assign(fullHref);
}

function canSoftLakeNavigate(from: string, to: string) {
  return ARCHIVE_SOFT.has(from) && ARCHIVE_SOFT.has(to);
}

function stashDeepPending(url: URL) {
  try {
    const c = url.searchParams.get('c')?.trim();
    const p = url.searchParams.get('p')?.trim();
    if (c) sessionStorage.setItem('lh_pending_oc_c', c);
    else sessionStorage.removeItem('lh_pending_oc_c');
    if (p) sessionStorage.setItem('lh_pending_pair_p', p);
    else sessionStorage.removeItem('lh_pending_pair_p');
  } catch {
    /* ignore */
  }
}

export function consumePendingOcCharId(): string | null {
  try {
    const v = sessionStorage.getItem('lh_pending_oc_c');
    if (v) sessionStorage.removeItem('lh_pending_oc_c');
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function peekPendingOcCharId(): string | null {
  try {
    return sessionStorage.getItem('lh_pending_oc_c')?.trim() || null;
  } catch {
    return null;
  }
}

export function consumePendingPairId(): string | null {
  try {
    const v = sessionStorage.getItem('lh_pending_pair_p');
    if (v) sessionStorage.removeItem('lh_pending_pair_p');
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function peekPendingPairId(): string | null {
  try {
    return sessionStorage.getItem('lh_pending_pair_p')?.trim() || null;
  } catch {
    return null;
  }
}

export function lakeNavigate(
  router: AppRouterInstance,
  href: string,
  currentPath: string,
): 'forward' | 'back' | null {
  if (navInFlight) return null;

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

  const dir = lakeRouteDirection(from, nextPath);
  const deep = isLakeDeepProfileHref(fullHref);

  /*
   * OC ↔ Pair: soft router.push/replace
   * — leave 짧게 → soft 이동 → enter (deep도 enter — cover로 목록 안 보임)
   */
  if (canSoftLakeNavigate(from, nextPath)) {
    stashDeepPending(url);
    document.body.style.setProperty('opacity', '1');

    const leaveDir =
      beginLakeRouteLeave(from, nextPath) ||
      (dir === 'back' || dir === 'forward' ? dir : null);

    const go = () => {
      navInFlight = false;
      /*
       * 복귀(back+deep)는 replace — push 하면
       * pair → oc → pair?p= 스택이 남아 목록에서 뒤로 시 OC↔페어 상세 루프가 난다.
       */
      if (deep && dir === 'back') {
        router.replace(fullHref);
      } else {
        router.push(fullHref);
      }
    };

    if (leaveDir) {
      navInFlight = true;
      navToken += 1;
      const token = navToken;
      /* deep도 enter 재생 — skipEnter 하면 전환감이 사라짐 */
      stashRouteEnter(leaveDir, nextPath, false);
      window.setTimeout(() => {
        if (token !== navToken) return;
        go();
      }, SOFT_LEAVE_MS);
      return leaveDir;
    }

    clearLakeRouteClasses();
    removeLeaveVeil();
    if (dir === 'forward' || dir === 'back') {
      stashRouteEnter(dir, nextPath, false);
    }
    go();
    return dir === 'back' ? 'back' : dir === 'forward' ? 'forward' : null;
  }

  /*
   * soft router.push 금지 (그 외 경로).
   * 홈 LeftNav 등과 겹치면 hard assign.
   */
  const animate = shouldLakeRouteAnimate(from, nextPath, fullHref) && dir !== 'neutral';

  if (animate || deep) {
    const leaveDir =
      beginLakeRouteLeave(from, nextPath) ||
      (dir === 'back' || dir === 'forward' ? dir : null);
    if (leaveDir) {
      navInFlight = true;
      navToken += 1;
      const token = navToken;
      stashDeepPending(url);
      stashRouteEnter(leaveDir, nextPath, deep /* skipEnter */);
      const wait = deep ? Math.min(HARD_LEAVE_MS, 160) : HARD_LEAVE_MS;
      window.setTimeout(() => {
        if (token !== navToken) return;
        flushBgmAndAssign(fullHref);
      }, wait);
      return leaveDir;
    }
  }

  clearLakeRouteClasses();
  resetPendingLakeRouteDir();
  pendingRouteLockUntil = 0;
  leaveGuardUntil = 0;
  document.body.style.setProperty('opacity', '1');
  document.body.classList.remove('lh-route-leaving', 'lh-leaving', 'lh-route-enter');
  document.getElementById(VEIL_ID)?.remove();
  stashDeepPending(url);
  flushBgmAndAssign(fullHref);
  return dir === 'back' ? 'back' : dir === 'forward' ? 'forward' : null;
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

/** leave 베일·클래스가 남아 검은 화면("무한 로딩")이 될 때 강제 복구 */
export function recoverStuckLakeRoute() {
  const veil = document.getElementById(VEIL_ID);
  const leaving = document.body.classList.contains('lh-route-leaving');

  /* 베일은 무조건 제거 — leave 중 hard-nav 가 끊기면 화면이 영구 가려짐 */
  veil?.remove();

  document.body.style.setProperty('opacity', '1');

  if (!veil && !leaving) return;

  /* leave 가드 중이면 연출 유지 */
  if (leaving && isLakeRouteLeaveGuarded()) return;

  navToken += 1;
  navInFlight = false;
  pendingRouteLockUntil = 0;
  leaveGuardUntil = 0;
  pendingRouteDir = 'neutral';
  pendingSkipEnter = false;
  try {
    sessionStorage.removeItem(LAKE_ROUTE_ENTER_KEY);
    sessionStorage.removeItem(LAKE_NAV_INSTANT_KEY);
  } catch {
    /* ignore */
  }
  clearLakeRouteClasses();
  document.documentElement.classList.remove('lh-nav-instant');
  document.body.classList.remove(
    'lh-nav-instant',
    'lh-leaving',
    'lh-route-leaving',
    'lh-route-enter',
    'lh-route-forward',
    'lh-route-back',
    'lh-route-trpg-enter',
  );
  document.body.style.removeProperty('transform');
  document.body.style.removeProperty('filter');
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
    el.classList.remove('lh-route-panel-leaving');
  });
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

/** VN·모달 전용 — 메뉴 portal 과 DOM 형제 분리 */
export function getLakeOverlayRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('lh-overlay-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lh-overlay-root';
    document.documentElement.appendChild(el);
  }
  return el;
}
