'use client';

import {
  OcChatNotifyToast,
  buildOcChatNotifyPayload,
  type OcChatNotifyPayload,
} from '@/components/oc/OcChatNotifyToast';
import {
  getOrCreateChatVisitorId,
  loadOcChatThread,
  peekOcChatThreadCache,
  scheduleOcChatPendingDelivery,
  subscribeOcChatThreadCache,
  tryDeliverPendingChat,
  type OcChatThread,
} from '@/lib/oc/ocChat';
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

type Props = {
  characters: OcCharacter[];
  /** 채팅 오버레이가 열려 있을 때만 토스트 (상세 배지는 OcCharacterDetail) */
  chatOpen: boolean;
  /** 스레드를 보고 있는 OC — 이 캐릭터만 알림 음소거 */
  mutedCharacterId?: string | null;
  onOpenCharacter?: (character: OcCharacter) => void;
};

/**
 * 모든 챗봇 OC의 pending 배달 + (채팅 열림 시) 알림.
 * A 상세·목록을 켜 둔 동안 B 메시지/알림이 죽지 않게 함.
 */
export function OcChatAlertHost({
  characters,
  chatOpen,
  mutedCharacterId = null,
  onOpenCharacter,
}: Props) {
  const chatbotChars = useMemo(
    () => characters.filter((c) => c.chatbot?.enabled),
    [characters],
  );
  const [queue, setQueue] = useState<OcChatNotifyPayload[]>([]);
  const openCharRef = useRef<OcCharacter | null>(null);
  const mutedRef = useRef(mutedCharacterId);
  mutedRef.current = mutedCharacterId;
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const bootstrappedRef = useRef(new Set<string>());
  const remoteCursorRef = useRef(0);

  const enqueueFromThread = useCallback(
    (character: OcCharacter, thread: OcChatThread | null | undefined) => {
      if (!chatOpenRef.current || !thread) return;
      const charId = String(character.id);
      const unread = collectUnreadAssistants(thread);

      /*
       * 스레드를 직접 보고 있으면 토스트 없이 읽은 것으로 표시.
       * (목록으로 돌아왔을 때 이미 본 답장이 팝업으로 재등장하지 않게)
       */
      if (mutedRef.current && String(mutedRef.current) === charId) {
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
        if (!bootstrappedRef.current.has(charId)) {
          bootstrappedRef.current.add(charId);
          return [...q, add[add.length - 1]!];
        }
        return [...q, ...add];
      });
    },
    [],
  );

  const scanAllCached = useCallback(() => {
    if (!chatOpenRef.current) return;
    const vid = getOrCreateChatVisitorId();
    for (const c of chatbotChars) {
      enqueueFromThread(c, peekOcChatThreadCache(String(c.id), vid));
    }
  }, [chatbotChars, enqueueFromThread]);

  useEffect(() => {
    if (!mutedCharacterId) return;
    const id = String(mutedCharacterId);
    setQueue((q) => q.filter((x) => String(x.characterId || '') !== id));
  }, [mutedCharacterId]);

  /* 목록으로 나오면( mute 해제 ) 캐시 기준으로 토스트 재스캔 */
  useEffect(() => {
    if (!chatOpen || mutedCharacterId) return;
    scanAllCached();
  }, [chatOpen, mutedCharacterId, scanAllCached]);

  useEffect(() => {
    if (chatOpen) return;
    setQueue([]);
    bootstrappedRef.current = new Set();
  }, [chatOpen]);

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

  /** 로컬 캐시 타이머 — 상세를 안 연 OC도 applyAt이 캐시에 있으면 배달 */
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
    const timer = window.setInterval(tick, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chatbotChars, deliverDueFromCache]);

  /**
   * 원격 pending 폴링 — 캐시에 없는 OC(상세를 안 연 캐릭터)도 배달.
   * 채팅 열림: 빠르게 / 닫힘: 느리게 한 명씩 순회.
   */
  useEffect(() => {
    if (!chatbotChars.length) return;
    const vid = getOrCreateChatVisitorId();
    let cancelled = false;

    const syncOne = async (c: OcCharacter) => {
      const id = String(c.id);
      try {
        const thread = await loadOcChatThread(id, vid);
        if (cancelled) return;
        const applyAt = thread.pendingBehavior?.applyAt;
        if (!applyAt) {
          enqueueFromThread(c, peekOcChatThreadCache(id, vid));
          return;
        }
        scheduleOcChatPendingDelivery(
          id,
          vid,
          applyAt,
          c,
          thread.pendingBehavior?.id,
        );
        if (applyAt <= Date.now()) {
          const added = await tryDeliverPendingChat({
            characterId: id,
            visitorId: vid,
            character: c,
          });
          if (cancelled) return;
          if (added > 0) enqueueFromThread(c, peekOcChatThreadCache(id, vid));
          else enqueueFromThread(c, peekOcChatThreadCache(id, vid));
        } else {
          enqueueFromThread(c, peekOcChatThreadCache(id, vid));
        }
      } catch {
        /* ignore */
      }
    };

    const tickRemote = () => {
      if (cancelled || !chatbotChars.length) return;
      const i = remoteCursorRef.current % chatbotChars.length;
      remoteCursorRef.current = i + 1;
      const c = chatbotChars[i];
      if (c) void syncOne(c);
    };

    /* 채팅 열면 전원 한 바퀴 빠르게 */
    if (chatOpen) {
      void (async () => {
        for (const c of chatbotChars) {
          if (cancelled) return;
          await syncOne(c);
        }
      })();
    }

    const ms = chatOpen ? 2_500 : 10_000;
    const timer = window.setInterval(tickRemote, ms);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chatOpen, chatbotChars, enqueueFromThread]);

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

  if (!chatOpen) return null;

  return (
    <OcChatNotifyToast
      payload={queue[0] ?? null}
      onDone={(id) => setQueue((q) => q.filter((x) => x.id !== id))}
      onOpen={() => {
        const c = openCharRef.current;
        if (c) onOpenCharacter?.(c);
      }}
    />
  );
}
