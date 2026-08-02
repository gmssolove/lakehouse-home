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
 *
 * 원격 폴링은 채팅이 열려 있을 때만 · 한 명씩 · 느리게 —
 * OC 페이지만 켜 둔 채 전원 load 하면 Worker 503을 유발함.
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
  const remoteInflightRef = useRef(false);

  const enqueueFromThread = useCallback(
    (character: OcCharacter, thread: OcChatThread | null | undefined) => {
      if (!chatOpenRef.current || !thread) return;
      const charId = String(character.id);
      const unread = collectUnreadAssistants(thread);

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

  /** 로컬 캐시만 — 원격 hit 없음. 상세를 연 적 있어 캐시에 pending이 있을 때 배달 */
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
    const timer = window.setInterval(tick, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chatbotChars, deliverDueFromCache]);

  /**
   * 원격 pending — 채팅 오버레이가 열려 있을 때만.
   * 전원 일괄 load 금지 · 한 번에 한 OC · 동시 1요청.
   */
  useEffect(() => {
    if (!chatOpen || !chatbotChars.length) return;
    const vid = getOrCreateChatVisitorId();
    let cancelled = false;

    const syncOne = async (c: OcCharacter) => {
      if (remoteInflightRef.current) return;
      remoteInflightRef.current = true;
      const id = String(c.id);
      try {
        const thread = await loadOcChatThread(id, vid);
        if (cancelled) return;
        const applyAt = thread.pendingBehavior?.applyAt;
        if (applyAt) {
          scheduleOcChatPendingDelivery(
            id,
            vid,
            applyAt,
            c,
            thread.pendingBehavior?.id,
          );
          if (applyAt <= Date.now()) {
            await tryDeliverPendingChat({
              characterId: id,
              visitorId: vid,
              character: c,
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
      if (cancelled || !chatbotChars.length || remoteInflightRef.current) return;
      const i = remoteCursorRef.current % chatbotChars.length;
      remoteCursorRef.current = i + 1;
      const c = chatbotChars[i];
      if (c) void syncOne(c);
    };

    /* 열자마자 전원 돌리지 않음 — 첫 틱만 약간 앞당김 */
    const first = window.setTimeout(tickRemote, 400);
    const timer = window.setInterval(tickRemote, 8_000);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
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
