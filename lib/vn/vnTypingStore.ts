'use client';

import { useEffect, useSyncExternalStore } from 'react';

type Snap = {
  lineKey: string;
  text: string;
  len: number;
  typing: boolean;
};

let snap: Snap = { lineKey: '', text: '', len: 0, typing: false };
const listeners = new Set<() => void>();
let raf = 0;
let acc = 0;
let last = 0;
let stepMs = 58;
let cancelled = true;

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function setSnap(next: Snap) {
  snap = next;
  emit();
}

function stopLoop() {
  cancelled = true;
  if (raf) {
    window.cancelAnimationFrame(raf);
    raf = 0;
  }
}

function tick(now: number) {
  if (cancelled) return;
  acc += now - last;
  last = now;
  if (acc >= stepMs) {
    const steps = Math.min(snap.text.length - snap.len, Math.floor(acc / stepMs));
    acc -= steps * stepMs;
    const len = snap.len + steps;
    const typing = len < snap.text.length;
    setSnap({ ...snap, len, typing });
    if (!typing) {
      stopLoop();
      return;
    }
  }
  raf = window.requestAnimationFrame(tick);
}

function startLoop() {
  stopLoop();
  if (snap.len >= snap.text.length) {
    if (snap.typing) setSnap({ ...snap, typing: false });
    return;
  }
  cancelled = false;
  acc = 0;
  last = performance.now();
  raf = window.requestAnimationFrame(tick);
}

export function subscribeVnTyping(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getVnTypingSnap() {
  return snap;
}

/** display 문자열 — 글자마다 변경 */
export function getVnTypingDisplay() {
  const s = snap;
  return s.len > 0 ? s.text.slice(0, s.len) : '';
}

/** isTyping 불리언 — 시작/끝에서만 변경 */
export function getVnTypingFlag() {
  return snap.typing;
}

export function skipVnTyping() {
  if (!snap.text) {
    setSnap({ ...snap, len: 0, typing: false });
    stopLoop();
    return;
  }
  stopLoop();
  setSnap({ ...snap, len: snap.text.length, typing: false });
}

/**
 * 줄 타자 시작. 같은 lineKey+text 면 유지.
 * VNEngine 등 상위에서 줄 변경 시 호출 — 배너 대기 중에도 진행(기존과 동일).
 */
export function resetVnTyping(lineKey: string, text: string, narration: boolean) {
  stepMs = narration ? 105 : 58;
  if (snap.lineKey === lineKey && snap.text === text) {
    if (snap.typing && !raf && !cancelled) startLoop();
    return;
  }
  stopLoop();
  const typing = text.length > 0;
  setSnap({ lineKey, text, len: 0, typing });
  if (typing) startLoop();
}

export function useVnTypingDisplay() {
  return useSyncExternalStore(subscribeVnTyping, getVnTypingDisplay, getVnTypingDisplay);
}

export function useVnTypingFlag() {
  return useSyncExternalStore(subscribeVnTyping, getVnTypingFlag, getVnTypingFlag);
}

/** 마운트 동안 타자 구동 — 표시는 구독 훅으로 */
export function useVnTypingDriver(
  active: boolean,
  lineKey: string,
  text: string,
  narration: boolean,
) {
  useEffect(() => {
    if (!active) {
      skipVnTyping();
      return;
    }
    resetVnTyping(lineKey, text, narration);
  }, [active, lineKey, text, narration]);
}
