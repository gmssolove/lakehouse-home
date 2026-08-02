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
  /** 목록 진입 시각 — 이전 미읽음 스팸 없이, 진입 이후 도착분만 토스트 */
  const listWatchAtRef = useRef(0);

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

      const floor = onList ? listWatchAtRef.current - 2_000 : 0;
      const fresh: OcChatNotifyPayload[] = [];
      for (const m of unread) {
        if (onList && m.at < floor) {
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
      listWatchAtRef.current = 0;
      return;
    }
    if (phoneView === 'list') {
      listWatchAtRef.current = Date.now();
      /* 목록 진입 시 조용히 과거 미읽음만 소비 — 이후 도착분이 팝업 대상 */
      const vid = getOrCreateChatVisitorId();
      for (const c of chatbotChars) {
        const id = String(c.id);
        const thread = peekOcChatThreadCache(id, vid);
        const unread = collectUnreadAssistants(thread);
        for (const m of unread) {
          if (m.at < listWatchAtRef.current - 2_000) markNotifiedMessage(id, m.id);
        }
      }
    }
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
    const timer = window.setInterval(tick, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chatbotChars, deliverDueFromCache]);

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

    /* 목록이면 더 자주 — 새 메시지 팝업 타이밍 */
    const intervalMs = phoneView === 'list' ? 2_500 : 3_500;
    const first = window.setTimeout(tickRemote, 200);
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
