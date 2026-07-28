'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Fragment, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import {
  clampAffection,
  computeNeglectDecay,
  episodeStartSceneId,
  findEpisodeScene,
  FREE_DAILY_GAIN_CAP,
  FREE_DAILY_LOSS_CAP,
  needsStoryMode,
  isChatClosedNow,
  nextClosedUntil,
  resolveAffinityTier,
  resolveStartEpisode,
  todayKeyLocal,
} from '@/lib/oc/ocChatAffinity';
import {
  delayKindToMs,
  hoursSince,
  looksLikeBehaviorDump,
  splitBubbleGapMs,
  typingDurationMs,
  type OcChatBehavior,
  type OcChatPendingBehavior,
  type OcChatTypingEvent,
} from '@/lib/oc/ocChatBehavior';
import {
  checkChatBanned,
  chatBanUserMessage,
} from '@/lib/oc/ocChatSafety';
import { resolveOcChatPointStyle } from '@/lib/oc/characterTheme';
import {
  behaviorToPending,
  computePendingApplyAt,
  createChatMessage,
  chatDayKey,
  formatChatClock,
  formatChatDayLabel,
  getOrCreateChatVisitorId,
  isChatClusterMate,
  lastMessageAt,
  loadOcChatThread,
  markUserMessagesRead,
  OC_CHAT_SEND_DEBOUNCE_MS,
  extractLateUserMessages,
  countTrailingUserBurst,
  postOcChat,
  resetOcChatThreadForVisitor,
  saveOcChatThread,
  sleepMs,
  tryDeliverPendingChat,
  type OcChatMessage,
  type OcChatStoryState,
  type OcChatThread,
} from '@/lib/oc/ocChat';
import {
  appendRecentAction,
  rollAmbientPresence,
  type OcChatPresence,
  type OcChatRecentAction,
} from '@/lib/oc/ocChatPresence';
import { defaultChatGreeting, resolveChatAvatarUrl } from '@/lib/oc/ocChatPrompt';
import { resolveSticker } from '@/lib/oc/ocChatStickers';
import type { OcChatEpisode, OcChatEpisodeChoice, OcCharacter } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';

type Props = {
  open: boolean;
  character: OcCharacter;
  onClose: () => void;
};

const STORY_AUTO_MS = 720;

type MetaState = {
  moodNote?: string;
  turnsToday: number;
  closedForToday: boolean;
  /** 이 시각까지 응답 잠금 */
  closedUntil?: number;
  pendingBehavior?: OcChatPendingBehavior;
  lastProactiveDate?: string;
  freeLossToday: number;
  recentDeltaReasons: string[];
  lastInteractionAt?: number;
  neglectCheckedAt?: number;
  presence: OcChatPresence;
  presenceUpdatedAt?: number;
  recentActions: OcChatRecentAction[];
};

function withEndForTodayLock(meta: MetaState): MetaState {
  const closedUntil = nextClosedUntil();
  return {
    ...meta,
    closedForToday: true,
    closedUntil,
  };
}

function withChatUnlocked(meta: MetaState): MetaState {
  return {
    ...meta,
    closedForToday: false,
    closedUntil: undefined,
  };
}

function closedFieldsFromUntil(closedUntil?: number | null): Pick<
  MetaState,
  'closedForToday' | 'closedUntil'
> {
  const until = isChatClosedNow(closedUntil) ? Number(closedUntil) : undefined;
  return {
    closedUntil: until,
    closedForToday: Boolean(until),
  };
}

function resolveSceneReadAction(
  scene: NonNullable<ReturnType<typeof findEpisodeScene>>,
): 'keepUnread' | 'markRead' {
  if (scene.readAction === 'keepUnread' || scene.readAction === 'markRead') {
    return scene.readAction;
  }
  if (scene.speaker === 'char' && scene.text.trim()) return 'markRead';
  return 'keepUnread';
}

function chatRelationTitle(name: string) {
  const n = name.trim() || '캐릭터';
  const code = n.charCodeAt(n.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const batchim = (code - 0xac00) % 28 !== 0;
    return `${n}${batchim ? '과의' : '와의'} 관계`;
  }
  return `${n}와의 관계`;
}

