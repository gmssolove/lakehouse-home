'use client';

import { useEffect, useRef } from 'react';
import { getOrCreateChatVisitorId } from '@/lib/oc/ocChat';
import {
  OC_USER_PRESENCE_HEARTBEAT_MS,
  OC_USER_PRESENCE_IDLE_MS,
  peekOcUserPresenceLocal,
  tickOcUserPresence,
  writeOcUserPresenceLocal,
  type OcUserPresenceSnap,
} from '@/lib/oc/ocChatUserPresence';

type Opts = {
  /** OC 상세(또는 동등한 체류 화면)가 열려 있을 때만 추적 */
  active: boolean;
  viewingCharacterId?: string | null;
};

function postPresence(visitorId: string, snap: OcUserPresenceSnap) {
  writeOcUserPresenceLocal(visitorId, snap);
  void fetch('/api/oc-user-presence', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitorId,
      state: snap.state,
      updatedAt: snap.updatedAt,
      lastActiveAt: snap.lastActiveAt,
      lastHeartbeatAt: snap.lastHeartbeatAt,
      viewingCharacterId: snap.viewingCharacterId,
    }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * OC 상세에 머무는 동안 유저 presence(online/idle/offline)를 heartbeat로 기록.
 */
export function useOcUserPresenceTracker(opts: Opts): void {
  const active = opts.active;
  const viewingCharacterId = opts.viewingCharacterId
    ? String(opts.viewingCharacterId)
    : undefined;
  const snapRef = useRef<OcUserPresenceSnap | null>(null);
  const interactedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vid = getOrCreateChatVisitorId();
    snapRef.current = peekOcUserPresenceLocal(vid);

    const commit = (patch: {
      interacted?: boolean;
      heartbeat?: boolean;
      detailOpen?: boolean;
      tabVisible?: boolean;
    }) => {
      const tabVisible =
        patch.tabVisible ??
        (typeof document !== 'undefined' && document.visibilityState === 'visible');
      const detailOpen = patch.detailOpen ?? active;
      const next = tickOcUserPresence({
        prev: snapRef.current,
        detailOpen,
        tabVisible,
        interacted: patch.interacted,
        heartbeat: patch.heartbeat,
        viewingCharacterId: detailOpen ? viewingCharacterId : undefined,
      });
      const prev = snapRef.current;
      snapRef.current = next;
      const changed =
        !prev ||
        prev.state !== next.state ||
        patch.heartbeat ||
        patch.interacted ||
        prev.viewingCharacterId !== next.viewingCharacterId;
      if (changed) postPresence(vid, next);
    };

    if (!active) {
      commit({ detailOpen: false, tabVisible: true, heartbeat: true });
      return;
    }

    /* 상세 진입 — 즉시 online + heartbeat */
    interactedRef.current = true;
    commit({
      detailOpen: true,
      tabVisible: document.visibilityState === 'visible',
      interacted: true,
      heartbeat: true,
    });
    interactedRef.current = false;

    const onInteract = () => {
      interactedRef.current = true;
    };
    const interactEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'wheel',
      'scroll',
      'touchstart',
    ];
    for (const ev of interactEvents) {
      window.addEventListener(ev, onInteract, { passive: true, capture: true });
    }

    const onVis = () => {
      const visible = document.visibilityState === 'visible';
      if (visible) interactedRef.current = true;
      commit({
        detailOpen: true,
        tabVisible: visible,
        interacted: visible,
        heartbeat: true,
      });
      interactedRef.current = false;
    };
    const onFocus = () => {
      interactedRef.current = true;
      commit({
        detailOpen: true,
        tabVisible: true,
        interacted: true,
        heartbeat: true,
      });
      interactedRef.current = false;
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);

    const heartbeat = window.setInterval(() => {
      const interacted = interactedRef.current;
      interactedRef.current = false;
      commit({
        detailOpen: true,
        tabVisible: document.visibilityState === 'visible',
        interacted,
        heartbeat: true,
      });
    }, OC_USER_PRESENCE_HEARTBEAT_MS);

    /* idle 전이 감지 — heartbeat보다 촘촘히 */
    const idleWatch = window.setInterval(() => {
      commit({
        detailOpen: true,
        tabVisible: document.visibilityState === 'visible',
        interacted: interactedRef.current,
      });
      interactedRef.current = false;
    }, Math.min(60_000, Math.max(15_000, Math.floor(OC_USER_PRESENCE_IDLE_MS / 6))));

    const onPageHide = () => {
      commit({ detailOpen: false, tabVisible: false, heartbeat: true });
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      for (const ev of interactEvents) {
        window.removeEventListener(ev, onInteract, true);
      }
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(heartbeat);
      window.clearInterval(idleWatch);
      commit({ detailOpen: false, tabVisible: true, heartbeat: true });
    };
  }, [active, viewingCharacterId]);
}
