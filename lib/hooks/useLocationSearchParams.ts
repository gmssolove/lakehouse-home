'use client';

import { useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
let patched = false;

function notify() {
  listeners.forEach((l) => l());
}

function ensureHistoryPatch() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const origPush = History.prototype.pushState;
  const origReplace = History.prototype.replaceState;
  History.prototype.pushState = function patchedPush(
    this: History,
    ...args: Parameters<History['pushState']>
  ) {
    const ret = origPush.apply(this, args);
    notify();
    return ret;
  };
  History.prototype.replaceState = function patchedReplace(
    this: History,
    ...args: Parameters<History['replaceState']>
  ) {
    const ret = origReplace.apply(this, args);
    notify();
    return ret;
  };
  window.addEventListener('popstate', notify);
}

function subscribe(cb: Listener) {
  ensureHistoryPatch();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return window.location.search;
}

function getServerSnapshot() {
  return '';
}

/**
 * Next `useSearchParams`는 가까운 Suspense까지 CSR로 비워서
 * 링크를 눌렀을 때 빈 화면이 먼저 나온다. 브라우저 URL만 구독한다.
 */
export function useLocationSearchParams() {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}
