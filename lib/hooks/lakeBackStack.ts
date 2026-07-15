'use client';

type Layer = {
  id: string;
  onBack: () => void;
};

type LakeRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

const stack: Layer[] = [];
let guardPath: string | null = null;
let guardRouter: LakeRouter | null = null;
let trapPushed = false;
let popListenerInstalled = false;
let gestureListenerInstalled = false;
let gestureFallback: (() => void) | null = null;
let gestureFallbackEnabled = false;

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return !!el.isContentEditable;
}

function normalizePath(path: string) {
  return path.replace(/\/$/, '') || '/';
}

function isStillOnGuardPath() {
  const current = normalizePath(window.location.pathname);
  const guarded = normalizePath(guardPath || '/');
  return current === guarded;
}

function syncHistoryAfterPop() {
  if (stack.length > 0) {
    stayOnGuardPage(true);
    return;
  }
  trapPushed = false;
  if (!isStillOnGuardPath()) return;
  const path = guardPath || '/';
  if (guardRouter) guardRouter.replace(path, { scroll: false });
  window.history.replaceState(null, '', path);
}

function ensureGestureListener() {
  if (gestureListenerInstalled) return;
  gestureListenerInstalled = true;

  function onGestureBack() {
    if (stack.length > 0) {
      const layer = stack.pop()!;
      syncHistoryAfterPop();
      layer.onBack();
      return;
    }
    if (gestureFallbackEnabled && gestureFallback) gestureFallback();
  }

  function triggerMouse(e: MouseEvent) {
    if (e.button !== 3 || isEditableTarget(e.target)) return;
    e.preventDefault();
    onGestureBack();
  }

  function triggerKey(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    if (e.key === 'BrowserBack' || (e.altKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      onGestureBack();
    }
  }

  document.addEventListener('mouseup', triggerMouse);
  document.addEventListener('auxclick', triggerMouse);
  document.addEventListener('keydown', triggerKey);
}

function ensurePopListener() {
  if (popListenerInstalled) return;
  popListenerInstalled = true;
  window.addEventListener('popstate', () => {
    if (stack.length === 0) {
      trapPushed = false;
      return;
    }
    const layer = stack.pop()!;
    syncHistoryAfterPop();
    layer.onBack();
  });
}

function stayOnGuardPage(repushTrap: boolean) {
  if (!isStillOnGuardPath()) return;
  const path = guardPath || '/';
  if (guardRouter) guardRouter.replace(path, { scroll: false });
  if (repushTrap && stack.length > 0) {
    window.history.pushState({ lhLakeBack: true }, '', path);
    trapPushed = true;
  }
}

function ensureTrap() {
  if (trapPushed || stack.length === 0) return;
  ensurePopListener();
  ensureGestureListener();
  const path = guardPath || window.location.pathname;
  window.history.pushState({ lhLakeBack: true }, '', path);
  trapPushed = true;
}

export function lakeBackConfigureGuard(path: string, router: LakeRouter) {
  guardPath = path;
  guardRouter = router;
}

export function lakeBackPush(id: string, onBack: () => void) {
  ensurePopListener();
  ensureGestureListener();
  const idx = stack.findIndex((l) => l.id === id);
  if (idx >= 0) stack.splice(idx, 1);
  stack.push({ id, onBack });
  ensureTrap();
}

export function lakeBackRemove(id: string) {
  const idx = stack.findIndex((l) => l.id === id);
  if (idx < 0) return;
  stack.splice(idx, 1);
  if (stack.length === 0) {
    trapPushed = false;
    // Unmount / route leave must not rewrite URL back to the guard path
    // (e.g. leaving /?p=trpg → /oc used to force replace('/') and blank the page).
    if (!isStillOnGuardPath()) return;
    const path = guardPath || '/';
    if (guardRouter) guardRouter.replace(path, { scroll: false });
    window.history.replaceState(null, '', path);
  }
}

export function lakeBackTrigger() {
  if (stack.length === 0) return;
  const layer = stack.pop()!;
  syncHistoryAfterPop();
  layer.onBack();
}

export function lakeBackSetGestureFallback(handler: (() => void) | null, enabled = true) {
  gestureFallback = handler;
  gestureFallbackEnabled = enabled;
  ensureGestureListener();
}

export function lakeBackClearAll() {
  stack.length = 0;
  trapPushed = false;
}
