'use client';

import {
  OcChatNotifyToast,
  buildOcChatNotifyPayload,
  type OcChatNotifyPayload,
} from '@/components/oc/OcChatNotifyToast';
import {
  completeOcChatReplyInBackground,
  getOrCreateChatVisitorId,
  loadOcChatThread,
  ocChatNeedsReplyToTrailingUsers,
  peekOcChatThreadCache,
  resumeOcChatBackgroundWork,
  scheduleOcChatPendingDelivery,
  subscribeOcChatThreadCache,
  tryDeliverPendingChat,
  type OcChatThread,
} from '@/lib/oc/ocChat';
import {
  clearOcChatReliableTimeout,
  setOcChatReliableTimeout,
} from '@/lib/oc/ocChatReliableTimer';
import { armOcChatNotifySfx } from '@/lib/oc/ocChatNotifySfx';
import {
  armOcChatDesktopNotify,
  requestOcChatDesktopNotifyPermission,
} from '@/lib/oc/ocChatDesktopNotify';
import type { OcCharacter } from '@/lib/types/character';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function collectUnreadAssistants(thread: OcChatThread | null | undefined) {
  if (!thread?.messages?.length) return [] as OcChatThread['messages'];
  const seen = typeof thread.lastSeenAt === 'number' ? thread.lastSeenAt : 0;
  return thread.messages.filter(
    (m) => m.role === 'assistant' && m.kind !== 'narration' && m.at > seen,
  );
}

function notifySeenKey(characterId: string, messageId: string) {
  return `lh_oc_chat_notify:${characterId}:${messageId}`;
}

function hasNotifiedMessage(characterId: string, messageId: string) {
  try {
    return sessionStorage.getItem(notifySeenKey(characterId, messageId)) === '1';
  } catch {
    return false;
  }
}

function markNotifiedMessage(characterId: string, messageId: string) {
  try {
    sessionStorage.setItem(notifySeenKey(characterId, messageId), '1');
  } catch {
    /* ignore */
  }
}

type PhoneView = 'list' | 'thread';

type Props = {
  characters: OcCharacter[];
  /** 채팅 오버레이가 열려 있을 때만 토스트 (상세 배지는 OcCharacterDetail) */
  chatOpen: boolean;
  /** 패널이 보고하는 화면 — 목록이면 절대 mute 하지 않음 */
  phoneView?: PhoneView;
  /** 스레드를 보고 있는 OC — phoneView==='thread' 일 때만 적용 */
  mutedCharacterId?: string | null;
  onOpenCharacter?: (character: OcCharacter) => void;
};

/**
 * 모든 챗봇 OC의 pending 배달 + (채팅 열림 시) 알림.
 * 목록만 띄운 상태에서도 새 메시지 토스트가 뜨게 함.
 */
