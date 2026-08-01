'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment, type CSSProperties } from 'react';
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
  recoverStoryIfFreeChatting,
  resolveAffinityTier,
  resolveStartEpisode,
  rollFastUnreadVisibleMs,
  shouldFastReadTransition,
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
  cancelOcChatPendingDelivery,
  computePendingApplyAt,
  createChatMessage,
  chatDayKey,
  dedupeAdjacentAssistantMessages,
  dedupeAdjacentTextLines,
  formatChatClock,
  formatChatDayLabel,
  getOrCreateChatVisitorId,
  isChatClusterMate,
  lastMessageAt,
  loadOcChatThread,
  markUserMessagesRead,
  OC_CHAT_SEND_DEBOUNCE_MS,
  OC_CHAT_BURST_REGATHER_MAX,
  extractLateUserMessages,
  hasLateUserMessages,
  countTrailingUserBurst,
  formatOcChatFirebaseError,
  peekOcChatThreadCache,
  pendingLinesAlreadyAtTail,
  postOcChat,
  resetOcChatThreadForVisitor,
  saveOcChatThread,
  scheduleOcChatPendingDelivery,
  setOcChatPendingUiOwned,
  sleepMs,
  tryDeliverPendingChat,
  writeOcChatThreadCache,
  type OcChatMessage,
  type OcChatStoryState,
  type OcChatThread,
} from '@/lib/oc/ocChat';
import {
  appendRecentAction,
  resolveResponseDelaySeconds,
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

type BootChatState = {
  messages: OcChatMessage[];
  affection: number;
  story?: OcChatStoryState;
  freeGainToday: number;
  freeGainDate: string;
  lastSeenAt: number;
  meta: MetaState;
  threadReady: boolean;
  bootstrapped: boolean;
};

function emptyMetaState(presence: OcChatPresence = 'offline'): MetaState {
  return {
    turnsToday: 0,
    closedForToday: false,
    closedUntil: undefined,
    freeLossToday: 0,
    recentDeltaReasons: [],
    presence,
    recentActions: [],
  };
}

/** 첫 페인트부터 캐시를 써서 스토리 문구·온오프 깜빡임 방지 */
function bootChatStateFromCache(character: OcCharacter): BootChatState {
  const empty: BootChatState = {
    messages: [],
    affection: 0,
    story: undefined,
    freeGainToday: 0,
    freeGainDate: todayKeyLocal(),
    lastSeenAt: 0,
    meta: emptyMetaState('offline'),
    threadReady: false,
    bootstrapped: false,
  };
  if (typeof window === 'undefined') return empty;
  try {
    const vid = getOrCreateChatVisitorId();
    const cached = peekOcChatThreadCache(String(character.id), vid);
    if (!cached?.messages?.length) return empty;

    let story = recoverStoryIfFreeChatting(
      character,
      cached.story,
      cached.messages,
    ) as OcChatStoryState | undefined;
    const ep = resolveStartEpisode(character.chatbot);
    if (ep && needsStoryMode(character, story?.completedEpisodeIds)) {
      const startId = episodeStartSceneId(ep);
      if (!story || story.episodeId !== ep.id || !story.sceneId) {
        story = {
          episodeId: ep.id,
          sceneId: startId || '',
          completedEpisodeIds: story?.completedEpisodeIds || [],
        };
      }
    }

    const presence: OcChatPresence =
      cached.presence === 'online' || cached.presence === 'offline'
        ? cached.presence
        : 'offline';

    return {
      messages: cached.messages,
      affection: cached.affection || 0,
      story,
      freeGainToday: cached.freeGainToday || 0,
      freeGainDate: cached.freeGainDate || todayKeyLocal(),
      lastSeenAt: cached.lastSeenAt || 0,
      meta: {
        ...emptyMetaState(presence),
        moodNote: cached.moodNote,
        turnsToday: cached.turnsToday || 0,
        ...closedFieldsFromUntil(cached.closedUntil),
        pendingBehavior: cached.pendingBehavior,
        lastProactiveDate: cached.lastProactiveDate,
        freeLossToday: cached.freeLossToday || 0,
        recentDeltaReasons: cached.recentDeltaReasons || [],
        lastInteractionAt: cached.lastInteractionAt,
        neglectCheckedAt: cached.neglectCheckedAt,
        presence,
        presenceUpdatedAt: cached.presenceUpdatedAt || Date.now(),
        recentActions: cached.recentActions || [],
      },
      threadReady: true,
      bootstrapped: true,
    };
  } catch {
    return empty;
  }
}

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
  const bootRef = useRef<BootChatState | null>(null);
  if (bootRef.current == null) {
    bootRef.current = bootChatStateFromCache(character);
  }
  const boot = bootRef.current;

  const [messages, setMessages] = useState<OcChatMessage[]>(() => boot.messages);
  const [affection, setAffection] = useState(() => boot.affection);
  const [story, setStory] = useState<OcChatStoryState | undefined>(() => boot.story);
  const [freeGainToday, setFreeGainToday] = useState(() => boot.freeGainToday);
  const [freeGainDate, setFreeGainDate] = useState(() => boot.freeGainDate);
  const [lastSeenAt, setLastSeenAt] = useState(() => boot.lastSeenAt);
  const [meta, setMeta] = useState<MetaState>(() => boot.meta);
  const [input, setInput] = useState('');
  /** 캐시/서버로 스토리·스레드가 확정되기 전엔 스토리 잠금 UI를 띄우지 않음 (플레이스홀더 깜빡임 방지) */
  const [threadReady, setThreadReady] = useState(() => boot.threadReady);
  const [busy, setBusy] = useState(false);
  const [waitingRead, setWaitingRead] = useState(false);
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  const [error, setError] = useState('');
  const [affToast, setAffToast] = useState<{ delta: number; id: number } | null>(null);
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
  /** 연타로 진행 중 요청을 무효화할 때 증가 */
  const burstEpochRef = useRef(0);
  /** in-flight postOcChat 취소 */
  const flushAbortRef = useRef<AbortController | null>(null);
  /** 마지막 유저 전송 시각 — trailing debounce 기준 */
  const lastUserSendAtRef = useRef(0);
  /** 이번 flush가 API에 넣은 메시지 id — 도중 연타는 late로 분리 */
  const flushIncludedIdsRef = useRef<Set<string>>(new Set());
  const openRef = useRef(open);
  const replyLockRef = useRef(false);
  /** 언마운트 시 stale 없이 flush 호출 */
  const flushDebouncedChatRef = useRef<() => Promise<void>>(async () => {});
  /** 현재 state가 어느 캐릭터 스레드인지 — 캐릭터 전환 시 오판 방지 */
  const bootstrappedCharIdRef = useRef(boot.bootstrapped ? String(character.id) : '');
  const stateRef = useRef({
    messages: boot.messages,
    affection: boot.affection,
    story: boot.story,
    freeGainToday: boot.freeGainToday,
    freeGainDate: boot.freeGainDate,
    lastSeenAt: boot.lastSeenAt,
    meta: boot.meta,
  });
  const charId = String(character.id);
  const chatAvatar = resolveChatAvatarUrl(character);
  const characterRef = useRef(character);
  characterRef.current = character;

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
    /* id로 리마운트해 애니메이션/표시를 매번 다시 시작 */
    setAffToast({ delta, id: Date.now() });
    window.clearTimeout(affToastTimer.current);
    affToastTimer.current = window.setTimeout(() => setAffToast(null), 3000);
  }, []);

  const startEpisode = useMemo(
    () => resolveStartEpisode(character.chatbot),
    [character.chatbot],
  );
  /*
   * story가 아직 없으면(로딩) 스토리 잠금으로 보지 않음.
   * undefined completed = 미진행으로 오인해 "스토리를 진행해 주세요"가 깜빡이던 문제 방지.
   */
  const inStory =
    threadReady &&
    story != null &&
    needsStoryMode(character, story.completedEpisodeIds);
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
    const vid = visitorRef.current || getOrCreateChatVisitorId();
    visitorRef.current = vid;
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = 0;
    window.clearTimeout(storyTimer.current);
    replyLockRef.current = false;
    flushLockRef.current = false;

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
    bootstrappedCharIdRef.current = charId;
    setThreadReady(true);
    writeOcChatThreadCache(charId, vid, {
      messages: nextMessages,
      updatedAt: Date.now(),
      affection: 0,
      story: nextStory,
      freeGainDate: todayKeyLocal(),
      freeGainToday: 0,
      freeLossToday: 0,
      closedForToday: false,
      presence: emptyMeta.presence,
      presenceUpdatedAt: emptyMeta.presenceUpdatedAt,
      recentActions: [],
      pendingBehavior: undefined,
    });

    /* UI는 바로 비우고 완료 팝업 — 서버 삭제는 백그라운드 */
    setResetting(false);
    focusComposer();
    void alert('채팅을 초기화했습니다.', '완료');

    void (async () => {
      try {
        await resetOcChatThreadForVisitor(charId, vid);
        await saveOcChatThread(
          charId,
          vid,
          {
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
          },
          { replace: true },
        );
      } catch (e) {
        const msg = formatOcChatFirebaseError(e, '초기화에 실패했습니다');
        setError(msg);
      }
    })();
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
        story: snap.story ?? stateRef.current.story,
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
        /** flush epoch — 연타로 바뀌면 연출 중단·롤백 */
        expectEpoch?: number;
      },
    ): Promise<'ok' | 'regather'> => {
      let msgs = baseMessages;
      let nextMeta: MetaState = { ...stateRef.current.meta };
      let deliveredAssistant = false;
      const deliveredIds = new Set<string>();
      const playEpoch = opts.expectEpoch ?? burstEpochRef.current;
      replyLockRef.current = true;
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      visitorRef.current = vid;
      setOcChatPendingUiOwned(charId, vid, true);

      const lateBurstPending = () =>
        hasLateUserMessages(stateRef.current.messages, flushIncludedIdsRef.current) ||
        burstEpochRef.current !== playEpoch;

      const abortForRegather = async (): Promise<'regather'> => {
        cancelOcChatPendingDelivery(charId, vid);
        /* 이번 연출에서 붙인 assistant만 제거 — 이후 최신 버스트로 한 번만 재응답 */
        const rolled = stateRef.current.messages.filter((m) => !deliveredIds.has(m.id));
        msgs = rolled;
        stateRef.current = { ...stateRef.current, messages: rolled };
        setMessages(rolled);
        nextMeta = { ...nextMeta, pendingBehavior: undefined };
        setMeta(nextMeta);
        await persistSnapshot({
          messages: rolled,
          affection: opts.affection,
          story: opts.story,
          freeGainToday: opts.freeGainToday,
          freeGainDate: opts.freeGainDate,
          meta: nextMeta,
          skipSeen: true,
          lastSeenAt: stateRef.current.lastSeenAt,
        });
        console.info('[oc-chat-ui] abort play — regather burst', {
          rolledAway: deliveredIds.size,
        });
        return 'regather';
      };

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
        const willRespond =
          behavior.action === 'respond' ||
          behavior.action === 'end_for_today' ||
          behavior.action === 'read_only';
        const applyAt = computePendingApplyAt(behavior, wasOffline);
        const pending = behaviorToPending(behavior, applyAt);
        cancelOcChatPendingDelivery(charId, vid);

        /*
         * presence 규칙:
         * - respond/read_only/end → 읽음·타이핑 전에 반드시 online
         *   (모델이 offline을 줘도 무시 — 읽음이 오프라인에 뜨던 버그)
         * - ignore만 offline 유지/전환 허용
         */
        let nextPresence: OcChatPresence = nextMeta.presence;
        if (behavior.action === 'ignore') {
          if (behavior.presenceState === 'online' || behavior.presenceState === 'offline') {
            nextPresence = behavior.presenceState;
          }
        } else if (willRespond) {
          nextPresence = 'online';
        } else if (
          behavior.presenceState === 'online' ||
          behavior.presenceState === 'offline'
        ) {
          nextPresence = behavior.presenceState;
        }

        nextMeta = {
          ...nextMeta,
          pendingBehavior: pending,
          presence: nextPresence,
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
          if (!deliveredAssistant && lateBurstPending()) {
            return abortForRegather();
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
          return 'ok';
        }

        /* presence 먼저 반영 + pending 저장 — 오프→온이면 초록불이 읽음보다 먼저 */
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
        const delaySec = resolveResponseDelaySeconds({
          aiSeconds: behavior.responseDelaySeconds,
          delayKind: behavior.delay,
          wasOffline,
        });
        const fastRead =
          openRef.current &&
          shouldFastReadTransition({
            affection: stateRef.current.affection,
            responseDelaySeconds: delaySec,
            wasOffline,
          });

        const markReadNow = async () => {
          /* 읽음 직전에 한번 더 online 고정 */
          if (nextMeta.presence !== 'online') {
            nextMeta = {
              ...nextMeta,
              presence: 'online',
              presenceUpdatedAt: Date.now(),
            };
            setMeta(nextMeta);
          }
          const cur = markUserMessagesRead(stateRef.current.messages);
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
        };

        /*
         * 순서 고정: (오프면) 온라인 표시 → 대기(미읽음 "1") → 읽음 → 타이핑 → 답장
         * wasOffline이면 applyAt에 온라인이 된 뒤의 텀이 이미 포함됨.
         */
        if (openRef.current) setWaitingRead(true);
        if (wasOffline && openRef.current) {
          /* 초록불이 페인트된 뒤 읽음으로 넘어가게 한 프레임 양보 */
          await new Promise<void>((r) => {
            requestAnimationFrame(() => requestAnimationFrame(() => r()));
          });
        }
        if (fastRead) {
          const unreadFlashMs = rollFastUnreadVisibleMs();
          await sleepMs(unreadFlashMs);
          await markReadNow();
          const rest = Math.max(0, waitMs - unreadFlashMs);
          if (rest > 0) await sleepMs(rest);
        } else {
          const readLeadMs =
            waitMs > 1400 ? Math.min(700, Math.floor(waitMs * 0.14)) : 0;
          const untilRead = Math.max(0, waitMs - readLeadMs);
          if (untilRead > 0) await sleepMs(untilRead);
          if (openRef.current) await markReadNow();
          if (readLeadMs > 0) await sleepMs(readLeadMs);
        }

        if (!deliveredAssistant && lateBurstPending()) {
          return abortForRegather();
        }

        /* 창이 닫혀 있으면 조용히 배달 (미읽음 유지) */
        if (!openRef.current) {
          setOcChatPendingUiOwned(charId, vid, false);
          await tryDeliverPendingChat({
            characterId: charId,
            visitorId: vid,
            character,
            expectPendingId: pending.id,
            force: true,
          });
          const fresh = await loadOcChatThread(charId, vid);
          const closedMeta: MetaState = {
            ...nextMeta,
            pendingBehavior: fresh.pendingBehavior,
            presence: fresh.presence || nextMeta.presence,
            presenceUpdatedAt: fresh.presenceUpdatedAt,
            ...closedFieldsFromUntil(fresh.closedUntil),
            moodNote: fresh.moodNote || nextMeta.moodNote,
            recentActions: fresh.recentActions || nextMeta.recentActions,
          };
          /* flush가 이어지기 전에 stateRef를 동기화 — 답장 덮어쓰기 방지 */
          const closedMsgs = dedupeAdjacentAssistantMessages(fresh.messages);
          stateRef.current = {
            ...stateRef.current,
            messages: closedMsgs,
            meta: closedMeta,
            affection: typeof fresh.affection === 'number' ? fresh.affection : stateRef.current.affection,
            lastSeenAt:
              typeof fresh.lastSeenAt === 'number' ? fresh.lastSeenAt : stateRef.current.lastSeenAt,
          };
          setMessages(closedMsgs);
          setMeta(closedMeta);
          if (typeof fresh.affection === 'number') setAffection(fresh.affection);
          if (typeof fresh.lastSeenAt === 'number') setLastSeenAt(fresh.lastSeenAt);
          return 'ok';
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

        if (!deliveredAssistant && lateBurstPending()) {
          return abortForRegather();
        }

        if (behavior.action === 'read_only') {
          setWaitingRead(false);
          /* 읽씹 직후에도 바로 온 말은 한 번 더 읽음 */
          msgs = await absorbReads(2);
          if (!deliveredAssistant && lateBurstPending()) {
            return abortForRegather();
          }
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
          return 'ok';
        }

        setWaitingRead(false);
        /* 타이핑 들어가기 직전에도 화면 보고 있는 동안 온 말 흡수 */
        msgs = await absorbReads(1);

        if (!deliveredAssistant && lateBurstPending()) {
          return abortForRegather();
        }

        /* 이미 백그라운드/다른 경로가 이 예약을 배달했는지 확인 */
        {
          const fresh = await loadOcChatThread(charId, vid);
          const freshLines = dedupeAdjacentTextLines(
            (behavior.messages || []).filter(
              (line) => line.trim() && !looksLikeBehaviorDump(line),
            ),
          );
          const oursGone =
            !fresh.pendingBehavior ||
            (pending.id &&
              fresh.pendingBehavior.id &&
              fresh.pendingBehavior.id !== pending.id);
          const alreadyThere = pendingLinesAlreadyAtTail(fresh.messages, freshLines);
          if (oursGone && alreadyThere) {
            const synced = dedupeAdjacentAssistantMessages(fresh.messages);
            setMessages(synced);
            stateRef.current = { ...stateRef.current, messages: synced };
            nextMeta = {
              ...nextMeta,
              pendingBehavior: undefined,
              /* 연출 중 서버 stale offline으로 덮지 않음 */
              presence:
                fresh.presence === 'online'
                  ? 'online'
                  : nextMeta.presence === 'online'
                    ? 'online'
                    : fresh.presence === 'offline'
                      ? 'offline'
                      : nextMeta.presence || 'online',
              ...closedFieldsFromUntil(fresh.closedUntil),
            };
            setMeta(nextMeta);
            return 'ok';
          }
          if (alreadyThere) {
            const synced = dedupeAdjacentAssistantMessages(fresh.messages);
            setMessages(synced);
            stateRef.current = { ...stateRef.current, messages: synced };
            nextMeta = {
              ...nextMeta,
              pendingBehavior: undefined,
              presence: nextMeta.presence === 'online' ? 'online' : nextMeta.presence,
            };
            setMeta(nextMeta);
            return 'ok';
          }
        }

        const lines = dedupeAdjacentTextLines(
          behavior.messages.filter((line) => line.trim() && !looksLikeBehaviorDump(line)),
        );
        const sticker = resolveSticker(character.chatbot, behavior.sticker || null);

        for (let i = 0; i < lines.length; i++) {
          if (!openRef.current) {
            setOcChatPendingUiOwned(charId, vid, false);
            await tryDeliverPendingChat({
              characterId: charId,
              visitorId: vid,
              character,
              expectPendingId: pending.id,
              force: true,
            });
            const fresh = await loadOcChatThread(charId, vid);
            const synced = dedupeAdjacentAssistantMessages(fresh.messages);
            stateRef.current = {
              ...stateRef.current,
              messages: synced,
              meta: {
                ...stateRef.current.meta,
                pendingBehavior: fresh.pendingBehavior,
              },
              affection:
                typeof fresh.affection === 'number' ? fresh.affection : stateRef.current.affection,
            };
            setMessages(synced);
            if (typeof fresh.affection === 'number') setAffection(fresh.affection);
            return 'ok';
          }
          if (!deliveredAssistant && lateBurstPending()) {
            return abortForRegather();
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
          if (!deliveredAssistant && lateBurstPending()) {
            setBusy(false);
            return abortForRegather();
          }
          {
            const { head, lateUsers } = extractLateUserMessages(
              markUserMessagesRead(stateRef.current.messages),
              included,
            );
            /* 직전 말풍선이 같은 assistant 대사라면 이중 배달 — 턴 넘어 반복은 서버 검증이 담당 */
            const tail = head[head.length - 1];
            const sameAsImmediatePrev =
              !!tail &&
              tail.role === 'assistant' &&
              (tail.kind || 'chat') === 'chat' &&
              String(tail.content || '')
                .trim()
                .replace(/\s+/g, '') === String(line || '').trim().replace(/\s+/g, '');
            if (
              pendingLinesAlreadyAtTail(head, lines.slice(0, i + 1)) ||
              sameAsImmediatePrev
            ) {
              msgs = [...head, ...lateUsers];
              deliveredAssistant = true;
            } else {
              const botMsg = createChatMessage('assistant', line, 'chat', {
                at: Date.now() + i,
              });
              deliveredIds.add(botMsg.id);
              msgs = [...head, botMsg, ...lateUsers];
              deliveredAssistant = true;
            }
          }
          msgs = dedupeAdjacentAssistantMessages(msgs);
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
            setOcChatPendingUiOwned(charId, vid, false);
            await tryDeliverPendingChat({
              characterId: charId,
              visitorId: vid,
              character,
              expectPendingId: pending.id,
              force: true,
            });
            return 'ok';
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
            deliveredIds.add(stickerMsg.id);
            msgs = [...head, stickerMsg, ...lateUsers];
            deliveredAssistant = true;
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
          return 'ok';
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
        return 'ok';
      } finally {
        replyLockRef.current = false;
        setBusy(false);
        setWaitingRead(false);
        /* 연출 종료 — 창이 닫혀 있고 pending이 남았으면 타이머에 맡김 */
        const stillPending = stateRef.current.meta.pendingBehavior;
        setOcChatPendingUiOwned(charId, vid, false);
        if (!openRef.current && stillPending?.applyAt) {
          scheduleOcChatPendingDelivery(
            charId,
            vid,
            stillPending.applyAt,
            character,
            stillPending.id,
          );
        }
      }
    },
    [character, charId, persistSnapshot],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const vid = getOrCreateChatVisitorId();
    visitorRef.current = vid;
    const characterNow = characterRef.current;
    const cached = peekOcChatThreadCache(charId, vid);

    const ensureStory = (
      rawStory: OcChatStoryState | undefined,
      msgs: OcChatMessage[],
    ): OcChatStoryState | undefined => {
      let nextStory = recoverStoryIfFreeChatting(characterNow, rawStory, msgs) as
        | OcChatStoryState
        | undefined;
      const ep = resolveStartEpisode(characterNow.chatbot);
      if (ep && needsStoryMode(characterNow, nextStory?.completedEpisodeIds)) {
        const startId = episodeStartSceneId(ep);
        if (!nextStory || nextStory.episodeId !== ep.id || !nextStory.sceneId) {
          nextStory = {
            episodeId: ep.id,
            sceneId: startId || '',
            completedEpisodeIds: nextStory?.completedEpisodeIds || [],
          };
        }
      }
      return nextStory;
    };

    if (!cached || !cached.messages.length) {
      /* 이미 이 캐릭터 스레드를 불러온 상태면 그대로 확정 */
      if (
        bootstrappedCharIdRef.current === charId &&
        (stateRef.current.messages.length || stateRef.current.story)
      ) {
        setThreadReady(true);
        return;
      }
      /*
       * 캐시 없음: 서버 로드 전에 completedEpisodeIds=[]로 스토리 잠금을
       * 걸지 않는다. (자유채팅 유저에게 "스토리를 진행해 주세요" 깜빡임)
       */
      if (bootstrappedCharIdRef.current && bootstrappedCharIdRef.current !== charId) {
        setMessages([]);
        setStory(undefined);
        setAffection(0);
        stateRef.current = {
          ...stateRef.current,
          messages: [],
          story: undefined,
          affection: 0,
        };
      }
      setThreadReady(false);
      return;
    }

    const recoveredStory = ensureStory(cached.story, cached.messages);
    const nextMeta: MetaState = {
      moodNote: cached.moodNote,
      turnsToday: cached.turnsToday || 0,
      ...closedFieldsFromUntil(cached.closedUntil),
      pendingBehavior: cached.pendingBehavior,
      lastProactiveDate: cached.lastProactiveDate,
      freeLossToday: cached.freeLossToday || 0,
      recentDeltaReasons: cached.recentDeltaReasons || [],
      lastInteractionAt: cached.lastInteractionAt,
      neglectCheckedAt: cached.neglectCheckedAt,
      presence:
        cached.presence === 'online' || cached.presence === 'offline'
          ? cached.presence
          : stateRef.current.meta.presence || 'offline',
      presenceUpdatedAt: cached.presenceUpdatedAt || Date.now(),
      recentActions: cached.recentActions || [],
    };
    setMessages(cached.messages);
    setAffection(cached.affection || 0);
    setStory(recoveredStory);
    setFreeGainToday(cached.freeGainToday || 0);
    setFreeGainDate(cached.freeGainDate || todayKeyLocal());
    setLastSeenAt(cached.lastSeenAt || 0);
    setMeta(nextMeta);
    bootstrappedCharIdRef.current = charId;
    setThreadReady(true);
    stateRef.current = {
      messages: cached.messages,
      affection: cached.affection || 0,
      story: recoveredStory,
      freeGainToday: cached.freeGainToday || 0,
      freeGainDate: cached.freeGainDate || todayKeyLocal(),
      lastSeenAt: cached.lastSeenAt || 0,
      meta: nextMeta,
    };
    if (recoveredStory !== cached.story) {
      writeOcChatThreadCache(charId, vid, { ...cached, story: recoveredStory });
    }
  }, [open, charId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    /* 로딩 문구 없이 조용히 로드 — 캐시로 이미 그린 뒤 서버와 동기화 */
    setError('');
    setAwaitingChoice(false);
    setWaitingRead(false);
    revealedRef.current = new Set();
    window.clearTimeout(storyTimer.current);
    visitorRef.current = getOrCreateChatVisitorId();
    const characterNow = characterRef.current;
    void (async () => {
      try {
        /* 기한 지난 예약 답장 먼저 — 캐시 기준으로 즉시 배달 가능 */
        await tryDeliverPendingChat({
          characterId: charId,
          visitorId: visitorRef.current,
          character: characterNow,
        });
        if (cancelled) return;

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
          /* 서버에 presence 없으면 랜덤 롤 대신 현재(캐시) 유지 — 온오프 깜빡임 방지 */
          presence:
            thread.presence === 'online' || thread.presence === 'offline'
              ? thread.presence
              : stateRef.current.meta.presence || 'offline',
          presenceUpdatedAt:
            thread.presence === 'online' || thread.presence === 'offline'
              ? thread.presenceUpdatedAt || Date.now()
              : stateRef.current.meta.presenceUpdatedAt || Date.now(),
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
        /* setMeta/setStory는 아래에서 한 번에 — 중간 깜빡임 방지 */

        const ep = resolveStartEpisode(characterNow.chatbot);
        let nextStory = recoverStoryIfFreeChatting(
          characterNow,
          thread.story,
          thread.messages,
        ) as OcChatStoryState | undefined;
        let nextMessages = thread.messages;

        if (ep && needsStoryMode(characterNow, nextStory?.completedEpisodeIds)) {
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
          const greeting = defaultChatGreeting(characterNow);
          if (greeting) {
            nextMessages = [createChatMessage('assistant', greeting, 'chat')];
          }
        }

        /* 기한 지난 예약 답장 — 열자마자 배달 (이미 닫힌 동안 백그라운드가 했을 수도) */
        let pending = thread.pendingBehavior;
        if (
          pending &&
          pending.applyAt <= Date.now() &&
          !needsStoryMode(characterNow, nextStory?.completedEpisodeIds)
        ) {
          await tryDeliverPendingChat({
            characterId: charId,
            visitorId: visitorRef.current,
            character: characterNow,
          });
          const fresh = await loadOcChatThread(charId, visitorRef.current);
          nextMessages = fresh.messages;
          affectionNow = fresh.affection;
          nextMeta = {
            ...nextMeta,
            pendingBehavior: fresh.pendingBehavior,
            presence:
              fresh.presence === 'online' || fresh.presence === 'offline'
                ? fresh.presence
                : nextMeta.presence,
            presenceUpdatedAt:
              fresh.presence === 'online' || fresh.presence === 'offline'
                ? fresh.presenceUpdatedAt || Date.now()
                : nextMeta.presenceUpdatedAt,
            ...closedFieldsFromUntil(fresh.closedUntil),
            moodNote: fresh.moodNote || nextMeta.moodNote,
            recentActions: fresh.recentActions || nextMeta.recentActions,
          };
          pending = fresh.pendingBehavior;
        }

        const seenNow = Date.now();
        setLastSeenAt(seenNow);
        setAffection(affectionNow);
        setMeta(nextMeta);
        setStory(nextStory);
        setMessages(nextMessages);
        bootstrappedCharIdRef.current = charId;
        setThreadReady(true);
        stateRef.current = {
          ...stateRef.current,
          messages: nextMessages,
          affection: affectionNow,
          story: nextStory,
          lastSeenAt: seenNow,
          meta: nextMeta,
        };
        writeOcChatThreadCache(charId, visitorRef.current, {
          ...thread,
          messages: nextMessages,
          affection: affectionNow,
          story: nextStory,
          lastSeenAt: seenNow,
          pendingBehavior: pending,
          updatedAt: Date.now(),
        });

        try {
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
        } catch (saveErr) {
          /* 로드는 성공했는데 저장만 실패하면 대화를 비우지 않는다 */
          if (!cancelled) {
            setError(formatOcChatFirebaseError(saveErr, '대화 저장에 실패했습니다'));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatOcChatFirebaseError(err, '대화를 불러오지 못했습니다'));
          /* 로드 실패 시에도 잠금 문구로 묶지 않음 — 캐시가 있으면 그 기준 유지 */
          setThreadReady(true);
        }
      } finally {
        if (!cancelled) {
          focusComposer();
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
  }, [charId, open]);

  /* end_for_today 쿨다운 만료 시 구분선 해제 */
  useEffect(() => {
    if (!open) return;
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
  }, [open, meta.closedUntil, meta.closedForToday, persistSnapshot]);

  /* 앰비언트 온라인/오프라인 — 답장 연출 중이 아닐 때만 */
  useEffect(() => {
    if (!open || inStory) return;
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
    /* 열자마자 바로 굴리지 않음 — 첫 틱은 간격 뒤 */
    const id = window.setInterval(tick, 70_000);
    return () => window.clearInterval(id);
  }, [busy, charId, inStory, open, waitingRead]);

  /* 스토리 씬 공개 + 자동 진행 */
  useEffect(() => {
    if (!open || !inStory || !activeEpisode || !story?.sceneId) {
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
    onClose,
    open,
    persistSnapshot,
    story?.completedEpisodeIds,
    story?.episodeId,
    story?.sceneId,
  ]);

  useEffect(() => {
    if (!open) return;
    scrollToEnd();
  }, [messages, busy, waitingRead, awaitingChoice, open, scrollToEnd]);

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
    if (inStory) return;
    if (isChatClosedNow(stateRef.current.meta.closedUntil)) return;
    if (stateRef.current.meta.closedForToday || stateRef.current.meta.closedUntil) {
      const unlocked = withChatUnlocked(stateRef.current.meta);
      stateRef.current.meta = unlocked;
      setMeta(unlocked);
    }

    const last0 = stateRef.current.messages[stateRef.current.messages.length - 1];
    if (!last0 || last0.role !== 'user') return;

    flushLockRef.current = true;
    pendingFlushRef.current = false;

    const scheduleTrailingFlush = () => {
      window.clearTimeout(debounceTimer.current);
      const elapsed = Date.now() - lastUserSendAtRef.current;
      const wait = Math.max(0, OC_CHAT_SEND_DEBOUNCE_MS - elapsed);
      debounceTimer.current = window.setTimeout(() => {
        void flushDebouncedChat();
      }, wait);
    };

    const waitBurstQuiet = async () => {
      for (;;) {
        const wait = OC_CHAT_SEND_DEBOUNCE_MS - (Date.now() - lastUserSendAtRef.current);
        if (wait <= 0) return;
        await sleepMs(wait);
      }
    };

    const isAbortError = (err: unknown) =>
      (typeof DOMException !== 'undefined' &&
        err instanceof DOMException &&
        err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError');

    let includedAtStart = new Set<string>();
    const userBurstAtStart = countTrailingUserBurst(stateRef.current.messages);

    try {
      for (let attempt = 0; attempt <= OC_CHAT_BURST_REGATHER_MAX; attempt++) {
        if (attempt > 0) await waitBurstQuiet();

        const withUser = stateRef.current.messages;
        const last = withUser[withUser.length - 1];
        if (!last || last.role !== 'user') return;

        includedAtStart = new Set(withUser.map((m) => m.id));
        flushIncludedIdsRef.current = includedAtStart;
        const myEpoch = burstEpochRef.current;
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

        let burstStart = withUser.length - 1;
        while (burstStart > 0 && withUser[burstStart - 1]?.role === 'user') {
          burstStart -= 1;
        }
        const beforeBurstAt =
          burstStart > 0 ? withUser[burstStart - 1]?.at : undefined;

        flushAbortRef.current?.abort();
        const ac = new AbortController();
        flushAbortRef.current = ac;

        let result: Awaited<ReturnType<typeof postOcChat>>;
        try {
          result = await postOcChat({
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
            signal: ac.signal,
          });
        } catch (err) {
          if (isAbortError(err) || burstEpochRef.current !== myEpoch) {
            console.info('[oc-chat-ui] discard aborted API — newer burst', { attempt });
            continue;
          }
          throw err;
        }

        /* API 대기 중 연타 → 불완전 응답 버리고 묶어서 재요청 */
        if (
          burstEpochRef.current !== myEpoch ||
          (hasLateUserMessages(stateRef.current.messages, includedAtStart) &&
            attempt < OC_CHAT_BURST_REGATHER_MAX)
        ) {
          console.info('[oc-chat-ui] discard API reply — burst grew', {
            attempt,
            late: countTrailingUserBurst(stateRef.current.messages),
            epochChanged: burstEpochRef.current !== myEpoch,
          });
          continue;
        }

        const reasons = [...(metaSnap.recentDeltaReasons || [])];
        if (result.deltaReason && result.affinityDelta !== 0) {
          reasons.push(result.deltaReason);
        }

        /* 호감·토스트는 읽음→답장 연출 끝난 뒤에만 (전송 직후 선반영 금지) */
        const playResult = await playBehavior(result.behavior, stateRef.current.messages, {
          affection: result.affection,
          freeGainToday: result.freeGainToday,
          freeGainDate: result.freeGainDate,
          story: st,
          expectEpoch: myEpoch,
        });

        if (
          playResult === 'regather' ||
          burstEpochRef.current !== myEpoch
        ) {
          if (attempt < OC_CHAT_BURST_REGATHER_MAX) {
            console.info('[oc-chat-ui] regather after play abort', { attempt });
            continue;
          }
        }

        if (burstEpochRef.current !== myEpoch) {
          continue;
        }

        const afterMeta: MetaState = {
          ...stateRef.current.meta,
          freeLossToday: result.freeLossToday,
          recentDeltaReasons: reasons.slice(-8),
          lastInteractionAt: Date.now(),
          moodNote: result.behavior.moodNote || stateRef.current.meta.moodNote,
        };
        setMeta(afterMeta);

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
          meta: afterMeta,
        });
        break;
      }
    } catch (err) {
      if (
        !(
          (typeof DOMException !== 'undefined' &&
            err instanceof DOMException &&
            err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        )
      ) {
        setError(formatOcChatFirebaseError(err, '전송 실패'));
      }
    } finally {
      flushLockRef.current = false;
      if (flushAbortRef.current) {
        flushAbortRef.current = null;
      }
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
    persistSnapshot,
    playBehavior,
  ]);

  const send = useCallback(async () => {
    const text = input.trim();
    /* 답장 대기 중에도 추가 전송 허용 (디바운스/다음 턴으로 이어짐) */
    if (!text || inStory) return;
    const ban = checkChatBanned(text);
    if (ban.blocked) {
      setError(chatBanUserMessage(ban.reason));
      focusComposer();
      return;
    }
    setInput('');
    setError('');
    focusComposer();
    /* "1"은 항상 잠깐이라도 보이게 — 전송 직후 읽음 선반영 금지 */
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

    /* OC가 화면 보고 있는 중이면 짧게 "1" 후 읽음 (빠른 전환 최소 노출) */
    if (replyLockRef.current) {
      const flashMs = rollFastUnreadVisibleMs();
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
      }, flashMs);
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

      /* AI 응답 중이면 진행 중 요청 무효화 + 최신 입력으로 다시 묶음 */
      if (flushLockRef.current || replyLockRef.current) {
        pendingFlushRef.current = true;
        burstEpochRef.current += 1;
        flushAbortRef.current?.abort();
        return;
      }

      /* 마지막 메시지 기준 N초 — 새 말이 오면 타이머 리셋 */
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        void flushDebouncedChat();
      }, OC_CHAT_SEND_DEBOUNCE_MS);
    } catch (err) {
      setError(formatOcChatFirebaseError(err, '전송 실패'));
      focusComposer();
    }
  }, [
    flushDebouncedChat,
    focusComposer,
    inStory,
    input,
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

  flushDebouncedChatRef.current = flushDebouncedChat;

  /*
   * 상세/패널 언마운트: 디바운스만 지우고 끝내면 답장이 영구히 안 옴.
   * - 진행 중 flush/연출이면 open만 false로 넘겨 finally·강제 배달에 맡김
   * - 대기만 하던 유저 말이면 즉시 flush
   * - pending이 있으면 백그라운드 타이머 재예약
   */
  useEffect(() => {
    return () => {
      openRef.current = false;
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = 0;

      const vid = visitorRef.current || getOrCreateChatVisitorId();
      const pending = stateRef.current.meta.pendingBehavior;

      if (replyLockRef.current || flushLockRef.current) {
        /* in-flight: playBehavior finally가 uiOwned 해제 + 닫힌 창 배달 */
        return;
      }

      setOcChatPendingUiOwned(charId, vid, false);
      if (pending?.applyAt) {
        scheduleOcChatPendingDelivery(
          charId,
          vid,
          pending.applyAt,
          characterRef.current,
          pending.id,
        );
      }

      const last = stateRef.current.messages[stateRef.current.messages.length - 1];
      if (last?.role === 'user' || pendingFlushRef.current) {
        pendingFlushRef.current = false;
        void flushDebouncedChatRef.current();
      }
    };
  }, [charId]);

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
  // 헤더 상태 문구는 스토리 제목/임시 문구 대신 온라인/오프라인만 고정.
  const statusLabel = isOnline ? '온라인' : '오프라인';

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
            key={affToast.id}
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
          {messages.map((m, i) => {
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
            })}
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
          {meta.closedForToday ? (
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
              disabled={!threadReady || inStory}
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={!threadReady || inStory || !input.trim()}
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
