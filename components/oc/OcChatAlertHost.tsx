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

  const enqueueFromThread = useCallback(
    (character: OcCharacter, thread: OcChatThread | null | undefined) => {
      if (!chatOpenRef.current || !thread) return;
      const charId = String(character.id);
      if (mutedRef.current && String(mutedRef.current) === charId) {
        setQueue((q) => q.filter((x) => String(x.characterId || '') !== charId));
        return;
      }
      const unread = collectUnreadAssistants(thread);
      if (!unread.length) {
        /* 읽음 처리됨 — 남은 토스트도 제거 */
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

  useEffect(() => {
    if (!mutedCharacterId) return;
    const id = String(mutedCharacterId);
    setQueue((q) => q.filter((x) => String(x.characterId || '') !== id));
  }, [mutedCharacterId]);

  useEffect(() => {
    if (chatOpen) return;
    setQueue([]);
    bootstrappedRef.current = new Set();
  }, [chatOpen]);

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
      for (const c of chatbotChars) {
        const id = String(c.id);
        const cached = peekOcChatThreadCache(id, vid);
        const applyAt = cached?.pendingBehavior?.applyAt;
        if (!applyAt || applyAt > Date.now()) continue;
        void tryDeliverPendingChat({
          characterId: id,
          visitorId: vid,
          character: c,
        })
          .then((added) => {
            if (cancelled || added <= 0) return;
            enqueueFromThread(c, peekOcChatThreadCache(id, vid));
          })
          .catch(() => {});
      }
    };
    tick();
    const timer = window.setInterval(tick, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chatbotChars, enqueueFromThread]);

  /* 채팅 열릴 때 다른 OC remote pending도 동기화 */
  useEffect(() => {
    if (!chatOpen || !chatbotChars.length) return;
    const vid = getOrCreateChatVisitorId();
    let cancelled = false;
    void (async () => {
      for (const c of chatbotChars) {
        if (cancelled) return;
        const id = String(c.id);
        try {
          const thread = await loadOcChatThread(id, vid);
          if (cancelled) return;
          const applyAt = thread.pendingBehavior?.applyAt;
          if (!applyAt) continue;
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
            if (added > 0) enqueueFromThread(c, peekOcChatThreadCache(id, vid));
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
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