export function OcChatPanel({ open, character, onClose }: Props) {
  const { confirm, alert } = useLakeDialog();
  const [messages, setMessages] = useState<OcChatMessage[]>([]);
  const [affection, setAffection] = useState(0);
  const [story, setStory] = useState<OcChatStoryState | undefined>();
  const [freeGainToday, setFreeGainToday] = useState(0);
  const [freeGainDate, setFreeGainDate] = useState(todayKeyLocal());
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [meta, setMeta] = useState<MetaState>({
    turnsToday: 0,
    closedForToday: false,
    closedUntil: undefined,
    freeLossToday: 0,
    recentDeltaReasons: [],
    presence: 'offline',
    recentActions: [],
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitingRead, setWaitingRead] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  const [error, setError] = useState('');
  const [affToast, setAffToast] = useState<{ delta: number } | null>(null);
  const [panelAnim, setPanelAnim] = useState<'in' | 'out' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [relationAnim, setRelationAnim] = useState<'in' | 'out' | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const affToastTimer = useRef(0);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visitorRef = useRef('');
  const revealedRef = useRef<Set<string>>(new Set());
  const storyTimer = useRef(0);
  const debounceTimer = useRef(0);
  const flushLockRef = useRef(false);
  const pendingFlushRef = useRef(false);
  /** 마지막 유저 전송 시각 — trailing debounce 기준 */
  const lastUserSendAtRef = useRef(0);
  /** 이번 flush가 API에 넣은 메시지 id — 도중 연타는 late로 분리 */
  const flushIncludedIdsRef = useRef<Set<string>>(new Set());
  const openRef = useRef(open);
  const replyLockRef = useRef(false);
  const stateRef = useRef({
    messages: [] as OcChatMessage[],
    affection: 0,
    story: undefined as OcChatStoryState | undefined,
    freeGainToday: 0,
    freeGainDate: todayKeyLocal(),
    lastSeenAt: 0,
    meta: {
      turnsToday: 0,
      closedForToday: false,
      closedUntil: undefined,
      freeLossToday: 0,
      recentDeltaReasons: [],
      presence: 'offline' as OcChatPresence,
      recentActions: [] as OcChatRecentAction[],
    } as MetaState,
  });
  const charId = String(character.id);
  const chatAvatar = resolveChatAvatarUrl(character);

  openRef.current = open;
  stateRef.current = {
    messages,
    affection,
    story,
    freeGainToday,
    freeGainDate,
    lastSeenAt,
    meta,
  };

  const flashAffectionToast = useCallback((delta: number) => {
    if (!delta) return;
    setAffToast({ delta });
    window.clearTimeout(affToastTimer.current);
    affToastTimer.current = window.setTimeout(() => setAffToast(null), 2000);
  }, []);

  const startEpisode = useMemo(
    () => resolveStartEpisode(character.chatbot),
    [character.chatbot],
  );
  const inStory = needsStoryMode(character, story?.completedEpisodeIds);
  const affinityTier = resolveAffinityTier(affection, character.chatbot);
  const activeEpisode: OcChatEpisode | null =
    inStory && startEpisode ? startEpisode : null;
  const activeScene =
    activeEpisode && story?.sceneId
      ? findEpisodeScene(activeEpisode, story.sceneId)
      : null;
  const choices = (activeScene?.choices || []).filter((c) => c.text?.trim());

  const scrollToEnd = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const resetMyChat = useCallback(async () => {
    if (resetting || busy || waitingRead) return;
    setMenuOpen(false);
    const who = (character.name || '').trim() || '이 캐릭터';
    const ok = await confirm(
      `${who}와의 내 채팅 기록·호감·스토리 진행을 삭제합니다.\n다른 사람 대화에는 영향 없습니다.\n되돌릴 수 없습니다.`,
      '채팅 초기화',
    );
    if (!ok) return;
    setResetting(true);
    setError('');
    try {
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      visitorRef.current = vid;
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = 0;
      window.clearTimeout(storyTimer.current);
      replyLockRef.current = false;
      flushLockRef.current = false;
      await resetOcChatThreadForVisitor(charId, vid);

      const emptyMeta: MetaState = {
        turnsToday: 0,
        closedForToday: false,
        closedUntil: undefined,
        freeLossToday: 0,
        recentDeltaReasons: [],
        presence: rollAmbientPresence(),
        presenceUpdatedAt: Date.now(),
        recentActions: [],
      };
      revealedRef.current = new Set();
      setAffection(0);
      setStory(undefined);
      setFreeGainToday(0);
      setFreeGainDate(todayKeyLocal());
      setLastSeenAt(0);
      setMeta(emptyMeta);
      setAwaitingChoice(false);
      setWaitingRead(false);
      setBusy(false);
      setInput('');
      setRelationAnim(null);

      const ep = resolveStartEpisode(character.chatbot);
      let nextMessages: OcChatMessage[] = [];
      let nextStory: OcChatStoryState | undefined;
      if (ep && needsStoryMode(character, [])) {
        const startId = episodeStartSceneId(ep);
        nextStory = {
          episodeId: ep.id,
          sceneId: startId || '',
          completedEpisodeIds: [],
        };
        setStory(nextStory);
      } else {
        const greeting = defaultChatGreeting(character);
        if (greeting) {
          nextMessages = [createChatMessage('assistant', greeting, 'chat')];
        }
      }
      setMessages(nextMessages);
      stateRef.current = {
        messages: nextMessages,
        affection: 0,
        story: nextStory,
        freeGainToday: 0,
        freeGainDate: todayKeyLocal(),
        lastSeenAt: 0,
        meta: emptyMeta,
      };
      await saveOcChatThread(charId, vid, {
        messages: nextMessages,
        updatedAt: Date.now(),
        affection: 0,
        story: nextStory,
        freeGainDate: todayKeyLocal(),
        freeGainToday: 0,
        freeLossToday: 0,
        closedForToday: false,
        closedDate: undefined,
        closedUntil: undefined,
        presence: emptyMeta.presence,
        presenceUpdatedAt: emptyMeta.presenceUpdatedAt,
        recentActions: [],
        lastInteractionAt: undefined,
        pendingBehavior: undefined,
      });
      await alert('채팅을 초기화했습니다.', '완료');
      focusComposer();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '초기화에 실패했습니다';
      setError(msg);
      await alert(msg, '오류');
    } finally {
      setResetting(false);
    }
  }, [
    alert,
    busy,
    character,
    charId,
    confirm,
    focusComposer,
    resetting,
    waitingRead,
  ]);

  useEffect(() => {
    if (!open) {
      setMenuOpen(false);
      setRelationAnim(null);
    }
  }, [open]);

  useEffect(() => {
    if (relationAnim !== 'out') return;
    const t = window.setTimeout(() => setRelationAnim(null), 220);
    return () => window.clearTimeout(t);
  }, [relationAnim]);

  const openRelation = useCallback(() => {
    setMenuOpen(false);
    setRelationAnim('out');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setRelationAnim('in'));
    });
  }, []);

  const closeRelation = useCallback(() => {
    setRelationAnim((cur) => (cur === 'in' ? 'out' : cur));
  }, []);

  useEffect(() => {
    if (!menuOpen && relationAnim !== 'in') return;
    const onDoc = (e: MouseEvent) => {
      if (!menuOpen) return;
      const el = menuWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (relationAnim === 'in') {
        closeRelation();
        return;
      }
      if (menuOpen) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [closeRelation, menuOpen, relationAnim]);

  const persistSnapshot = useCallback(
    async (snap: {
      messages: OcChatMessage[];
      affection: number;
      story?: OcChatStoryState;
      freeGainToday?: number;
      freeGainDate?: string;
      lastSeenAt?: number;
      meta?: Partial<MetaState>;
      skipSeen?: boolean;
    }) => {
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      const seen =
        snap.skipSeen
          ? snap.lastSeenAt ?? stateRef.current.lastSeenAt
          : openRef.current
            ? Date.now()
            : (snap.lastSeenAt ?? stateRef.current.lastSeenAt);
      if (!snap.skipSeen && openRef.current) {
        setLastSeenAt(seen);
      }
      const today = todayKeyLocal();
      const mergedMeta: MetaState = {
        ...stateRef.current.meta,
        ...snap.meta,
      };
      if (snap.meta) setMeta(mergedMeta);
      const closed = closedFieldsFromUntil(mergedMeta.closedUntil);
      const next: OcChatThread = {
        messages: snap.messages,
        updatedAt: Date.now(),
        affection: clampAffection(snap.affection),
        story: snap.story,
        freeGainDate: snap.freeGainDate ?? stateRef.current.freeGainDate,
        freeGainToday: snap.freeGainToday ?? stateRef.current.freeGainToday,
        freeLossToday: mergedMeta.freeLossToday,
        lastSeenAt: seen || undefined,
        moodNote: mergedMeta.moodNote,
        moodDate: mergedMeta.moodNote ? today : undefined,
        turnsToday: mergedMeta.turnsToday,
        turnsDate: today,
        closedForToday: closed.closedForToday,
        closedDate: undefined,
        closedUntil: closed.closedUntil,
        lastProactiveDate: mergedMeta.lastProactiveDate,
        pendingBehavior: mergedMeta.pendingBehavior,
        recentDeltaReasons: mergedMeta.recentDeltaReasons,
        lastInteractionAt: mergedMeta.lastInteractionAt,
        neglectCheckedAt: mergedMeta.neglectCheckedAt,
        presence: mergedMeta.presence,
        presenceUpdatedAt: mergedMeta.presenceUpdatedAt,
        recentActions: mergedMeta.recentActions,
      };
      await saveOcChatThread(charId, vid, next);
    },
    [charId],
  );

  const playBehavior = useCallback(
    async (
      behavior: OcChatBehavior,
      baseMessages: OcChatMessage[],
      opts: {
        affection: number;
        freeGainToday: number;
        freeGainDate: string;
        story?: OcChatStoryState;
        skipSeen?: boolean;
      },
    ) => {
      let msgs = baseMessages;
      let nextMeta: MetaState = { ...stateRef.current.meta };
      replyLockRef.current = true;

      if (behavior.moodNote) {
        nextMeta = { ...nextMeta, moodNote: behavior.moodNote };
      }

      const pushRecent = (action: string, presence: OcChatPresence, note?: string) => {
        const entry: OcChatRecentAction = {
          at: Date.now(),
          action,
          presence,
          note,
        };
        nextMeta = {
          ...nextMeta,
          recentActions: appendRecentAction(nextMeta.recentActions, entry),
        };
      };

      const playLengthTyping = async (
        text: string,
        events: OcChatTypingEvent[] | undefined,
        applyFluster: boolean,
      ) => {
        const baseMs = typingDurationMs(text);
        const pauses =
          applyFluster && events?.length
            ? events.filter((e) => e.type === 'pause' || e.type === 'clear')
            : [];
        if (!pauses.length) {
          setBusy(true);
          await sleepMs(baseMs);
          return;
        }
        const segments = pauses.length + 1;
        const each = Math.max(400, Math.round(baseMs / segments));
        for (let i = 0; i < segments; i++) {
          setBusy(true);
          await sleepMs(each);
          if (i < pauses.length) {
            const p = pauses[i]!;
            setBusy(false);
            await sleepMs(Math.round(Math.min(4, Math.max(0.2, p.durationSeconds)) * 1000));
          }
        }
        setBusy(true);
      };

      try {
        const wasOffline = nextMeta.presence !== 'online';
        const applyAt = computePendingApplyAt(behavior, wasOffline);
        const pending = behaviorToPending(behavior, applyAt);

        /* 즉시 예약 — 창을 닫아도 백그라운드가 배달할 수 있게 */
        nextMeta = {
          ...nextMeta,
          pendingBehavior: pending,
          presence:
            behavior.action === 'ignore' && behavior.presenceState === 'offline'
              ? nextMeta.presence
              : behavior.presenceState === 'offline' && behavior.action === 'ignore'
                ? 'offline'
                : wasOffline &&
                    (behavior.action === 'respond' ||
                      behavior.action === 'end_for_today' ||
                      behavior.action === 'read_only' ||
                      behavior.presenceState === 'online')
                  ? 'online'
                  : behavior.presenceState || nextMeta.presence,
          presenceUpdatedAt: Date.now(),
        };
        setMeta(nextMeta);

        if (behavior.action === 'ignore') {
          const wait = Math.max(0, applyAt - Date.now());
          if (nextMeta.presence === 'online' && openRef.current) {
            setWaitingRead(true);
            await sleepMs(Math.min(wait, 2800));
            setWaitingRead(false);
          } else {
            await sleepMs(Math.min(wait, 1800));
          }
          pushRecent('ignore', nextMeta.presence, behavior.moodNote || behavior.deltaReason);
          nextMeta = { ...nextMeta, pendingBehavior: undefined };
          setMeta(nextMeta);
          /* 대기 중 연타된 유저 말 보존 */
          msgs = stateRef.current.messages;
          await persistSnapshot({
            messages: msgs,
            affection: opts.affection,
            story: opts.story,
            freeGainToday: opts.freeGainToday,
            freeGainDate: opts.freeGainDate,
            meta: nextMeta,
            skipSeen: true,
            lastSeenAt: stateRef.current.lastSeenAt,
          });
          return;
        }

        /* presence 먼저 반영 + pending 저장 */
        await persistSnapshot({
          messages: msgs,
          affection: opts.affection,
          story: opts.story,
          freeGainToday: opts.freeGainToday,
          freeGainDate: opts.freeGainDate,
          meta: nextMeta,
          skipSeen: !openRef.current,
          lastSeenAt: !openRef.current ? stateRef.current.lastSeenAt : undefined,
        });

        const waitMs = Math.max(0, applyAt - Date.now());
        if (openRef.current) setWaitingRead(true);
        if (waitMs > 0) await sleepMs(waitMs);

        /* 창이 닫혀 있으면 조용히 배달 (미읽음 유지) */
        if (!openRef.current) {
          await tryDeliverPendingChat({
            characterId: charId,
            visitorId: visitorRef.current || getOrCreateChatVisitorId(),
            character,
          });
          const fresh = await loadOcChatThread(
            charId,
            visitorRef.current || getOrCreateChatVisitorId(),
          );
          setMessages(fresh.messages);
          setMeta({
            ...nextMeta,
            pendingBehavior: fresh.pendingBehavior,
            presence: fresh.presence || nextMeta.presence,
            presenceUpdatedAt: fresh.presenceUpdatedAt,
            ...closedFieldsFromUntil(fresh.closedUntil),
            moodNote: fresh.moodNote || nextMeta.moodNote,
            recentActions: fresh.recentActions || nextMeta.recentActions,
          });
          if (typeof fresh.lastSeenAt === 'number') setLastSeenAt(fresh.lastSeenAt);
          return;
        }

        /* 열려 있으면: 읽음 → (추가 메시지 오면 계속 읽기) → 타이핑 → 말풍선 */
        const absorbReads = async (lingerRounds = 3) => {
          let cur = markUserMessagesRead(stateRef.current.messages);
          msgs = cur;
          setMessages(cur);
          await persistSnapshot({
            messages: cur,
            affection: opts.affection,
            story: opts.story,
            freeGainToday: opts.freeGainToday,
            freeGainDate: opts.freeGainDate,
            meta: nextMeta,
          });
          for (let i = 0; i < lingerRounds; i++) {
            await sleepMs(320 + Math.round(Math.random() * 280));
            if (!openRef.current) break;
            const latest = stateRef.current.messages;
            const hasUnread = latest.some((m) => m.role === 'user' && !m.readAt);
            if (!hasUnread) break;
            cur = markUserMessagesRead(latest);
            msgs = cur;
            setMessages(cur);
            await persistSnapshot({
              messages: cur,
              affection: opts.affection,
              story: opts.story,
              freeGainToday: opts.freeGainToday,
              freeGainDate: opts.freeGainDate,
              meta: nextMeta,
            });
          }
          return cur;
        };

        msgs = await absorbReads(3);
        await sleepMs(220);

        if (behavior.action === 'read_only') {
          setWaitingRead(false);
          /* 읽씹 직후에도 바로 온 말은 한 번 더 읽음 */
          msgs = await absorbReads(2);
          pushRecent('read_only', nextMeta.presence, behavior.moodNote || behavior.deltaReason);
          nextMeta = { ...nextMeta, pendingBehavior: undefined };
          setMeta(nextMeta);
          await persistSnapshot({
            messages: msgs,
            affection: opts.affection,
            story: opts.story,
            freeGainToday: opts.freeGainToday,
            freeGainDate: opts.freeGainDate,
            meta: nextMeta,
          });
          return;
        }

        setWaitingRead(false);
        /* 타이핑 들어가기 직전에도 화면 보고 있는 동안 온 말 흡수 */
        msgs = await absorbReads(1);

        /* 이미 백그라운드가 배달했는지 확인 */
        {
          const fresh = await loadOcChatThread(
            charId,
            visitorRef.current || getOrCreateChatVisitorId(),
          );
          if (!fresh.pendingBehavior) {
            setMessages(fresh.messages);
            nextMeta = {
              ...nextMeta,
              pendingBehavior: undefined,
              presence: fresh.presence || 'online',
              ...closedFieldsFromUntil(fresh.closedUntil),
            };
            setMeta(nextMeta);
            return;
          }
        }

        const lines = behavior.messages.filter(
          (line) => line.trim() && !looksLikeBehaviorDump(line),
        );
        const sticker = resolveSticker(character.chatbot, behavior.sticker || null);

        for (let i = 0; i < lines.length; i++) {
          if (!openRef.current) {
            await tryDeliverPendingChat({
              characterId: charId,
              visitorId: visitorRef.current || getOrCreateChatVisitorId(),
              character,
            });
            const fresh = await loadOcChatThread(
              charId,
              visitorRef.current || getOrCreateChatVisitorId(),
            );
            setMessages(fresh.messages);
            return;
          }
          /* 타이핑 중 온 유저 말도 유지·읽음 처리 — flush 스냅샷 밖 연타는 봇 답 뒤로 */
          const included = flushIncludedIdsRef.current;
          {
            const { head, lateUsers } = extractLateUserMessages(
              markUserMessagesRead(stateRef.current.messages),
              included,
            );
            msgs = [...head, ...lateUsers];
            setMessages(msgs);
          }
          const line = lines[i]!;
          await playLengthTyping(line, behavior.typingIndicatorEvents, i === 0);
          {
            const { head, lateUsers } = extractLateUserMessages(
              markUserMessagesRead(stateRef.current.messages),
              included,
            );
            const botMsg = createChatMessage('assistant', line, 'chat');
            msgs = [...head, botMsg, ...lateUsers];
          }
          setMessages(msgs);
          setBusy(false);
          await persistSnapshot({
            messages: msgs,
            affection: opts.affection,
            story: opts.story,
            freeGainToday: opts.freeGainToday,
            freeGainDate: opts.freeGainDate,
            meta: {
              ...nextMeta,
              pendingBehavior:
                i === lines.length - 1 && !sticker
                  ? undefined
                  : {
                      ...pending,
                      messages: lines.slice(i + 1),
                    },
            },
            skipSeen: !openRef.current,
            lastSeenAt: !openRef.current ? stateRef.current.lastSeenAt : undefined,
          });
          if (i < lines.length - 1 || sticker) {
            await sleepMs(splitBubbleGapMs());
          }
        }

        if (sticker) {
          if (!openRef.current) {
            await tryDeliverPendingChat({
              characterId: charId,
              visitorId: visitorRef.current || getOrCreateChatVisitorId(),
              character,
            });
            return;
          }
          setBusy(true);
          await sleepMs(typingDurationMs('스티커'));
          {
            const { head, lateUsers } = extractLateUserMessages(
              markUserMessagesRead(stateRef.current.messages),
              flushIncludedIdsRef.current,
            );
            const stickerMsg = createChatMessage('assistant', '스티커', 'sticker', {
              stickerUrl: sticker.imageUrl,
              stickerId: sticker.id,
            });
            msgs = [...head, stickerMsg, ...lateUsers];
          }
          setMessages(msgs);
          setBusy(false);
        }

        if (!lines.length && !sticker) {
          pushRecent(behavior.action, nextMeta.presence, behavior.moodNote);
          nextMeta =
            behavior.action === 'end_for_today'
              ? { ...withEndForTodayLock(nextMeta), pendingBehavior: undefined }
              : { ...nextMeta, pendingBehavior: undefined };
          setMeta(nextMeta);
          await persistSnapshot({
            messages: msgs,
            affection: opts.affection,
            story: opts.story,
            freeGainToday: opts.freeGainToday,
            freeGainDate: opts.freeGainDate,
            meta: nextMeta,
            skipSeen: !openRef.current,
          });
          setBusy(false);
          return;
        }

        pushRecent(behavior.action, 'online', behavior.moodNote);
        nextMeta =
          behavior.action === 'end_for_today'
            ? {
                ...withEndForTodayLock({
                  ...nextMeta,
                  presence: 'online',
                  presenceUpdatedAt: Date.now(),
                }),
                pendingBehavior: undefined,
              }
            : {
                ...nextMeta,
                presence: 'online',
                presenceUpdatedAt: Date.now(),
                pendingBehavior: undefined,
              };
        setMeta(nextMeta);
        await persistSnapshot({
          messages: msgs,
          affection: opts.affection,
          story: opts.story,
          freeGainToday: opts.freeGainToday,
          freeGainDate: opts.freeGainDate,
          meta: nextMeta,
          skipSeen: !openRef.current,
          lastSeenAt: !openRef.current ? stateRef.current.lastSeenAt : undefined,
        });
        setBusy(false);
      } finally {
        replyLockRef.current = false;
        setBusy(false);
        setWaitingRead(false);
      }
    },
    [character, charId, persistSnapshot],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingThread(true);
    setError('');
    setAwaitingChoice(false);
    setWaitingRead(false);
    revealedRef.current = new Set();
    window.clearTimeout(storyTimer.current);
    visitorRef.current = getOrCreateChatVisitorId();
    void (async () => {
      try {
        const thread = await loadOcChatThread(charId, visitorRef.current);
        if (cancelled) return;
        setFreeGainDate(thread.freeGainDate || todayKeyLocal());
        setFreeGainToday(thread.freeGainToday || 0);
        let nextMeta: MetaState = {
          moodNote: thread.moodNote,
          turnsToday: thread.turnsToday || 0,
          ...closedFieldsFromUntil(thread.closedUntil),
          pendingBehavior: thread.pendingBehavior,
          lastProactiveDate: thread.lastProactiveDate,
          freeLossToday: thread.freeLossToday || 0,
          recentDeltaReasons: thread.recentDeltaReasons || [],
          lastInteractionAt: thread.lastInteractionAt,
          neglectCheckedAt: thread.neglectCheckedAt,
          presence: thread.presence === 'online' || thread.presence === 'offline'
            ? thread.presence
            : rollAmbientPresence(),
          presenceUpdatedAt: thread.presenceUpdatedAt || Date.now(),
          recentActions: thread.recentActions || [],
        };

        const neglect = computeNeglectDecay({
          affection: thread.affection,
          lastInteractionAt: thread.lastInteractionAt || lastMessageAt(thread.messages),
          neglectCheckedAt: thread.neglectCheckedAt,
        });
        let affectionNow = neglect.affection;
        if (neglect.decay > 0) {
          affectionNow = neglect.affection;
          nextMeta = { ...nextMeta, neglectCheckedAt: neglect.neglectCheckedAt };
          flashAffectionToast(-neglect.decay);
        }
        setAffection(affectionNow);
        setMeta(nextMeta);

        const ep = resolveStartEpisode(character.chatbot);
        let nextStory = thread.story;
        let nextMessages = thread.messages;

        if (ep && needsStoryMode(character, nextStory?.completedEpisodeIds)) {
          const startId = episodeStartSceneId(ep);
          if (!nextStory || nextStory.episodeId !== ep.id || !nextStory.sceneId) {
            nextStory = {
              episodeId: ep.id,
              sceneId: startId || '',
              completedEpisodeIds: nextStory?.completedEpisodeIds || [],
            };
          }
          for (const sc of ep.scenes || []) {
            if (
              nextMessages.some(
                (m) =>
                  (m.kind === 'story' || m.kind === 'narration') &&
                  m.content === (sc.text || '').trim(),
              )
            ) {
              revealedRef.current.add(`${ep.id}:${sc.id}`);
            }
          }
        } else if (!nextMessages.length) {
          const greeting = defaultChatGreeting(character);
          if (greeting) {
            nextMessages = [createChatMessage('assistant', greeting, 'chat')];
          }
        }

        /* 기한 지난 예약 답장 — 열자마자 배달 (이미 닫힌 동안 백그라운드가 했을 수도) */
        let pending = thread.pendingBehavior;
        if (
          pending &&
          pending.applyAt <= Date.now() &&
          !needsStoryMode(character, nextStory?.completedEpisodeIds)
        ) {
          await tryDeliverPendingChat({
            characterId: charId,
            visitorId: visitorRef.current,
            character,
          });
          const fresh = await loadOcChatThread(charId, visitorRef.current);
          nextMessages = fresh.messages;
          affectionNow = fresh.affection;
          nextMeta = {
            ...nextMeta,
            pendingBehavior: fresh.pendingBehavior,
            presence: fresh.presence || nextMeta.presence,
            presenceUpdatedAt: fresh.presenceUpdatedAt,
            ...closedFieldsFromUntil(fresh.closedUntil),
            moodNote: fresh.moodNote || nextMeta.moodNote,
            recentActions: fresh.recentActions || nextMeta.recentActions,
          };
          pending = fresh.pendingBehavior;
          setMeta(nextMeta);
          setAffection(affectionNow);
        }

        const seenNow = Date.now();
        setLastSeenAt(seenNow);
        setStory(nextStory);
        setMessages(nextMessages);

        await saveOcChatThread(charId, visitorRef.current, {
          messages: nextMessages,
          updatedAt: Date.now(),
          affection: affectionNow,
          story: nextStory,
          freeGainDate: thread.freeGainDate || todayKeyLocal(),
          freeGainToday: thread.freeGainToday || 0,
          freeLossToday: nextMeta.freeLossToday,
          lastSeenAt: seenNow,
          moodNote: nextMeta.moodNote,
          moodDate: nextMeta.moodNote ? todayKeyLocal() : undefined,
          turnsToday: nextMeta.turnsToday,
          turnsDate: todayKeyLocal(),
          closedForToday: nextMeta.closedForToday,
          closedDate: undefined,
          closedUntil: nextMeta.closedUntil,
          lastProactiveDate: nextMeta.lastProactiveDate,
          pendingBehavior: pending,
          recentDeltaReasons: nextMeta.recentDeltaReasons,
          lastInteractionAt: nextMeta.lastInteractionAt,
          neglectCheckedAt: nextMeta.neglectCheckedAt,
          presence: nextMeta.presence,
          presenceUpdatedAt: nextMeta.presenceUpdatedAt,
          recentActions: nextMeta.recentActions,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '대화를 불러오지 못했습니다');
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingThread(false);
          focusComposer();
          /* 로딩 UI가 메시지 목록으로 바뀐 뒤 맨 아래로 */
          requestAnimationFrame(() => {
            scrollToEnd();
            window.setTimeout(scrollToEnd, 50);
            window.setTimeout(scrollToEnd, 180);
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(storyTimer.current);
    };
  }, [charId, character, flashAffectionToast, focusComposer, open, scrollToEnd]);

  /* end_for_today 쿨다운 만료 시 구분선 해제 */
  useEffect(() => {
    if (!open || loadingThread) return;
    const until = meta.closedUntil;
    if (!until) {
      if (meta.closedForToday) setMeta((m) => withChatUnlocked(m));
      return;
    }
    const left = until - Date.now();
    const unlock = () => {
      const unlocked = withChatUnlocked(stateRef.current.meta);
      stateRef.current.meta = unlocked;
      setMeta(unlocked);
      void persistSnapshot({
        messages: stateRef.current.messages,
        affection: stateRef.current.affection,
        story: stateRef.current.story,
        freeGainToday: stateRef.current.freeGainToday,
        freeGainDate: stateRef.current.freeGainDate,
        meta: unlocked,
      });
    };
    if (left <= 0) {
      unlock();
      return;
    }
    const t = window.setTimeout(unlock, left + 40);
    return () => window.clearTimeout(t);
  }, [open, loadingThread, meta.closedUntil, meta.closedForToday, persistSnapshot]);

  /* 앰비언트 온라인/오프라인 — 답장 연출 중이 아닐 때만 */
  useEffect(() => {
    if (!open || loadingThread || inStory) return;
    const tick = () => {
      if (replyLockRef.current || busy || waitingRead) return;
      const next = rollAmbientPresence();
      if (next === stateRef.current.meta.presence) return;
      const patched: MetaState = {
        ...stateRef.current.meta,
        presence: next,
        presenceUpdatedAt: Date.now(),
      };
      setMeta(patched);
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      void saveOcChatThread(charId, vid, {
        messages: stateRef.current.messages,
        updatedAt: Date.now(),
        affection: stateRef.current.affection,
        story: stateRef.current.story,
        freeGainDate: stateRef.current.freeGainDate,
        freeGainToday: stateRef.current.freeGainToday,
        freeLossToday: patched.freeLossToday,
        lastSeenAt: stateRef.current.lastSeenAt || undefined,
        moodNote: patched.moodNote,
        moodDate: patched.moodNote ? todayKeyLocal() : undefined,
        turnsToday: patched.turnsToday,
        turnsDate: todayKeyLocal(),
        closedForToday: patched.closedForToday,
        closedDate: undefined,
        closedUntil: patched.closedUntil,
        lastProactiveDate: patched.lastProactiveDate,
        pendingBehavior: patched.pendingBehavior,
        recentDeltaReasons: patched.recentDeltaReasons,
        lastInteractionAt: patched.lastInteractionAt,
        neglectCheckedAt: patched.neglectCheckedAt,
        presence: patched.presence,
        presenceUpdatedAt: patched.presenceUpdatedAt,
        recentActions: patched.recentActions,
      });
    };
    const id = window.setInterval(tick, 70_000);
    return () => window.clearInterval(id);
  }, [busy, charId, inStory, loadingThread, open, waitingRead]);

  /* 스토리 씬 공개 + 자동 진행 */
  useEffect(() => {
    if (!open || loadingThread || !inStory || !activeEpisode || !story?.sceneId) {
      setAwaitingChoice(false);
      return;
    }
    const scene = findEpisodeScene(activeEpisode, story.sceneId);
    if (!scene) return;

    const key = `${activeEpisode.id}:${scene.id}`;
    const hasChoices = (scene.choices || []).some((c) => c.text?.trim());
    const nextId =
      scene.next === undefined || scene.next === null ? null : String(scene.next);
    const delayMs =
      typeof scene.delayMs === 'number' && scene.delayMs > 0 ? scene.delayMs : STORY_AUTO_MS;

    const finishOrAdvance = (fromSceneId: string) => {
      if (nextId) {
        setStory((s) => (s ? { ...s, sceneId: nextId } : s));
        return;
      }
      if ((stateRef.current.story?.completedEpisodeIds || []).includes(activeEpisode.id)) {
        return;
      }
      const doneStory: OcChatStoryState = {
        episodeId: activeEpisode.id,
        sceneId: fromSceneId,
        completedEpisodeIds: Array.from(
          new Set([
            ...(stateRef.current.story?.completedEpisodeIds || []),
            activeEpisode.id,
          ]),
        ),
      };
      setStory(doneStory);
      void persistSnapshot({
        messages: stateRef.current.messages,
        affection: stateRef.current.affection,
        story: doneStory,
      });
    };

    if (!revealedRef.current.has(key)) {
      let cancelled = false;
      revealedRef.current.add(key);

      void (async () => {
        const readAction = resolveSceneReadAction(scene);
        const preDelay = typeof scene.delayMs === 'number' ? Math.max(0, scene.delayMs) : 0;

        if (readAction === 'markRead') {
          setWaitingRead(true);
          if (preDelay > 0) await sleepMs(Math.min(preDelay, 1200));
          if (cancelled || !openRef.current) return;
          const readMsgs = markUserMessagesRead(stateRef.current.messages);
          setMessages(readMsgs);
          await persistSnapshot({
            messages: readMsgs,
            affection: stateRef.current.affection,
            story: stateRef.current.story,
          });
          const afterRead = preDelay > 1200 ? preDelay - 1200 : STORY_AUTO_MS * 0.6;
          await sleepMs(afterRead);
        } else if (preDelay > 0) {
          setWaitingRead(true);
          await sleepMs(preDelay);
        }
        if (cancelled || !openRef.current) return;
        setWaitingRead(false);

        let msgs = stateRef.current.messages;
        if (scene.text.trim()) {
          const kind = scene.speaker === 'narration' ? 'narration' : 'story';
          const line = createChatMessage('assistant', scene.text.trim(), kind);
          msgs = [...msgs, line];
          setMessages(msgs);
          await persistSnapshot({
            messages: msgs,
            affection: stateRef.current.affection,
            story: stateRef.current.story,
            skipSeen: scene.effect === 'leave',
          });
        }

        if (scene.effect === 'leave') {
          if (nextId) {
            const nextStory: OcChatStoryState = {
              ...(stateRef.current.story || {
                episodeId: activeEpisode.id,
                sceneId: scene.id,
                completedEpisodeIds: [],
              }),
              sceneId: nextId,
            };
            setStory(nextStory);
            await persistSnapshot({
              messages: stateRef.current.messages,
              affection: stateRef.current.affection,
              story: nextStory,
              skipSeen: true,
              lastSeenAt: stateRef.current.lastSeenAt,
            });
          } else {
            finishOrAdvance(scene.id);
          }
          onClose();
          return;
        }

        if (hasChoices) {
          setAwaitingChoice(true);
          return;
        }
        setAwaitingChoice(false);
        window.clearTimeout(storyTimer.current);
        storyTimer.current = window.setTimeout(() => {
          finishOrAdvance(scene.id);
        }, STORY_AUTO_MS);
      })();

      return () => {
        cancelled = true;
        window.clearTimeout(storyTimer.current);
      };
    }

    if (hasChoices) {
      setAwaitingChoice(true);
      return;
    }
    setAwaitingChoice(false);

    if (nextId) {
      window.clearTimeout(storyTimer.current);
      storyTimer.current = window.setTimeout(() => {
        setStory((s) => (s ? { ...s, sceneId: nextId } : s));
      }, delayMs);
      return () => window.clearTimeout(storyTimer.current);
    }

    if ((story.completedEpisodeIds || []).includes(activeEpisode.id)) return;
    finishOrAdvance(story.sceneId);
  }, [
    activeEpisode,
    inStory,
    loadingThread,
    onClose,
    open,
    persistSnapshot,
    story?.completedEpisodeIds,
    story?.episodeId,
    story?.sceneId,
  ]);

  useEffect(() => {
    if (!open || loadingThread) return;
    scrollToEnd();
  }, [messages, busy, waitingRead, awaitingChoice, open, loadingThread, scrollToEnd]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, open]);

  const pickChoice = useCallback(
    async (choice: OcChatEpisodeChoice) => {
      if (!activeEpisode || !story || busy || waitingRead) return;
      setAwaitingChoice(false);
      setError('');
      const delta = Number(choice.affinityDelta) || 0;
      const nextAffection = clampAffection(stateRef.current.affection + delta);
      /* 점수 바닥/천장에 막혀도 의도 델타는 토스트·일일 카운트에 반영 */
      const today = todayKeyLocal();
      const gainBase =
        stateRef.current.freeGainDate === today ? stateRef.current.freeGainToday : 0;
      const lossBase =
        stateRef.current.freeGainDate === today
          ? stateRef.current.meta.freeLossToday || 0
          : 0;
      const counted =
        delta === 0
          ? 0
          : delta > 0
            ? Math.min(delta, Math.max(0, FREE_DAILY_GAIN_CAP - gainBase))
            : -Math.min(-delta, Math.max(0, FREE_DAILY_LOSS_CAP - lossBase));
      const userLine = createChatMessage('user', choice.text.trim(), 'choice');
      const withUser = [...stateRef.current.messages, userLine];
      setMessages(withUser);
      setAffection(nextAffection);
      if (counted !== 0) {
        if (counted > 0) {
          setFreeGainToday(gainBase + counted);
          setFreeGainDate(today);
        } else {
          setFreeGainDate(today);
          setMeta((m) => ({
            ...m,
            freeLossToday: lossBase + -counted,
          }));
        }
        flashAffectionToast(counted);
      }

      const nextSceneId =
        choice.next === undefined || choice.next === null ? null : String(choice.next);

      const touchMeta: Partial<MetaState> = {
        lastInteractionAt: Date.now(),
        ...(counted < 0 ? { freeLossToday: lossBase + -counted } : null),
      };

      if (!nextSceneId) {
        const doneStory: OcChatStoryState = {
          episodeId: activeEpisode.id,
          sceneId: story.sceneId,
          completedEpisodeIds: Array.from(
            new Set([...(story.completedEpisodeIds || []), activeEpisode.id]),
          ),
        };
        setStory(doneStory);
        await persistSnapshot({
          messages: withUser,
          affection: nextAffection,
          story: doneStory,
          freeGainToday: counted > 0 ? gainBase + counted : gainBase,
          freeGainDate: today,
          meta: touchMeta,
        });
        return;
      }

      const nextStory: OcChatStoryState = { ...story, sceneId: nextSceneId };
      setStory(nextStory);
      await persistSnapshot({
        messages: withUser,
        affection: nextAffection,
        story: nextStory,
        freeGainToday: counted > 0 ? gainBase + counted : gainBase,
        freeGainDate: today,
        meta: touchMeta,
      });
    },
    [activeEpisode, busy, flashAffectionToast, persistSnapshot, story, waitingRead],
  );

  const flushDebouncedChat = useCallback(async () => {
    if (flushLockRef.current) {
      pendingFlushRef.current = true;
      return;
    }
    if (inStory || loadingThread) return;
    if (isChatClosedNow(stateRef.current.meta.closedUntil)) return;
    if (stateRef.current.meta.closedForToday || stateRef.current.meta.closedUntil) {
      const unlocked = withChatUnlocked(stateRef.current.meta);
      stateRef.current.meta = unlocked;
      setMeta(unlocked);
    }

    const withUser = stateRef.current.messages;
    const last = withUser[withUser.length - 1];
    if (!last || last.role !== 'user') return;

    flushLockRef.current = true;
    pendingFlushRef.current = false;
    flushIncludedIdsRef.current = new Set(withUser.map((m) => m.id));
    const includedAtStart = flushIncludedIdsRef.current;
    const aff = stateRef.current.affection;
    const st = stateRef.current.story;
    const gain =
      stateRef.current.freeGainDate === todayKeyLocal()
        ? stateRef.current.freeGainToday
        : 0;
    const loss =
      stateRef.current.freeGainDate === todayKeyLocal()
        ? stateRef.current.meta.freeLossToday || 0
        : 0;
    const turns = stateRef.current.meta.turnsToday || 0;
    const metaSnap = stateRef.current.meta;
    const userBurstAtStart = countTrailingUserBurst(withUser);

    const scheduleTrailingFlush = () => {
      window.clearTimeout(debounceTimer.current);
      const elapsed = Date.now() - lastUserSendAtRef.current;
      const wait = Math.max(0, OC_CHAT_SEND_DEBOUNCE_MS - elapsed);
      debounceTimer.current = window.setTimeout(() => {
        void flushDebouncedChat();
      }, wait);
    };

    try {
      let burstStart = withUser.length - 1;
      while (burstStart > 0 && withUser[burstStart - 1]?.role === 'user') {
        burstStart -= 1;
      }
      const beforeBurstAt =
        burstStart > 0 ? withUser[burstStart - 1]?.at : undefined;

      const result = await postOcChat({
        characterId: charId,
        visitorId: visitorRef.current || getOrCreateChatVisitorId(),
        messages: withUser,
        affection: aff,
        freeGainToday: gain,
        freeLossToday: loss,
        moodNote: metaSnap.moodNote,
        turnsToday: turns,
        hoursSinceLast: hoursSince(
          typeof beforeBurstAt === 'number'
            ? beforeBurstAt
            : lastMessageAt(withUser.slice(0, burstStart)),
        ),
        closedForToday: false,
        recentDeltaReasons: metaSnap.recentDeltaReasons,
        presence: metaSnap.presence,
        recentActions: metaSnap.recentActions,
      });

      const reasons = [...(metaSnap.recentDeltaReasons || [])];
      if (result.deltaReason && result.affinityDelta !== 0) {
        reasons.push(result.deltaReason);
      }
      const afterMeta: MetaState = {
        ...stateRef.current.meta,
        freeLossToday: result.freeLossToday,
        recentDeltaReasons: reasons.slice(-8),
        lastInteractionAt: Date.now(),
        moodNote: result.behavior.moodNote || stateRef.current.meta.moodNote,
      };
      setMeta(afterMeta);

      /* 호감·토스트는 읽음→답장 연출 끝난 뒤에만 (전송 직후 선반영 금지) */
      await playBehavior(result.behavior, stateRef.current.messages, {
        affection: result.affection,
        freeGainToday: result.freeGainToday,
        freeGainDate: result.freeGainDate,
        story: st,
      });
      setAffection(result.affection);
      setFreeGainToday(result.freeGainToday);
      setFreeGainDate(result.freeGainDate);
      if (result.affinityDelta !== 0) flashAffectionToast(result.affinityDelta);
      await persistSnapshot({
        messages: stateRef.current.messages,
        affection: result.affection,
        story: st,
        freeGainToday: result.freeGainToday,
        freeGainDate: result.freeGainDate,
        meta: {
          ...stateRef.current.meta,
          freeLossToday: result.freeLossToday,
          recentDeltaReasons: reasons.slice(-8),
          lastInteractionAt: Date.now(),
          moodNote: result.behavior.moodNote || stateRef.current.meta.moodNote,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 실패');
    } finally {
      flushLockRef.current = false;
      setWaitingRead(false);
      setBusy(false);
      focusComposer();
      const trail = stateRef.current.messages;
      const lateUsers = trail.filter(
        (m) => m.role === 'user' && !includedAtStart.has(m.id),
      );
      const needsAgain = pendingFlushRef.current || lateUsers.length > 0;
      if (needsAgain) {
        pendingFlushRef.current = false;
        console.info('[oc-chat-ui] schedule trailing flush', {
          lateUserCount: lateUsers.length,
          trailingBurst: countTrailingUserBurst(trail),
          userBurstAtStart,
          waitMs: Math.max(
            0,
            OC_CHAT_SEND_DEBOUNCE_MS - (Date.now() - lastUserSendAtRef.current),
          ),
        });
        scheduleTrailingFlush();
      }
    }
  }, [
    charId,
    flashAffectionToast,
    focusComposer,
    inStory,
    loadingThread,
    persistSnapshot,
    playBehavior,
  ]);

  const send = useCallback(async () => {
    const text = input.trim();
    /* 답장 대기 중에도 추가 전송 허용 (디바운스/다음 턴으로 이어짐) */
    if (!text || loadingThread || inStory) return;
    const ban = checkChatBanned(text);
    if (ban.blocked) {
      setError(chatBanUserMessage(ban.reason));
      focusComposer();
      return;
    }
    setInput('');
    setError('');
    focusComposer();
    const userMsg = createChatMessage('user', text, 'chat');
    const withUser = [...stateRef.current.messages, userMsg];
    setMessages(withUser);
    lastUserSendAtRef.current = Date.now();
    const aff = stateRef.current.affection;
    const st = stateRef.current.story;
    const turns = (stateRef.current.meta.turnsToday || 0) + 1;
    const nextMeta: MetaState = {
      ...stateRef.current.meta,
      turnsToday: turns,
      lastInteractionAt: Date.now(),
    };
    setMeta(nextMeta);

    /* OC가 화면 보고 있는 중이면 곧 읽음 처리 (바로 안 나가는 느낌) */
    if (replyLockRef.current) {
      window.setTimeout(() => {
        if (!openRef.current || !replyLockRef.current) return;
        const marked = markUserMessagesRead(stateRef.current.messages);
        if (marked === stateRef.current.messages) return;
        setMessages(marked);
        void persistSnapshot({
          messages: marked,
          affection: stateRef.current.affection,
          story: stateRef.current.story,
          freeGainToday:
            stateRef.current.freeGainDate === todayKeyLocal()
              ? stateRef.current.freeGainToday
              : 0,
          freeGainDate: stateRef.current.freeGainDate,
          meta: stateRef.current.meta,
        });
      }, 650);
    }

    try {
      await persistSnapshot({
        messages: withUser,
        affection: aff,
        story: st,
        meta: nextMeta,
        skipSeen: !openRef.current,
      });
      focusComposer();

      if (isChatClosedNow(stateRef.current.meta.closedUntil)) {
        setWaitingRead(true);
        await sleepMs(delayKindToMs('long'));
        setWaitingRead(false);
        focusComposer();
        return;
      }
      if (stateRef.current.meta.closedForToday || stateRef.current.meta.closedUntil) {
        const unlocked = withChatUnlocked(stateRef.current.meta);
        stateRef.current.meta = unlocked;
        setMeta(unlocked);
      }

      /* AI 응답 중이면 큐 표시 + 마지막 전송 시각만 갱신(언락 후 trailing wait) */
      if (flushLockRef.current || replyLockRef.current) {
        pendingFlushRef.current = true;
        return;
      }

      /* 마지막 메시지 기준 N초 — 새 말이 오면 타이머 리셋 */
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        void flushDebouncedChat();
      }, OC_CHAT_SEND_DEBOUNCE_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 실패');
      focusComposer();
    }
  }, [
    flushDebouncedChat,
    focusComposer,
    inStory,
    input,
    loadingThread,
    persistSnapshot,
  ]);

  /* 창 닫을 때 대기 중이면 바로 flush */
  useEffect(() => {
    if (open) return;
    if (!debounceTimer.current) return;
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = 0;
    void flushDebouncedChat();
  }, [flushDebouncedChat, open]);

  useEffect(() => {
    return () => {
      window.clearTimeout(debounceTimer.current);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setPanelAnim('out');
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setPanelAnim('in'));
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        if (raf2) window.cancelAnimationFrame(raf2);
      };
    }
    setPanelAnim((cur) => (cur == null ? null : 'out'));
  }, [open]);

  useEffect(() => {
    if (open || panelAnim !== 'out') return;
    const t = window.setTimeout(() => setPanelAnim(null), 280);
    return () => window.clearTimeout(t);
  }, [open, panelAnim]);

  const chatPointStyle = useMemo(
    () => resolveOcChatPointStyle(character.personalColor),
    [character.personalColor],
  );
  const enterCutoffRef = useRef(0);
  if (open && panelAnim === 'in' && enterCutoffRef.current === 0) {
    enterCutoffRef.current = Date.now();
  }
  if (!open && panelAnim == null) {
    enterCutoffRef.current = 0;
  }

  if (!open && panelAnim == null) return null;

  const isOnline = meta.presence === 'online';
  const statusLabel = inStory
    ? activeEpisode?.title || '스토리'
    : waitingRead
      ? isOnline
        ? '온라인'
        : '…'
      : isOnline
        ? '온라인'
        : '오프라인';

  const overlay = (
    <div
      className={`oc-chat-lb${panelAnim === 'in' ? ' is-open' : ' is-closing'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${character.name} 채팅`}
    >
      <button
        type="button"
        className="oc-chat-lb__backdrop"
        aria-label="닫기"
        onClick={() => {
          if (relationAnim === 'in') {
            closeRelation();
            return;
          }
          if (relationAnim === 'out') return;
          onClose();
        }}
      />
      <div className="oc-chat-phone" style={chatPointStyle as CSSProperties}>
        {affToast ? (
          <div
            className={`oc-chat-aff-toast${affToast.delta > 0 ? ' is-up' : ' is-down'}`}
            role="status"
            aria-live="polite"
            aria-label={
              affToast.delta > 0
                ? `호감 +${affToast.delta}`
                : `호감 ${affToast.delta}`
            }
          >
            {affToast.delta > 0 ? (
              <svg className="oc-chat-aff-toast__icon" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinejoin="round"
                  d="M12 20.4S5.2 15.6 5.2 10.2A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 6.8 2.6c0 5.4-6.8 10.2-6.8 10.2z"
                />
              </svg>
            ) : (
              <svg className="oc-chat-aff-toast__icon" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
                <path
                  fill="none"
                  stroke="rgba(48,28,28,0.95)"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 7.2l-1.35 2.2 1.7 1.55-1.45 2.15 1.6 1.4-1.15 1.85"
                />
              </svg>
            )}
            <span className="oc-chat-aff-toast__delta">
              {affToast.delta > 0 ? `+${affToast.delta}` : String(affToast.delta)}
            </span>
          </div>
        ) : null}
        <header className="oc-chat-phone__head">
          <div className="oc-chat-phone__avatar-wrap" aria-hidden>
            <div className="oc-chat-phone__avatar">
              <img src={chatAvatar} alt="" referrerPolicy="no-referrer" />
            </div>
            <span
              className={`oc-chat-presence${isOnline ? ' is-online' : ' is-offline'}`}
              title={isOnline ? '온라인' : '오프라인'}
            />
          </div>
          <div className="oc-chat-phone__meta">
            <div className="oc-chat-phone__name">{character.name || '채팅'}</div>
            <div className="oc-chat-phone__status">{statusLabel}</div>
          </div>
          <button
            type="button"
            className="oc-chat-heart"
            aria-label="관계 정보"
            aria-expanded={relationAnim === 'in'}
            onClick={openRelation}
          >
            <svg className="oc-chat-heart__icon" viewBox="0 0 24 24" aria-hidden>
              <path
                className="oc-chat-heart__path"
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
          </button>
          <div className="oc-chat-phone__menu" ref={menuWrapRef}>
            <button
              type="button"
              className="oc-chat-phone__more"
              aria-label="채팅 메뉴"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              disabled={resetting}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span aria-hidden>⋮</span>
            </button>
            {menuOpen ? (
              <div className="oc-chat-phone__menu-pop" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="oc-chat-phone__menu-item is-danger"
                  disabled={resetting || busy || waitingRead}
                  onClick={() => void resetMyChat()}
                >
                  {resetting ? '초기화 중…' : '대화 초기화'}
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="oc-chat-phone__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="oc-chat-phone__thread lh-scroll" ref={threadRef}>
          {loadingThread ? (
            <div className="oc-chat-phone__hint">대화를 불러오는 중…</div>
          ) : (
            messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const next = i < messages.length - 1 ? messages[i + 1] : null;
              const showDaySep = !prev || chatDayKey(prev.at) !== chatDayKey(m.at);
              const clusterCont = Boolean(prev && isChatClusterMate(prev, m));
              const clusterEnd = !next || !isChatClusterMate(m, next);
              const showAvatar =
                m.role === 'assistant' && m.kind !== 'narration' && !clusterCont;
              const showUnread =
                m.role === 'user' && m.kind !== 'narration' && !m.readAt;
              const showReadLabel =
                m.role === 'user' &&
                m.kind !== 'narration' &&
                Boolean(m.readAt) &&
                clusterEnd;
              const showTime = clusterEnd && m.kind !== 'narration';
              const showMeta = showUnread || showReadLabel || showTime;
              const isEnter =
                enterCutoffRef.current > 0 && m.at >= enterCutoffRef.current - 80;
              const meta = showMeta ? (
                <div className="oc-chat-meta" aria-hidden>
                  {showUnread || showReadLabel ? (
                    <span
                      className={`oc-chat-meta__read${
                        showUnread ? ' is-unread' : ' is-read'
                      }`}
                    >
                      {showUnread ? '1' : '읽음'}
                    </span>
                  ) : null}
                  {showTime ? (
                    <span className="oc-chat-meta__time">{formatChatClock(m.at)}</span>
                  ) : null}
                </div>
              ) : null;
              return (
              <Fragment key={m.id}>
              {showDaySep ? (
                <div className="oc-chat-day-sep" role="separator">
                  <span className="oc-chat-day-sep__pill">
                    <svg
                      className="oc-chat-day-sep__icon"
                      viewBox="0 0 16 16"
                      width="12"
                      height="12"
                      aria-hidden
                    >
                      <rect
                        x="2.25"
                        y="3.5"
                        width="11.5"
                        height="10"
                        rx="1.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M2.25 6.4h11.5M5.2 2.2v2.4M10.8 2.2v2.4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    {formatChatDayLabel(m.at)}
                  </span>
                </div>
              ) : null}
              <div
                className={`oc-chat-row${m.role === 'user' ? ' is-me' : ' is-other'}${
                  m.kind === 'narration' ? ' is-narration' : ''
                }${m.kind === 'sticker' ? ' is-sticker' : ''}${
                  clusterCont ? ' is-cluster-cont' : ' is-cluster-start'
                }${clusterEnd ? ' is-cluster-end' : ''}${isEnter ? ' is-enter' : ''}`}
              >
                {m.role === 'assistant' && m.kind !== 'narration' ? (
                  showAvatar ? (
                    <div className="oc-chat-row__avatar" aria-hidden>
                      <img src={chatAvatar} alt="" referrerPolicy="no-referrer" />
                    </div>
                  ) : (
                    <div className="oc-chat-row__avatar is-spacer" aria-hidden />
                  )
                ) : null}
                {m.role === 'user' ? meta : null}
                <div className="oc-chat-bubble-wrap">
                  {m.kind === 'sticker' && m.stickerUrl ? (
                    <div className="oc-chat-sticker">
                      <img src={m.stickerUrl} alt="" referrerPolicy="no-referrer" />
                    </div>
                  ) : (
                    <div className="oc-chat-bubble">{m.content}</div>
                  )}
                </div>
                {m.role === 'assistant' && m.kind !== 'narration' ? meta : null}
              </div>
              </Fragment>
              );
            })
          )}
          {busy ? (
            <div className="oc-chat-row is-other">
              <div className="oc-chat-row__avatar" aria-hidden>
                <img src={chatAvatar} alt="" referrerPolicy="no-referrer" />
              </div>
              <div className="oc-chat-typing" aria-hidden>
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}
          {!loadingThread && meta.closedForToday ? (
            <div className="oc-chat-day-end" role="separator" aria-hidden>
              <span className="oc-chat-day-end__line" />
            </div>
          ) : null}
          {error ? <div className="oc-chat-phone__error">{error}</div> : null}
        </div>

        {inStory && awaitingChoice && choices.length > 0 ? (
          <div className="oc-chat-choices">
            {choices.map((c) => (
              <button
                key={c.id || c.text}
                type="button"
                className="oc-chat-choices__btn"
                onClick={() => void pickChoice(c.id ? c : { ...c, id: newId() })}
              >
                {c.text}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="oc-chat-phone__form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inStory ? '스토리를 진행해 주세요' : '메시지 보내기'}
              autoComplete="off"
              disabled={loadingThread || inStory}
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={loadingThread || inStory || !input.trim()}
              aria-label="전송"
            >
              ➤
            </button>
          </form>
        )}
      </div>
      {relationAnim != null ? (
        <div
          className={`oc-chat-relation${relationAnim === 'in' ? ' is-open' : ' is-closing'}`}
          role="dialog"
          aria-modal="true"
          aria-label={chatRelationTitle(character.name || '캐릭터')}
        >
          <button
            type="button"
            className="oc-chat-relation__backdrop"
            aria-label="관계 정보 닫기"
            onClick={closeRelation}
          />
          <div className="oc-chat-relation__card">
            <div className="oc-chat-relation__eyebrow">
              {chatRelationTitle(character.name || '캐릭터')}
            </div>
            <div className="oc-chat-relation__headline">
              <span className="oc-chat-relation__label">{affinityTier.label}</span>
              <span className="oc-chat-relation__score">· {affection}</span>
            </div>
            {affinityTier.relationNote ? (
              <p className="oc-chat-relation__note">{affinityTier.relationNote}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}
