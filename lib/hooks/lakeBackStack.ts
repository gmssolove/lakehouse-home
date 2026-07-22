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
let popListenerInstalled = false;
let gestureListenerInstalled = false;
let gestureFallback: (() => void) | null = null;
let gestureFallbackEnabled = false;
let lastBackHandledAt = 0;

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

function claimBackHandle() {
  const now = Date.now();
  if (now - lastBackHandledAt < 400) return false;
  lastBackHandledAt = now;
  return true;
}

function deferLakeBack(fn: () => void) {
  window.setTimeout(fn, 0);
}

function isStillOnGuardPath() {
  return normalizePath(window.location.pathname) === normalizePath(guardPath || '/');
}

/**
 * history.pushState 트랩 금지.
 * Next App Router 가 history 를 패치해서 pushState 하면 navigated 루프·removeChild 레이스가 난다.
 * 마우스/키보드 뒤로·같은 URL popstate 에서만 오버레이를 닫는다.
 */
function invokeTopBack() {
  if (stack.length === 0) {
    if (gestureFallbackEnabled && gestureFallback) gestureFallback();
    return;
  }
  const layer = stack[stack.length - 1]!;
  deferLakeBack(() => layer.onBack());
}

function ensureGestureListener() {
  if (gestureListenerInstalled) return;
  gestureListenerInstalled = true;

  function onGestureBack() {
    if (!claimBackHandle()) return;
    if (stack.length > 0) {
      invokeTopBack();
      return;
    }
    if (gestureFallbackEnabled && gestureFallback) gestureFallback();
  }

  function triggerMouse(e: MouseEvent) {
    if (e.button !== 3 || isEditableTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
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
    if (stack.length === 0) return;

    /* 다른 라우트로 이미 이탈 — onBack 호출 금지 (페이지 unmount 레이스) */
    if (!isStillOnGuardPath()) {
      stack.length = 0;
      return;
    }

    if (!claimBackHandle()) return;
    invokeTopBack();
  });
}

export function lakeBackConfigureGuard(path: string, _router?: LakeRouter) {
  guardPath = path;
}

export function lakeBackPush(id: string, onBack: () => void) {
  ensurePopListener();
  ensureGestureListener();
  const idx = stack.findIndex((l) => l.id === id);
  if (idx >= 0) stack.splice(idx, 1);
  stack.push({ id, onBack });
}

export function lakeBackRemove(id: string) {
  const idx = stack.findIndex((l) => l.id === id);
  if (idx < 0) return;
  stack.splice(idx, 1);
}

export function lakeBackTrigger() {
  if (!claimBackHandle()) return;
  invokeTopBack();
}

export function lakeBackSetGestureFallback(handler: (() => void) | null, enabled = true) {
  gestureFallback = handler;
  gestureFallbackEnabled = enabled;
  ensureGestureListener();
}

export function lakeBackClearAll() {
  stack.length = 0;
}

export function lakeHistoryReplaceQuiet(url: string) {
  try {
    History.prototype.replaceState.call(window.history, null, '', url);
  } catch {
    /* ignore */
  }
}