export function OcChatAlertHost({
  characters,
  chatOpen,
  phoneView = 'thread',
  mutedCharacterId = null,
  onOpenCharacter,
}: Props) {
  const chatbotChars = useMemo(
    () => characters.filter((c) => c.chatbot?.enabled),
    [characters],
  );
  const [queue, setQueue] = useState<OcChatNotifyPayload[]>([]);
  const openCharRef = useRef<OcCharacter | null>(null);
  const phoneViewRef = useRef(phoneView);
  phoneViewRef.current = phoneView;
  const mutedRef = useRef(mutedCharacterId);
  mutedRef.current = mutedCharacterId;
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const bootstrappedRef = useRef(new Set<string>());
  const remoteCursorRef = useRef(0);
  const remoteInflightRef = useRef(false);
  /**
   * 목록 진입 시점에 이미 있던 미읽음 id — 시간(floor) 대신 id로 스팸 차단.
   * (characters 리렌더로 listWatchAt이 리셋되며 새 도착분을 삼키던 버그 방지)
   */
  const listBaselineIdsRef = useRef(new Set<string>());
  const wasOnListRef = useRef(false);

  const effectiveMutedId = useCallback((): string | null => {
    /* 목록 화면에서는 mute 금지 (부모 state 한 박자 지연 대비) */
    if (phoneViewRef.current === 'list') return null;
    return mutedRef.current ? String(mutedRef.current) : null;
  }, []);

  const enqueueFromThread = useCallback(
    (character: OcCharacter, thread: OcChatThread | null | undefined) => {
      if (!chatOpenRef.current || !thread) return;
      const charId = String(character.id);
      const unread = collectUnreadAssistants(thread);
      const mutedId = effectiveMutedId();
      const onList = phoneViewRef.current === 'list';

      if (mutedId && mutedId === charId) {
        for (const m of unread) markNotifiedMessage(charId, m.id);
        bootstrappedRef.current.add(charId);
        setQueue((q) => q.filter((x) => String(x.characterId || '') !== charId));
        return;
      }

      if (!unread.length) {
        setQueue((q) => q.filter((x) => String(x.characterId || '') !== charId));
        return;
      }

      const fresh: OcChatNotifyPayload[] = [];
      for (const m of unread) {
        if (onList && listBaselineIdsRef.current.has(`${charId}:${m.id}`)) {
          /* 목록 진입 전 미읽음 — 팝업 없이 소비 */
          markNotifiedMessage(charId, m.id);
          continue;
        }
        if (hasNotifiedMessage(charId, m.id)) continue;
        markNotifiedMessage(charId, m.id);
        fresh.push(buildOcChatNotifyPayload(character, m, thread.messages));
      }
      if (!fresh.length) return;
      openCharRef.current = character;
      setQueue((q) => {
        const seen = new Set(q.map((x) => x.id));
        const add = fresh.filter((x) => !seen.has(x.id));
        if (!add.length) return q;
        /*
         * 목록에서는 bootstrap 으로 최신 1개만 남기지 않음 —
         * 새 도착분은 모두 큐에 올려 팝업이 뜨게.
         */
        if (onList) return [...q, ...add];
        if (!bootstrappedRef.current.has(charId)) {
          bootstrappedRef.current.add(charId);
          return [...q, add[add.length - 1]!];
        }
        return [...q, ...add];
      });
    },
    [effectiveMutedId],
  );

  useEffect(() => {
    if (!chatOpen) {
      setQueue([]);
      bootstrappedRef.current = new Set();
      listBaselineIdsRef.current = new Set();
      wasOnListRef.current = false;
      return;
    }
    armOcChatNotifySfx();
    requestOcChatDesktopNotifyPermission();
    armOcChatDesktopNotify();
    const onList = phoneView === 'list';
    const enteredList = onList && !wasOnListRef.current;
    wasOnListRef.current = onList;
    if (!enteredList) return;

    /* 목록으로 막 들어왔을 때만 baseline 스냅샷 — chars 리렌더로 리셋하지 않음 */
    const vid = getOrCreateChatVisitorId();
    const baseline = new Set<string>();
    for (const c of chatbotChars) {
      const id = String(c.id);
      const thread = peekOcChatThreadCache(id, vid);
      for (const m of collectUnreadAssistants(thread)) {
        baseline.add(`${id}:${m.id}`);
        markNotifiedMessage(id, m.id);
      }
    }
    listBaselineIdsRef.current = baseline;
  }, [chatOpen, phoneView, chatbotChars]);

  useEffect(() => {
    if (phoneView !== 'thread' || !mutedCharacterId) return;
    const id = String(mutedCharacterId);
    setQueue((q) => q.filter((x) => String(x.characterId || '') !== id));
  }, [mutedCharacterId, phoneView]);

  const deliverDueFromCache = useCallback(
    (c: OcCharacter, vid: string) => {
      const id = String(c.id);
      const cached = peekOcChatThreadCache(id, vid);
      const applyAt = cached?.pendingBehavior?.applyAt;
      if (!applyAt || applyAt > Date.now()) return;
      void tryDeliverPendingChat({
        characterId: id,
        visitorId: vid,
        character: c,
      })
        .then((added) => {
          if (added <= 0) return;
          enqueueFromThread(c, peekOcChatThreadCache(id, vid));
        })
        .catch(() => {});
    },
    [enqueueFromThread],
  );

  useEffect(() => {
    if (!chatbotChars.length) return;
    const vid = getOrCreateChatVisitorId();
    let cancelled = false;

    for (const c of chatbotChars) {
      const id = String(c.id);
      const cached = peekOcChatThreadCache(id, vid);
      if (cached?.pendingBehavior?.applyAt) {
        scheduleOcChatPendingDelivery(
          id,
          vid,
          cached.pendingBehavior.applyAt,
          c,
          cached.pendingBehavior.id,
        );
      }
    }

    const tick = () => {
      if (cancelled) return;
      for (const c of chatbotChars) deliverDueFromCache(c, vid);
    };
    tick();
    /* Worker 타이머 체인 — 숨은 탭에서 setInterval throttle 회피 */
    let dueHandle = 0;
    const armDue = () => {
      dueHandle = setOcChatReliableTimeout(() => {
        tick();
        if (!cancelled) armDue();
      }, 1_500);
    };
    armDue();

    /* pending 없이 미응답만 남은 OC — 수 초마다 백그라운드 flush (숨은 탭도 유지) */
    let stuckHandle = 0;
    const armStuck = () => {
      stuckHandle = setOcChatReliableTimeout(() => {
        if (!cancelled && chatOpenRef.current) {
          for (const c of chatbotChars) {
            const id = String(c.id);
            const t = peekOcChatThreadCache(id, vid);
            if (!t) continue;
            if (!ocChatNeedsReplyToTrailingUsers(t.messages, t.pendingBehavior)) continue;
            void completeOcChatReplyInBackground({
              characterId: id,
              visitorId: vid,
              character: c,
            }).catch(() => {});
          }
        }
        if (!cancelled) armStuck();
      }, 8_000);
    };
    armStuck();

    return () => {
      cancelled = true;
      clearOcChatReliableTimeout(dueHandle);
      clearOcChatReliableTimeout(stuckHandle);
    };
  }, [chatbotChars, deliverDueFromCache]);

  /* 탭/창 다시 보이면 즉시 배달·미응답 복구 (백그라운드 timer throttle 보정) */
  useEffect(() => {
    if (!chatbotChars.length) return;
    const vid = getOrCreateChatVisitorId();
    let running = false;
    let wasHidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';

    const run = (reconcileRemote: boolean) => {
      if (running) return;
      running = true;
      void resumeOcChatBackgroundWork({
        characters: chatbotChars,
        visitorId: vid,
        reconcileRemote,
      })
        .then(() => {
          for (const c of chatbotChars) {
            enqueueFromThread(c, peekOcChatThreadCache(String(c.id), vid));
          }
          if (chatOpenRef.current) armOcChatNotifySfx();
        })
        .finally(() => {
          running = false;
        });
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
        return;
      }
      if (!wasHidden) return;
      wasHidden = false;
      run(true);
    };

    document.addEventListener('visibilitychange', onVis);
    /* 마운트: 로컬 due·미응답만 (전 OC remote는 503 유발) */
    run(false);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [chatbotChars, enqueueFromThread]);

  useEffect(() => {
    if (!chatOpen || !chatbotChars.length) return;
    const vid = getOrCreateChatVisitorId();
    let cancelled = false;

    const pickNext = (): OcCharacter | null => {
      const muted = effectiveMutedId() || '';
      const others = chatbotChars.filter((c) => String(c.id) !== muted);
      const pool = others.length ? others : chatbotChars;

      const due = pool.filter((c) => {
        const p = peekOcChatThreadCache(String(c.id), vid)?.pendingBehavior;
        return Boolean(p && (p.applyAt || 0) <= Date.now());
      });
      if (due.length) {
        const i = remoteCursorRef.current % due.length;
        remoteCursorRef.current = i + 1;
        return due[i] ?? null;
      }

      /* due 없으면 원격 폴링 빈도 낮춤 — 캐시 있는 OC만 가끔 확인 */
      const cached = pool.filter((c) => Boolean(peekOcChatThreadCache(String(c.id), vid)));
      const use = cached.length ? cached : pool;
      const i = remoteCursorRef.current % use.length;
      remoteCursorRef.current = i + 1;
      return use[i] ?? null;
    };

    const syncOne = async (c: OcCharacter) => {
      if (remoteInflightRef.current) return;
      remoteInflightRef.current = true;
      const id = String(c.id);
      try {
        const loaded = await Promise.race([
          loadOcChatThread(id, vid),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 6_000);
          }),
        ]);
        if (cancelled || !loaded) return;
        const applyAt = loaded.pendingBehavior?.applyAt;
        if (applyAt) {
          scheduleOcChatPendingDelivery(
            id,
            vid,
            applyAt,
            c,
            loaded.pendingBehavior?.id,
          );
          if (applyAt <= Date.now()) {
            await tryDeliverPendingChat({
              characterId: id,
              visitorId: vid,
              character: c,
              reconcileRemote: true,
            });
          }
        }
        if (!cancelled) enqueueFromThread(c, peekOcChatThreadCache(id, vid));
      } catch {
        /* ignore */
      } finally {
        remoteInflightRef.current = false;
      }
    };

    const tickRemote = () => {
      if (cancelled || remoteInflightRef.current) return;
      const c = pickNext();
      if (c) void syncOne(c);
    };

    /* 목록·스레드 느리게 — Worker 과부하(503) 방지. 숨은 탭에서도 폴링 유지 */
    const intervalMs = phoneView === 'list' ? 12_000 : 18_000;
    const first = window.setTimeout(tickRemote, 1_200);
    const timer = window.setInterval(tickRemote, intervalMs);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [chatOpen, chatbotChars, enqueueFromThread, effectiveMutedId, phoneView]);

  useEffect(() => {
    const vid = getOrCreateChatVisitorId();
    const byId = new Map(chatbotChars.map((c) => [String(c.id), c]));
    return subscribeOcChatThreadCache((characterId, visitorId, thread) => {
      if (visitorId !== vid) return;
      const c = byId.get(String(characterId));
      if (!c) return;
      enqueueFromThread(c, thread);
    });
  }, [chatbotChars, enqueueFromThread]);

  /* 숨은 탭에서 배달된 토스트 — 다시 보일 때 큐가 비어 있지 않으면 SFX 재무장 */
  useEffect(() => {
    if (!chatOpen) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') armOcChatNotifySfx();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [chatOpen]);

  if (!chatOpen) return null;

  return (
    <OcChatNotifyToast
      payload={queue[0] ?? null}
      onDone={(id) => setQueue((q) => q.filter((x) => x.id !== id))}
      onOpen={(payload) => {
        const id = payload.characterId ? String(payload.characterId) : '';
        const c =
          (id && chatbotChars.find((x) => String(x.id) === id)) ||
          (id && characters.find((x) => String(x.id) === id)) ||
          openCharRef.current;
        if (c) onOpenCharacter?.(c);
      }}
    />
  );
}
