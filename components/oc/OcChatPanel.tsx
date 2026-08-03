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
  collectLocalOcChatInbox,
  completeOcChatReplyInBackground,
  computePendingApplyAt,
  createChatMessage,
  chatDayKey,
  dedupeAdjacentAssistantMessages,
  dedupeAdjacentTextLines,
  fetchOcChatInbox,
  formatChatClock,
  formatChatDayLabel,
  getOrCreateChatVisitorId,
  isChatClusterMate,
  lastMessageAt,
  loadOcChatThread,
  markUserMessagesRead,
  markUserMessagesReadThroughLastAssistant,
  mergeOcChatInboxItems,
  isOcChatUserMsgUnread,
  OC_CHAT_REGATHER_QUIET_MS,
  OC_CHAT_BURST_REGATHER_MAX,
  resolveOcChatSendDebounceMs,
  extractLateUserMessages,
  hasLateUserMessages,
  countTrailingUserBurst,
  ocChatNeedsReplyToTrailingUsers,
  formatOcChatFirebaseError,
  isOcChatTransientBusyError,
  mergeOcChatThreads,
  parkOcChatBehaviorAsPending,
  peekOcChatThreadCache,
  pendingLinesAlreadyAtTail,
  postOcChat,
  queuePendingAffectionToast,
  resetOcChatThreadForVisitor,
  saveOcChatThread,
  scheduleOcChatPendingDelivery,
  setOcChatPendingUiOwned,
  setOcChatReplyGenerationInflight,
  sleepMs,
  subscribeOcChatThreadCache,
  takePendingAffectionToast,
  tryDeliverPendingChat,
  writeOcChatThreadCache,
  type OcChatInboxItem,
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
import {
  areNearDuplicateLines,
  collapseSameIntentShortBubbles,
} from '@/lib/oc/ocChatVerify';
import type { OcChatEpisode, OcChatEpisodeChoice, OcCharacter } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';
import { OcChatAffinityTierToast } from '@/components/oc/OcChatAffinityTierToast';
import { OcChatInboxList } from '@/components/oc/OcChatInboxList';
import {
  buildAffinityTierToastPayload,
  queuePendingAffinityTierToast,
  takePendingAffinityTierToasts,
  type OcChatAffinityTierToastPayload,
} from '@/lib/oc/ocChatAffinityTierToastQueue';

type Props = {
  open: boolean;
  character: OcCharacter;
  characters?: OcCharacter[];
  onClose: () => void;
  onSelectCharacter?: (character: OcCharacter) => void;
  /** 목록/스레드 — 부모 알림 억제·배지용 */
  onPhoneViewChange?: (view: 'list' | 'thread') => void;
};

type PhoneView = 'list' | 'thread';

const STORY_AUTO_MS = 720;

type MetaState = {
  moodNote?: string;
  turnsToday: number;
  closedForToday: boolean;
  /** 이 시각까지 응답 잠금 */
  closedUntil?: number;
  pendingBehavior?: OcChatPendingBehavior;
  /** pending 취소·배달 완료 시각 — merge가 옛 예약을 되살리지 않게 */
  pendingClearedAt?: number;
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

function clearPendingMeta(
  meta: MetaState,
  pending: OcChatPendingBehavior | undefined = meta.pendingBehavior,
): MetaState {
  return {
    ...meta,
    pendingBehavior: undefined,
    pendingClearedAt: Math.max(
      meta.pendingClearedAt || 0,
      pending?.createdAt && pending.createdAt > 0 ? pending.createdAt : Date.now(),
    ),
  };
}

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

export function OcChatPanel({
  open,
  character,
  characters = [],
  onClose,
  onSelectCharacter,
  onPhoneViewChange,
}: Props) {
  const { confirm, alert } = useLakeDialog();
  const bootRef = useRef<BootChatState | null>(null);
  if (bootRef.current == null) {
    bootRef.current = bootChatStateFromCache(character);
  }
  const boot = bootRef.current;

  const [messages, setMessages] = useState<OcChatMessage[]>(() => boot.messages);
  const [affection, setAffection] = useState(() => boot.affection);
  /** 하트 관계 패널 수치 — ±알약 토스트가 뜬 뒤에만 갱신 (선반영 금지) */
  const [displayAffection, setDisplayAffection] = useState(() => boot.affection);
  const pendingDisplayAffectionRef = useRef<number | null>(null);
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
  const [affToast, setAffToast] = useState<{
    delta: number;
    id: number;
    leaving?: boolean;
  } | null>(null);
  /** 호감 단계 변화 토스트 큐 — 동시에 1개만 표시 */
  const [tierToastQueue, setTierToastQueue] = useState<OcChatAffinityTierToastPayload[]>(
    [],
  );
  const [panelAnim, setPanelAnim] = useState<'in' | 'out' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [relationAnim, setRelationAnim] = useState<'in' | 'out' | null>(null);
  const [phoneView, setPhoneView] = useState<PhoneView>('thread');
  const [inboxItems, setInboxItems] = useState<OcChatInboxItem[]>([]);
  const [unreadWhileScrolled, setUnreadWhileScrolled] = useState(0);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const affToastTimer = useRef(0);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const unreadWhileScrolledRef = useRef(0);
  const prevMsgCountRef = useRef(0);
  const jumpBottomOnEnterRef = useRef(false);
  /** 사용자가 하단 근처에 있을 때 true — 새 메시지 추가 후에도 "따라가기"용 */
  const stickToBottomRef = useRef(true);
  const visitorRef = useRef('');
  const revealedRef = useRef<Set<string>>(new Set());
  const storyTimer = useRef(0);
  const debounceTimer = useRef(0);
  const flushLockRef = useRef(false);
  const pendingFlushRef = useRef(false);
  /** 연타로 진행 중 요청을 무효화할 때 증가 */
  const burstEpochRef = useRef(0);
  /** 초기화 세대 — 이전 persist/flush가 옛 대화를 다시 저장하지 못하게 */
  const resetEpochRef = useRef(0);
  /** in-flight postOcChat 취소 */
  const flushAbortRef = useRef<AbortController | null>(null);
  /** 마지막 유저 전송 시각 — trailing debounce 기준 */
  const lastUserSendAtRef = useRef(0);
  /** 이번 flush가 API에 넣은 메시지 id — 도중 연타는 late로 분리 */
  const flushIncludedIdsRef = useRef<Set<string>>(new Set());
  const memorySummaryRef = useRef<string | undefined>(undefined);
  const memorySummaryThroughAtRef = useRef<number | undefined>(undefined);
  const userMemoryRef = useRef<string | undefined>(undefined);
  const userMemoryThroughAtRef = useRef<number | undefined>(undefined);
  const memoryBootedRef = useRef(false);
  const openRef = useRef(open);
  const replyLockRef = useRef(false);
  /** 언마운트 시 stale 없이 flush 호출 */
  const flushDebouncedChatRef = useRef<() => Promise<void>>(async () => {});
  /** AI 혼잡 시 에러 문구 없이 재flush — 무한 루프 방지 */
  const busySilentRetryRef = useRef(0);
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
  /** 렌더 중·비동기 콜백이 참조하는 “지금 열린 OC” — stale persist/setMessages 차단 */
  const activeCharIdRef = useRef(charId);
  activeCharIdRef.current = charId;
  const chatAvatar = resolveChatAvatarUrl(character);
  const characterRef = useRef(character);
  characterRef.current = character;

  openRef.current = open;
  const phoneViewRef = useRef<PhoneView>(phoneView);
  phoneViewRef.current = phoneView;
  /** 스레드를 직접 보고 있을 때만 읽음/lastSeen 갱신 — 목록 대기 중엔 미읽음 유지 */
  const isViewingThread = useCallback(
    () => openRef.current && phoneViewRef.current === 'thread',
    [],
  );
  stateRef.current = {
    messages,
    affection,
    story,
    freeGainToday,
    freeGainDate,
    lastSeenAt,
    meta,
  };

  const stillOnChar = useCallback((expectId: string) => {
    return activeCharIdRef.current === String(expectId);
  }, []);

  /* 캐릭터 전환 시 장기 기억 다시 시드 */
  useEffect(() => {
    memoryBootedRef.current = false;
    memorySummaryRef.current = undefined;
    memorySummaryThroughAtRef.current = undefined;
    userMemoryRef.current = undefined;
    userMemoryThroughAtRef.current = undefined;
    setTierToastQueue([]);
    setAffToast(null);
    pendingDisplayAffectionRef.current = null;
    try {
      const vid = getOrCreateChatVisitorId();
      const cached = peekOcChatThreadCache(charId, vid);
      if (cached?.memorySummary) memorySummaryRef.current = cached.memorySummary;
      if (typeof cached?.memorySummaryThroughAt === 'number') {
        memorySummaryThroughAtRef.current = cached.memorySummaryThroughAt;
      }
      if (cached?.userMemory) userMemoryRef.current = cached.userMemory;
      if (typeof cached?.userMemoryThroughAt === 'number') {
        userMemoryThroughAtRef.current = cached.userMemoryThroughAt;
      }
    } catch {
      /* ignore */
    }
    memoryBootedRef.current = true;
  }, [charId]);

  /* 캐시 부트 시 장기 기억 시드 (한 번) */
  if (!memoryBootedRef.current) {
    memoryBootedRef.current = true;
    try {
      const vid = getOrCreateChatVisitorId();
      const cached = peekOcChatThreadCache(String(character.id), vid);
      if (cached?.memorySummary) memorySummaryRef.current = cached.memorySummary;
      if (typeof cached?.memorySummaryThroughAt === 'number') {
        memorySummaryThroughAtRef.current = cached.memorySummaryThroughAt;
      }
      if (cached?.userMemory) userMemoryRef.current = cached.userMemory;
      if (typeof cached?.userMemoryThroughAt === 'number') {
        userMemoryThroughAtRef.current = cached.userMemoryThroughAt;
      }
    } catch {
      /* ignore */
    }
  }

  const syncDisplayAffection = useCallback((next: number) => {
    pendingDisplayAffectionRef.current = null;
    setDisplayAffection(clampAffection(next));
  }, []);

  const deferDisplayAffectionUntilToast = useCallback((next: number) => {
    pendingDisplayAffectionRef.current = clampAffection(next);
  }, []);

  const showAffectionToastNow = useCallback((delta: number) => {
    if (!delta) return;
    window.clearTimeout(affToastTimer.current);
    setAffToast({ delta, id: Date.now(), leaving: false });
    /* 알약 state 반영 후 다음 프레임에 하트 수치 — 토스트보다 먼저 올라가지 않게 */
    const pending = pendingDisplayAffectionRef.current;
    if (pending != null) {
      pendingDisplayAffectionRef.current = null;
      requestAnimationFrame(() => setDisplayAffection(pending));
    }
    /* 유지 ~4.5s 후 아웃(인 280ms와 동일) → 언마운트 */
    const holdMs = 4500;
    const leaveMs = 280;
    affToastTimer.current = window.setTimeout(() => {
      setAffToast((cur) => (cur ? { ...cur, leaving: true } : null));
      affToastTimer.current = window.setTimeout(() => setAffToast(null), leaveMs + 40);
    }, holdMs);
  }, []);

  const flashAffectionToast = useCallback(
    (delta: number) => {
      if (!delta) return;
      /*
       * 스레드를 보고 있을 때만 즉시 표시.
       * 목록·채팅 닫힘·다른 화면이면 쌓아 두었다가 다시 스레드 진입 시 표시.
       * (대기 중엔 displayAffection도 올리지 않음 — showAffectionToastNow에서 커밋)
       */
      if (!isViewingThread()) {
        const vid = visitorRef.current || getOrCreateChatVisitorId();
        visitorRef.current = vid;
        queuePendingAffectionToast(activeCharIdRef.current || charId, vid, delta);
        return;
      }
      showAffectionToastNow(delta);
    },
    [charId, isViewingThread, showAffectionToastNow],
  );

  const enqueueAffinityTierToast = useCallback(
    (payload: OcChatAffinityTierToastPayload) => {
      if (!isViewingThread()) {
        const vid = visitorRef.current || getOrCreateChatVisitorId();
        visitorRef.current = vid;
        queuePendingAffinityTierToast(activeCharIdRef.current || charId, vid, payload);
        return;
      }
      setTierToastQueue((q) => [...q, payload]);
    },
    [charId, isViewingThread],
  );

  const flashAffinityTierToast = useCallback(
    (prevAffection: number, nextAffection: number) => {
      const payload = buildAffinityTierToastPayload({
        name: characterRef.current.name || '캐릭터',
        avatarUrl: resolveChatAvatarUrl(characterRef.current),
        prevAffection,
        nextAffection,
        chatbot: characterRef.current.chatbot,
      });
      if (!payload) return;
      enqueueAffinityTierToast(payload);
    },
    [enqueueAffinityTierToast],
  );

  const onAffinityTierToastDone = useCallback((id: string) => {
    setTierToastQueue((q) => q.filter((p) => p.id !== id));
  }, []);

  /* 스레드로 돌아오면 못 본 호감 토스트 합산 표시 */
  useEffect(() => {
    if (!open || phoneView !== 'thread' || !threadReady) return;
    const vid = visitorRef.current || getOrCreateChatVisitorId();
    visitorRef.current = vid;
    const pending = takePendingAffectionToast(charId, vid);
    if (pending) showAffectionToastNow(pending);
    const pendingTiers = takePendingAffinityTierToasts(charId, vid);
    if (pendingTiers.length) {
      setTierToastQueue((q) => [...q, ...pendingTiers]);
    }
  }, [open, phoneView, threadReady, charId, showAffectionToastNow]);

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
  const affinityTier = resolveAffinityTier(displayAffection, character.chatbot);
  const activeEpisode: OcChatEpisode | null =
    inStory && startEpisode ? startEpisode : null;
  const activeScene =
    activeEpisode && story?.sceneId
      ? findEpisodeScene(activeEpisode, story.sceneId)
      : null;
  const choices = (activeScene?.choices || []).filter((c) => c.text?.trim());

  const NEAR_BOTTOM_PX = 80;

  const isNearBottom = useCallback(() => {
    const el = threadRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  /**
   * fromScroll: 사용자/프로그램 스크롤 이벤트일 때만 stick 갱신.
   * 메시지 추가로 scrollHeight만 커진 뒤 호출하면 바닥인데도 stick이 꺼져 알약이 뜬다.
   */
  const updateScrollUI = useCallback((opts?: { fromScroll?: boolean }) => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < NEAR_BOTTOM_PX;
    if (opts?.fromScroll) {
      stickToBottomRef.current = near;
    } else if (near) {
      stickToBottomRef.current = true;
    }
    if (near || stickToBottomRef.current) {
      if (unreadWhileScrolledRef.current !== 0) {
        unreadWhileScrolledRef.current = 0;
        setUnreadWhileScrolled(0);
      }
      setShowScrollFab((v) => (v ? false : v));
      return;
    }
    if (unreadWhileScrolledRef.current > 0) {
      setShowScrollFab((v) => (v ? false : v));
      return;
    }
    const wantFab = distanceFromBottom > 220;
    setShowScrollFab((v) => (v === wantFab ? v : wantFab));
  }, []);

  const scrollToEnd = useCallback(
    (opts?: { force?: boolean; smooth?: boolean }): boolean => {
      const el = threadRef.current;
      if (!el) return false;
      const force = opts?.force !== false;
      const smooth = opts?.smooth === true;
      if (!force && !stickToBottomRef.current && !isNearBottom()) return false;
      stickToBottomRef.current = true;
      if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
      if (unreadWhileScrolledRef.current !== 0) {
        unreadWhileScrolledRef.current = 0;
        setUnreadWhileScrolled(0);
      }
      setShowScrollFab((v) => (v ? false : v));
      return true;
    },
    [isNearBottom],
  );

  const onMessagesAppended = useCallback(
    (added: number) => {
      if (added <= 0) return;
      /*
       * 새 말풍선이 붙으면 scrollHeight만 커져 isNearBottom()이 false가 됨.
       * 스크롤 리스너로 유지한 stick 플래그로 "따라가기" vs 알약 분기.
       */
      if (stickToBottomRef.current) {
        scrollToEnd({ force: true, smooth: false });
        return;
      }
      unreadWhileScrolledRef.current += added;
      setUnreadWhileScrolled(unreadWhileScrolledRef.current);
      setShowScrollFab((v) => (v ? false : v));
    },
    [scrollToEnd],
  );

  const inboxFetchGenRef = useRef(0);

  const refreshInbox = useCallback(async (opts?: { remote?: boolean }) => {
    const vid = visitorRef.current || getOrCreateChatVisitorId();
    visitorRef.current = vid;
    const chatbotIds = characters
      .filter((c) => c.chatbot?.enabled)
      .map((c) => String(c.id));
    const readLocal = () => collectLocalOcChatInbox(vid, chatbotIds);
    /* 로컬은 즉시·단조 병합 — 미리보기 깜빡임 방지 */
    setInboxItems((prev) => mergeOcChatInboxItems(prev, readLocal()));
    if (opts?.remote === false) return;

    const gen = ++inboxFetchGenRef.current;
    try {
      const remote = await fetchOcChatInbox(vid);
      if (gen !== inboxFetchGenRef.current) return;
      /* await 이후 최신 로컬을 다시 읽어, 늦게 도착한 옛 remote가 덮지 않게 */
      setInboxItems((prev) => mergeOcChatInboxItems(prev, remote, readLocal()));
    } catch {
      if (gen !== inboxFetchGenRef.current) return;
      setInboxItems((prev) => mergeOcChatInboxItems(prev, readLocal()));
    }
  }, [characters]);

  useEffect(() => {
    if (!open) {
      setPhoneView('thread');
      unreadWhileScrolledRef.current = 0;
      setUnreadWhileScrolled(0);
      setShowScrollFab(false);
      stickToBottomRef.current = true;
      return;
    }
    /* 열릴 때만 스레드로 — 목록 보는 중 characters 갱신에 튕기지 않음 */
    setPhoneView('thread');
    jumpBottomOnEnterRef.current = true;
    stickToBottomRef.current = true;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void refreshInbox();
  }, [open, refreshInbox]);

  /* 로컬 스레드 갱신 = 목록 미리보기 + (열려 있는 방) 말풍선 즉시 반영 */
  useEffect(() => {
    if (!open) return;
    const vid = visitorRef.current || getOrCreateChatVisitorId();
    visitorRef.current = vid;
    return subscribeOcChatThreadCache((characterId, visitorId) => {
      if (visitorId !== vid) return;
      void refreshInbox({ remote: false });
      /*
       * AlertHost/백그라운드 배달이 캐시만 갱신하면 React messages는 옛 상태.
       * 목록: 숨은 스레드도 맞춤 (읽음 X).
       * 스레드: 보고 있는 방이면 말풍선 반영 (연출 중 replyLock이면 건드리지 않음).
       */
      if (String(characterId) !== String(activeCharIdRef.current)) return;
      const onList = phoneViewRef.current === 'list';
      const onThread = phoneViewRef.current === 'thread';
      if (!onList && !onThread) return;
      if (onThread && replyLockRef.current) return;
      const cached = peekOcChatThreadCache(characterId, visitorId);
      if (!cached?.messages?.length) return;
      const ui = stateRef.current.messages;
      const uiIds = new Set(ui.map((m) => m.id));
      const hasMissing = cached.messages.some((m) => !uiIds.has(m.id));
      const longer = cached.messages.length > ui.length;
      const lastDiffers =
        Boolean(cached.messages.length && ui.length) &&
        cached.messages[cached.messages.length - 1]?.id !== ui[ui.length - 1]?.id;
      if (!hasMissing && !longer && !lastDiffers) {
        /* 메시지 동일해도 pending 해제만 캐시에 반영된 경우 meta 동기화 */
        if (
          onThread &&
          stateRef.current.meta.pendingBehavior &&
          !cached.pendingBehavior
        ) {
          const cleared = { ...stateRef.current.meta, pendingBehavior: undefined };
          setMeta(cleared);
          stateRef.current = { ...stateRef.current, meta: cleared };
        }
        return;
      }
      const affectionNow =
        typeof cached.affection === 'number'
          ? clampAffection(cached.affection)
          : stateRef.current.affection;
      const nextMeta: MetaState = {
        ...stateRef.current.meta,
        moodNote: cached.moodNote ?? stateRef.current.meta.moodNote,
        turnsToday: cached.turnsToday ?? stateRef.current.meta.turnsToday,
        ...closedFieldsFromUntil(cached.closedUntil ?? stateRef.current.meta.closedUntil),
        pendingBehavior: cached.pendingBehavior,
        pendingClearedAt: cached.pendingClearedAt ?? stateRef.current.meta.pendingClearedAt,
        lastProactiveDate: cached.lastProactiveDate ?? stateRef.current.meta.lastProactiveDate,
        freeLossToday: cached.freeLossToday ?? stateRef.current.meta.freeLossToday,
        recentDeltaReasons: cached.recentDeltaReasons ?? stateRef.current.meta.recentDeltaReasons,
        lastInteractionAt: cached.lastInteractionAt ?? stateRef.current.meta.lastInteractionAt,
        neglectCheckedAt: cached.neglectCheckedAt ?? stateRef.current.meta.neglectCheckedAt,
        presence:
          cached.presence === 'online' || cached.presence === 'offline'
            ? cached.presence
            : stateRef.current.meta.presence,
        presenceUpdatedAt:
          typeof cached.presenceUpdatedAt === 'number'
            ? cached.presenceUpdatedAt
            : stateRef.current.meta.presenceUpdatedAt,
        recentActions: cached.recentActions ?? stateRef.current.meta.recentActions,
      };
      const seenNow = onThread ? Date.now() : stateRef.current.lastSeenAt;
      setMessages(cached.messages);
      setAffection(affectionNow);
      if (pendingDisplayAffectionRef.current == null) setDisplayAffection(affectionNow);
      setMeta(nextMeta);
      if (cached.story) setStory(cached.story);
      if (onThread) setLastSeenAt(seenNow);
      stateRef.current = {
        ...stateRef.current,
        messages: cached.messages,
        affection: affectionNow,
        story: cached.story ?? stateRef.current.story,
        lastSeenAt: seenNow,
        meta: nextMeta,
      };
      if (onThread) {
        jumpBottomOnEnterRef.current = true;
        requestAnimationFrame(() => {
          scrollToEnd({ force: true, smooth: true });
        });
        writeOcChatThreadCache(characterId, visitorId, {
          ...cached,
          lastSeenAt: seenNow,
          updatedAt: Math.max(cached.updatedAt || 0, seenNow),
        });
      }
    });
  }, [open, refreshInbox, scrollToEnd]);

  useEffect(() => {
    if (!open) return;
    jumpBottomOnEnterRef.current = true;
    stickToBottomRef.current = true;
    prevMsgCountRef.current = 0;
    unreadWhileScrolledRef.current = 0;
    setUnreadWhileScrolled(0);
    setShowScrollFab(false);
  }, [charId, open]);

  /* useLayoutEffect — 부모 mutedCharacterId가 한 박자 늦어 목록에서 토스트가 씹히지 않게 */
  useLayoutEffect(() => {
    if (!open) {
      onPhoneViewChange?.('thread');
      return;
    }
    onPhoneViewChange?.(phoneView);
  }, [onPhoneViewChange, open, phoneView]);

  useEffect(() => {
    if (!open || phoneView !== 'list') return;
    const vid = visitorRef.current || getOrCreateChatVisitorId();
    visitorRef.current = vid;
    let cancelled = false;

    /* 목록: 로컬 due pending만 확인 (원격은 AlertHost — 이중 폴링이 Worker 503 원인) */
    const tickLocal = async () => {
      for (const c of characters) {
        if (cancelled || !c.chatbot?.enabled) continue;
        const id = String(c.id);
        const cached = peekOcChatThreadCache(id, vid);
        const applyAt = cached?.pendingBehavior?.applyAt;
        if (!applyAt || applyAt > Date.now()) continue;
        try {
          await tryDeliverPendingChat({
            characterId: id,
            visitorId: vid,
            character: c,
          });
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) await refreshInbox({ remote: false });
    };

    void tickLocal();
    const localTimer = window.setInterval(() => void tickLocal(), 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(localTimer);
    };
  }, [characters, open, phoneView, refreshInbox]);

  useEffect(() => {
    const el = threadRef.current;
    if (!open || !el || phoneView !== 'thread') return;
    const onScroll = () => updateScrollUI({ fromScroll: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    updateScrollUI({ fromScroll: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [open, phoneView, updateScrollUI, charId]);

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
    /* 진행 중 응답·저장이 옛 대화를 다시 쓰지 못하게 */
    resetEpochRef.current += 1;
    burstEpochRef.current += 1;
    flushAbortRef.current?.abort();
    flushAbortRef.current = null;
    pendingFlushRef.current = false;
    replyLockRef.current = false;
    flushLockRef.current = false;
    cancelOcChatPendingDelivery(charId, vid);

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
    syncDisplayAffection(0);
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
    memorySummaryRef.current = undefined;
    memorySummaryThroughAtRef.current = undefined;
    userMemoryRef.current = undefined;
    userMemoryThroughAtRef.current = undefined;

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

    const wipedAt = Date.now();
    const wiped: OcChatThread = {
      messages: nextMessages,
      updatedAt: wipedAt,
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
      memorySummary: undefined,
      memorySummaryThroughAt: undefined,
      userMemory: undefined,
      userMemoryThroughAt: undefined,
      lastSeenAt: 0,
      turnsToday: 0,
      turnsDate: todayKeyLocal(),
      recentDeltaReasons: [],
      clearedAt: wipedAt,
    };
    writeOcChatThreadCache(charId, vid, wiped);

    try {
      await resetOcChatThreadForVisitor(charId, vid);
      /* delete가 캐시를 비우므로 와이프 상태를 바로 다시 씀 */
      const sealed = { ...wiped, updatedAt: Date.now() };
      writeOcChatThreadCache(charId, vid, sealed);
      await saveOcChatThread(charId, vid, sealed, { replace: true });
      void alert('채팅을 초기화했습니다.', '완료');
    } catch (e) {
      const msg = formatOcChatFirebaseError(e, '초기화에 실패했습니다');
      setError(msg);
    } finally {
      setResetting(false);
      focusComposer();
    }
  }, [
    alert,
    busy,
    character,
    charId,
    confirm,
    focusComposer,
    resetting,
    syncDisplayAffection,
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
      /** 명시적 저장 대상 — 없으면 이 콜백이 만들어진 시점의 charId */
      characterId?: string;
      /**
       * 다른 OC로 떠난 뒤에도 이 스레드에 써야 할 때 (pending 인계 등).
       * characterId를 명시한 저장만 허용.
       */
      allowInactive?: boolean;
    }) => {
      const saveCharId = String(snap.characterId || charId);
      const epoch = resetEpochRef.current;
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      /* 다른 OC로 전환된 뒤 stale persist가 섞이지 않게 */
      if (
        activeCharIdRef.current !== saveCharId &&
        !(snap.allowInactive && snap.characterId)
      ) {
        return;
      }
      const seen =
        snap.skipSeen
          ? snap.lastSeenAt ?? stateRef.current.lastSeenAt
          : isViewingThread()
            ? Date.now()
            : (snap.lastSeenAt ?? stateRef.current.lastSeenAt);
      if (!snap.skipSeen && isViewingThread() && activeCharIdRef.current === saveCharId) {
        setLastSeenAt(seen);
      }
      const today = todayKeyLocal();
      const mergedMeta: MetaState = {
        ...stateRef.current.meta,
        ...snap.meta,
      };
      if (snap.meta && activeCharIdRef.current === saveCharId) setMeta(mergedMeta);
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
        pendingClearedAt: mergedMeta.pendingClearedAt,
        recentDeltaReasons: mergedMeta.recentDeltaReasons,
        lastInteractionAt: mergedMeta.lastInteractionAt,
        neglectCheckedAt: mergedMeta.neglectCheckedAt,
        presence: mergedMeta.presence,
        presenceUpdatedAt: mergedMeta.presenceUpdatedAt,
        recentActions: mergedMeta.recentActions,
        /* 다른 OC로 떠난 저장이면 현재(새 OC) memoryRef를 덮어쓰지 않음 */
        memorySummary:
          activeCharIdRef.current === saveCharId
            ? memorySummaryRef.current
            : peekOcChatThreadCache(saveCharId, vid)?.memorySummary,
        memorySummaryThroughAt:
          activeCharIdRef.current === saveCharId
            ? memorySummaryThroughAtRef.current
            : peekOcChatThreadCache(saveCharId, vid)?.memorySummaryThroughAt,
        userMemory:
          activeCharIdRef.current === saveCharId
            ? userMemoryRef.current
            : peekOcChatThreadCache(saveCharId, vid)?.userMemory,
        userMemoryThroughAt:
          activeCharIdRef.current === saveCharId
            ? userMemoryThroughAtRef.current
            : peekOcChatThreadCache(saveCharId, vid)?.userMemoryThroughAt,
      };
      /* 초기화·OC 전환 이후의 옛 persist는 저장하지 않음 — allowInactive+characterId는 예외 */
      if (resetEpochRef.current !== epoch) return;
      if (
        activeCharIdRef.current !== saveCharId &&
        !(snap.allowInactive && snap.characterId)
      ) {
        return;
      }
      await saveOcChatThread(saveCharId, vid, next);
    },
    [charId, isViewingThread],
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
      const playCharId = charId;
      const alive = () =>
        stillOnChar(playCharId) &&
        (opts.expectEpoch == null || burstEpochRef.current === opts.expectEpoch);
      let msgs = baseMessages;
      let nextMeta: MetaState = { ...stateRef.current.meta };
      let deliveredAssistant = false;
      const deliveredIds = new Set<string>();
      const playEpoch = opts.expectEpoch ?? burstEpochRef.current;
      /** 이번 연출에서 이미 읽음을 찍었으면, 직후 연타도 바로 읽음 표시 */
      let didMarkReadThisPlay = false;
      replyLockRef.current = true;
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      visitorRef.current = vid;
      setOcChatPendingUiOwned(playCharId, vid, true);
      const applyMessages = (next: OcChatMessage[]) => {
        if (!alive()) return false;
        msgs = next;
        stateRef.current = { ...stateRef.current, messages: next };
        setMessages(next);
        return true;
      };

      const lateBurstPending = () =>
        hasLateUserMessages(stateRef.current.messages, flushIncludedIdsRef.current) ||
        burstEpochRef.current !== playEpoch;

      /** 화면 보고 읽던 중 추가된 유저 말도 읽음 처리 (재응답은 regather가 담당) */
      const markWatchingReads = async (): Promise<void> => {
        if (!didMarkReadThisPlay || !stillOnChar(playCharId)) return;
        if (nextMeta.presence !== 'online') return;
        const latest = stateRef.current.messages;
        const marked = markUserMessagesRead(latest);
        if (marked === latest) return;
        msgs = marked;
        applyMessages(marked);
        nextMeta = {
          ...nextMeta,
          lastInteractionAt: Date.now(),
          presence: 'online',
          presenceUpdatedAt: nextMeta.presenceUpdatedAt || Date.now(),
        };
        if (alive()) setMeta(nextMeta);
        await persistSnapshot({
          messages: marked,
          affection: opts.affection,
          story: opts.story,
          freeGainToday: opts.freeGainToday,
          freeGainDate: opts.freeGainDate,
          meta: nextMeta,
          characterId: playCharId,
          allowInactive: true,
        });
      };

      /**
       * 다른 OC로 떠났으면 UI 연출 대신 백그라운드 배달로 인계.
       * (창만 닫힌 경우와 동일 — 안 그러면 들어가기 전까지 답장이 안 옴)
       */
      const handoffPendingToBackground = async (): Promise<'ok'> => {
        setOcChatPendingUiOwned(playCharId, vid, false);
        const pending =
          nextMeta.pendingBehavior ||
          peekOcChatThreadCache(playCharId, vid)?.pendingBehavior;
        if (!pending?.applyAt) return 'ok';
        const cached = peekOcChatThreadCache(playCharId, vid);
        const base: OcChatThread = cached || {
          messages: msgs,
          updatedAt: Date.now(),
          affection: clampAffection(opts.affection),
          story: opts.story,
          freeGainDate: opts.freeGainDate,
          freeGainToday: opts.freeGainToday,
          lastSeenAt: stateRef.current.lastSeenAt || undefined,
          pendingBehavior: pending,
          pendingClearedAt: nextMeta.pendingClearedAt,
          presence: nextMeta.presence,
          presenceUpdatedAt: nextMeta.presenceUpdatedAt,
        };
        const withPending: OcChatThread = {
          ...base,
          pendingBehavior: pending,
          updatedAt: Date.now(),
        };
        writeOcChatThreadCache(
          playCharId,
          vid,
          mergeOcChatThreads(cached, withPending),
        );
        void saveOcChatThread(playCharId, vid, withPending).catch(() => {});
        scheduleOcChatPendingDelivery(
          playCharId,
          vid,
          pending.applyAt,
          character,
          pending.id,
        );
        if (pending.applyAt <= Date.now()) {
          await tryDeliverPendingChat({
            characterId: playCharId,
            visitorId: vid,
            character,
            expectPendingId: pending.id,
            force: true,
          });
        }
        console.info('[oc-chat-ui] handoff pending to background', {
          characterId: playCharId,
          applyAt: pending.applyAt,
          due: pending.applyAt <= Date.now(),
        });
        return 'ok';
      };

      /** 대기 중 연타·OC 이탈이면 중단 — 긴 responseDelay 동안 놓치던 구멍 */
      const sleepWhileBurstQuiet = async (ms: number): Promise<'ok' | 'regather' | 'handoff'> => {
        const end = Date.now() + Math.max(0, Math.round(ms));
        while (Date.now() < end) {
          /* 다른 앱/탭으로 숨으면 UI 연출 대신 백그라운드 배달 (메인 타이머 throttle 회피) */
          if (
            typeof document !== 'undefined' &&
            document.visibilityState === 'hidden'
          ) {
            await handoffPendingToBackground();
            return 'handoff';
          }
          /* 이탈은 regather → abortForRegather가 백그라운드 인계 */
          if (!stillOnChar(playCharId) || lateBurstPending()) {
            if (lateBurstPending()) await markWatchingReads();
            return 'regather';
          }
          if (didMarkReadThisPlay) await markWatchingReads();
          const slice = Math.min(180, end - Date.now());
          if (slice <= 0) break;
          await sleepMs(slice);
        }
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          await handoffPendingToBackground();
          return 'handoff';
        }
        if (!stillOnChar(playCharId) || lateBurstPending()) {
          if (lateBurstPending()) await markWatchingReads();
          return 'regather';
        }
        return 'ok';
      };

      const abortForRegather = async (): Promise<'regather'> => {
        /* OC를 떠난 뒤의 epoch bump는 답장 취소가 아니라 백그라운드 인계 */
        if (!stillOnChar(playCharId)) {
          await handoffPendingToBackground();
          return 'regather';
        }
        /* 이미 읽던 중 연타 — 새 말도 읽음으로 찍고 재응답 */
        await markWatchingReads();
        cancelOcChatPendingDelivery(playCharId, vid);
        /* 이번 연출에서 붙인 assistant만 제거 — 이후 최신 버스트로 한 번만 재응답 */
        const rolled = stateRef.current.messages.filter((m) => !deliveredIds.has(m.id));
        if (!alive()) {
          await handoffPendingToBackground();
          return 'regather';
        }
        applyMessages(rolled);
        const prevPending = nextMeta.pendingBehavior;
        nextMeta = {
          ...nextMeta,
          pendingBehavior: undefined,
          pendingClearedAt: Math.max(
            nextMeta.pendingClearedAt || 0,
            prevPending?.createdAt || Date.now(),
          ),
        };
        if (alive()) setMeta(nextMeta);
        await persistSnapshot({
          messages: rolled,
          affection: opts.affection,
          story: opts.story,
          freeGainToday: opts.freeGainToday,
          freeGainDate: opts.freeGainDate,
          meta: nextMeta,
          skipSeen: true,
          lastSeenAt: stateRef.current.lastSeenAt,
          characterId: playCharId,
        });
        console.info('[oc-chat-ui] abort play — regather burst', {
          rolledAway: deliveredIds.size,
        });
        return 'regather';
      };

      /** handoff=이미 백그라운드 인계 → play 정상 종료 / regather=연타 재수집 */
      const exitAfterWait = async (
        r: 'ok' | 'regather' | 'handoff',
      ): Promise<'ok' | 'regather' | null> => {
        if (r === 'ok') return null;
        if (r === 'handoff') return 'ok';
        return abortForRegather();
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
      ): Promise<'ok' | 'regather' | 'handoff'> => {
        const baseMs = typingDurationMs(text);
        const pauses =
          applyFluster && events?.length
            ? events.filter((e) => e.type === 'pause' || e.type === 'clear')
            : [];
        if (!pauses.length) {
          setBusy(true);
          return sleepWhileBurstQuiet(baseMs);
        }
        const segments = pauses.length + 1;
        const each = Math.max(400, Math.round(baseMs / segments));
        for (let i = 0; i < segments; i++) {
          setBusy(true);
          const w = await sleepWhileBurstQuiet(each);
          if (w !== 'ok') return w;
          if (i < pauses.length) {
            const p = pauses[i]!;
            setBusy(false);
            const pauseMs = Math.round(Math.min(4, Math.max(0.2, p.durationSeconds)) * 1000);
            const w2 = await sleepWhileBurstQuiet(pauseMs);
            if (w2 !== 'ok') return w2;
          }
        }
        setBusy(true);
        return 'ok';
      };

      try {
        const wasOffline = nextMeta.presence !== 'online';
        const willRespond =
          behavior.action === 'respond' ||
          behavior.action === 'end_for_today' ||
          behavior.action === 'read_only';
        const applyAt = computePendingApplyAt(behavior, wasOffline);
        const pending = behaviorToPending(behavior, applyAt);
        cancelOcChatPendingDelivery(playCharId, vid);

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
            {
              const __w = await exitAfterWait(await sleepWhileBurstQuiet(Math.min(wait, 2800)));
              if (__w) {
                setWaitingRead(false);
                return __w;
              }
            }
            setWaitingRead(false);
          } else {
            const __w = await exitAfterWait(await sleepWhileBurstQuiet(Math.min(wait, 1800)));
            if (__w) return __w;
          }
          if (lateBurstPending()) {
            return abortForRegather();
          }
          pushRecent('ignore', nextMeta.presence, behavior.moodNote || behavior.deltaReason);
          nextMeta = clearPendingMeta(nextMeta);
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
          skipSeen: !isViewingThread(),
          lastSeenAt: !isViewingThread() ? stateRef.current.lastSeenAt : undefined,
          characterId: playCharId,
          allowInactive: true,
        });

        const waitMs = Math.max(0, applyAt - Date.now());
        const delaySec = resolveResponseDelaySeconds({
          aiSeconds: behavior.responseDelaySeconds,
          delayKind: behavior.delay,
          wasOffline,
        });
        const fastRead =
          openRef.current &&
          stillOnChar(playCharId) &&
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
          didMarkReadThisPlay = true;
          const cur = markUserMessagesRead(stateRef.current.messages);
          msgs = cur;
          applyMessages(cur);
          nextMeta = {
            ...nextMeta,
            lastInteractionAt: Date.now(),
            presence: 'online',
            presenceUpdatedAt: Date.now(),
          };
          if (alive()) setMeta(nextMeta);
          await persistSnapshot({
            messages: cur,
            affection: opts.affection,
            story: opts.story,
            freeGainToday: opts.freeGainToday,
            freeGainDate: opts.freeGainDate,
            meta: nextMeta,
            characterId: playCharId,
            allowInactive: true,
          });
        };

        /*
         * 순서 고정: (오프면) 온라인 표시 → 대기(미읽음 "1") → 읽음 → 타이핑 → 답장
         * wasOffline이면 applyAt에 온라인이 된 뒤의 텀이 이미 포함됨.
         */
        if (isViewingThread() && stillOnChar(playCharId)) setWaitingRead(true);
        if (wasOffline && isViewingThread() && stillOnChar(playCharId)) {
          /* 초록불이 페인트된 뒤 읽음으로 넘어가게 한 프레임 양보 */
          await new Promise<void>((r) => {
            requestAnimationFrame(() => requestAnimationFrame(() => r()));
          });
        }
        if (fastRead) {
          const unreadFlashMs = rollFastUnreadVisibleMs();
          { const __w = await exitAfterWait(await sleepWhileBurstQuiet(unreadFlashMs)); if (__w) return __w; }
          if (isViewingThread() && stillOnChar(playCharId)) await markReadNow();
          const rest = Math.max(0, waitMs - unreadFlashMs);
          if (rest > 0) {
            const __w = await exitAfterWait(await sleepWhileBurstQuiet(rest));
            if (__w) return __w;
          }
        } else {
          const readLeadMs =
            waitMs > 1400 ? Math.min(700, Math.floor(waitMs * 0.14)) : 0;
          const untilRead = Math.max(0, waitMs - readLeadMs);
          if (untilRead > 0) {
            const __w = await exitAfterWait(await sleepWhileBurstQuiet(untilRead));
            if (__w) return __w;
          }
          if (isViewingThread() && stillOnChar(playCharId)) await markReadNow();
          if (readLeadMs > 0) {
            const __w = await exitAfterWait(await sleepWhileBurstQuiet(readLeadMs));
            if (__w) return __w;
          }
        }

        if (lateBurstPending()) {
          return abortForRegather();
        }

        /* 창 닫힘·다른 OC로 이탈 → 조용히 배달 (미읽음 유지) */
        if (!openRef.current || !stillOnChar(playCharId)) {
          setOcChatPendingUiOwned(playCharId, vid, false);
          await tryDeliverPendingChat({
            characterId: playCharId,
            visitorId: vid,
            character,
            expectPendingId: pending.id,
            force: true,
          });
          if (!stillOnChar(playCharId)) return 'ok';
          const fresh = await loadOcChatThread(playCharId, vid);
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
          applyMessages(closedMsgs);
          setMeta(closedMeta);
          if (typeof fresh.affection === 'number') setAffection(fresh.affection);
          if (typeof fresh.lastSeenAt === 'number') setLastSeenAt(fresh.lastSeenAt);
          /* 배달 후에도 뒤에 유저 말이 남으면 이번 턴을 끝내지 않고 묶어서 재응답 */
          if (ocChatNeedsReplyToTrailingUsers(closedMsgs, fresh.pendingBehavior)) {
            return 'regather';
          }
          return 'ok';
        }

        /* 열려 있으면: 읽음 → (추가 메시지 오면 재응답) → 타이핑 → 말풍선 */
        const absorbReads = async (lingerRounds = 3): Promise<'ok' | 'regather' | 'handoff'> => {
          didMarkReadThisPlay = true;
          let cur = markUserMessagesRead(stateRef.current.messages);
          msgs = cur;
          applyMessages(cur);
          nextMeta = {
            ...nextMeta,
            lastInteractionAt: Date.now(),
            presence: 'online',
            presenceUpdatedAt: Date.now(),
          };
          if (alive()) setMeta(nextMeta);
          await persistSnapshot({
            messages: cur,
            affection: opts.affection,
            story: opts.story,
            freeGainToday: opts.freeGainToday,
            freeGainDate: opts.freeGainDate,
            meta: nextMeta,
            characterId: playCharId,
            allowInactive: true,
          });
          for (let i = 0; i < lingerRounds; i++) {
            if (lateBurstPending()) {
              await markWatchingReads();
              return 'regather';
            }
            {
              const wr = await sleepWhileBurstQuiet(320 + Math.round(Math.random() * 280));
              if (wr !== 'ok') return wr;
            }
            if (!openRef.current) break;
            const latest = stateRef.current.messages;
            const hasUnread = latest.some((m) => m.role === 'user' && !m.readAt);
            if (!hasUnread) break;
            /* flush 시작 이후 새 유저 말이면 읽기만 하지 말고 재응답 */
            if (lateBurstPending()) {
              await markWatchingReads();
              return 'regather';
            }
            cur = markUserMessagesRead(latest);
            msgs = cur;
            applyMessages(cur);
            await persistSnapshot({
              messages: cur,
              affection: opts.affection,
              story: opts.story,
              freeGainToday: opts.freeGainToday,
              freeGainDate: opts.freeGainDate,
              meta: nextMeta,
              characterId: playCharId,
              allowInactive: true,
            });
          }
          if (lateBurstPending()) {
            await markWatchingReads();
            return 'regather';
          }
          return 'ok';
        };

        {
          const __ar = await exitAfterWait(await absorbReads(3));
          if (__ar) return __ar;
        }
        { const __w = await exitAfterWait(await sleepWhileBurstQuiet(220)); if (__w) return __w; }

        if (lateBurstPending()) {
          return abortForRegather();
        }

        if (behavior.action === 'read_only') {
          setWaitingRead(false);
          /* 읽씹 직후에도 바로 온 말은 재응답 */
          {
            const __ar = await exitAfterWait(await absorbReads(2));
            if (__ar) return __ar;
          }
          if (lateBurstPending()) {
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
        /* 타이핑 들어가기 직전에도 화면 보고 있는 동안 온 말 → 재응답 */
        {
          const __ar = await exitAfterWait(await absorbReads(1));
          if (__ar) return __ar;
        }
        if (lateBurstPending()) {
          return abortForRegather();
        }

        /* 이미 백그라운드/다른 경로가 이 예약을 배달했는지 확인 */
        {
          const fresh = await loadOcChatThread(playCharId, vid);
          const freshLines = collapseSameIntentShortBubbles(
            dedupeAdjacentTextLines(
              (behavior.messages || []).filter(
                (line) => line.trim() && !looksLikeBehaviorDump(line),
              ),
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
            applyMessages(synced);
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
            applyMessages(synced);
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

        const lines = collapseSameIntentShortBubbles(
          dedupeAdjacentTextLines(
            behavior.messages.filter((line) => line.trim() && !looksLikeBehaviorDump(line)),
          ),
        );
        if (lines.length < (behavior.messages?.length || 0)) {
          console.info('[oc-chat-ui] collapsed same-intent short bubbles before play', {
            before: behavior.messages,
            after: lines,
          });
        }
        const sticker = resolveSticker(character.chatbot, behavior.sticker || null);

        for (let i = 0; i < lines.length; i++) {
          if (!openRef.current || !stillOnChar(playCharId)) {
            setOcChatPendingUiOwned(playCharId, vid, false);
            await tryDeliverPendingChat({
              characterId: playCharId,
              visitorId: vid,
              character,
              expectPendingId: pending.id,
              force: true,
            });
            if (!stillOnChar(playCharId)) return 'ok';
            const fresh = await loadOcChatThread(playCharId, vid);
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
            applyMessages(synced);
            if (typeof fresh.affection === 'number') setAffection(fresh.affection);
            if (ocChatNeedsReplyToTrailingUsers(synced, fresh.pendingBehavior)) {
              return 'regather';
            }
            return 'ok';
          }
          /* 답장 보내기 전에 새 유저 말 → 이번 답 버리고 최신 기준으로 재응답 */
          if (lateBurstPending()) {
            return abortForRegather();
          }
          const included = flushIncludedIdsRef.current;
          const line = lines[i]!;
          { const __pt = await exitAfterWait(await playLengthTyping(line, behavior.typingIndicatorEvents, i === 0)); if (__pt) {
            setBusy(false);
            return __pt;
          } }
          if (lateBurstPending()) {
            setBusy(false);
            return abortForRegather();
          }
          {
            const { head, lateUsers } = extractLateUserMessages(
              markUserMessagesRead(stateRef.current.messages),
              included,
            );
            if (lateUsers.length) {
              return abortForRegather();
            }
            /* 직전·최근 assistant와 같거나 비슷한 대사라면 스킵 (패러프레이즈 연타 방지) */
            const recentAsst = head
              .filter((m) => m.role === 'assistant' && (m.kind || 'chat') === 'chat')
              .map((m) => String(m.content || '').trim())
              .filter(Boolean)
              .slice(-6);
            const nearDupRecent = recentAsst.some((prev) => areNearDuplicateLines(prev, line));
            if (
              pendingLinesAlreadyAtTail(head, lines.slice(0, i + 1)) ||
              nearDupRecent
            ) {
              msgs = head;
              deliveredAssistant = true;
            } else {
              const botMsg = createChatMessage('assistant', line, 'chat', {
                at: Date.now() + i,
              });
              deliveredIds.add(botMsg.id);
              msgs = [...head, botMsg];
              deliveredAssistant = true;
            }
          }
          msgs = dedupeAdjacentAssistantMessages(msgs);
          applyMessages(msgs);
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
            skipSeen: !isViewingThread(),
            lastSeenAt: !isViewingThread() ? stateRef.current.lastSeenAt : undefined,
          });
          if (i < lines.length - 1 || sticker) {
            const __w = await exitAfterWait(await sleepWhileBurstQuiet(splitBubbleGapMs()));
            if (__w) return __w;
          }
        }

        if (sticker) {
          if (!openRef.current || !stillOnChar(playCharId)) {
            setOcChatPendingUiOwned(playCharId, vid, false);
            await tryDeliverPendingChat({
              characterId: playCharId,
              visitorId: vid,
              character,
              expectPendingId: pending.id,
              force: true,
            });
            if (!stillOnChar(playCharId)) return 'ok';
            const fresh = await loadOcChatThread(playCharId, vid);
            const synced = dedupeAdjacentAssistantMessages(fresh.messages);
            stateRef.current = {
              ...stateRef.current,
              messages: synced,
              meta: {
                ...stateRef.current.meta,
                pendingBehavior: fresh.pendingBehavior,
              },
            };
            applyMessages(synced);
            if (ocChatNeedsReplyToTrailingUsers(synced, fresh.pendingBehavior)) {
              return 'regather';
            }
            return 'ok';
          }
          if (lateBurstPending()) {
            return abortForRegather();
          }
          setBusy(true);
          {
            const __w = await exitAfterWait(
              await sleepWhileBurstQuiet(typingDurationMs('스티커')),
            );
            if (__w) {
              setBusy(false);
              return __w;
            }
          }
          if (lateBurstPending()) {
            setBusy(false);
            return abortForRegather();
          }
          {
            const { head, lateUsers } = extractLateUserMessages(
              markUserMessagesRead(stateRef.current.messages),
              flushIncludedIdsRef.current,
            );
            if (lateUsers.length) {
              return abortForRegather();
            }
            const stickerMsg = createChatMessage('assistant', '스티커', 'sticker', {
              stickerUrl: sticker.imageUrl,
              stickerId: sticker.id,
            });
            deliveredIds.add(stickerMsg.id);
            msgs = [...head, stickerMsg];
            deliveredAssistant = true;
          }
          applyMessages(msgs);
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
            skipSeen: !isViewingThread(),
          });
          setBusy(false);
          return 'ok';
        }

        pushRecent(behavior.action, 'online', behavior.moodNote);
        nextMeta = clearPendingMeta({
          ...(behavior.action === 'end_for_today'
            ? withEndForTodayLock({
                ...nextMeta,
                presence: 'online',
                presenceUpdatedAt: Date.now(),
              })
            : {
                ...nextMeta,
                presence: 'online',
                presenceUpdatedAt: Date.now(),
              }),
        });
        setMeta(nextMeta);
        /* 답장 연출 끝 — readAt 누락/경합으로 "1"이 남지 않게 확정 */
        msgs = markUserMessagesReadThroughLastAssistant(msgs);
        applyMessages(msgs);
        await persistSnapshot({
          messages: msgs,
          affection: opts.affection,
          story: opts.story,
          freeGainToday: opts.freeGainToday,
          freeGainDate: opts.freeGainDate,
          meta: nextMeta,
          skipSeen: !isViewingThread(),
          lastSeenAt: !isViewingThread() ? stateRef.current.lastSeenAt : undefined,
        });
        setBusy(false);
        return 'ok';
      } finally {
        replyLockRef.current = false;
        setBusy(false);
        setWaitingRead(false);
        /* 연출 종료 — 스레드를 안 보고 있으면 pending 타이머에 맡김 */
        setOcChatPendingUiOwned(playCharId, vid, false);
        /*
         * 같은 방을 보고 있으면 stateRef.meta 가 진실 (성공 시 pending 이미 클리어).
         * 캐시만 보면 persist 직전 stale pending으로 답을 한 번 더 붙일 수 있음.
         * 다른 OC로 떠난 뒤에만 캐시 fallback.
         */
        const stillPending = stillOnChar(playCharId)
          ? stateRef.current.meta.pendingBehavior
          : peekOcChatThreadCache(playCharId, vid)?.pendingBehavior ||
            stateRef.current.meta.pendingBehavior;
        if (stillPending?.applyAt) {
          scheduleOcChatPendingDelivery(
            playCharId,
            vid,
            stillPending.applyAt,
            stillOnChar(playCharId) ? characterRef.current : character,
            stillPending.id,
          );
          if (stillPending.applyAt <= Date.now()) {
            void tryDeliverPendingChat({
              characterId: playCharId,
              visitorId: vid,
              character: stillOnChar(playCharId) ? characterRef.current : character,
              expectPendingId: stillPending.id,
              force: true,
            }).catch(() => {});
          }
        }
        /* 목록에 있으면 미읽음 뱃지 즉시 반영 (로컬만 — remote 레이스 방지) */
        if (openRef.current && phoneViewRef.current === 'list') {
          void refreshInbox({ remote: false });
        }
      }
    },
    [character, charId, isViewingThread, persistSnapshot, refreshInbox, stillOnChar],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const vid = getOrCreateChatVisitorId();
    visitorRef.current = vid;
    const nextId = charId;
    const prevId = bootstrappedCharIdRef.current;
    const characterNow = characterRef.current;
    const switching = Boolean(prevId && prevId !== nextId);

    /* OC 전환: in-flight 응답/저장이 다음 OC state에 섞이지 않게 즉시 중단 */
    if (switching) {
      const prevNeedsReply = ocChatNeedsReplyToTrailingUsers(
        stateRef.current.messages,
        stateRef.current.meta.pendingBehavior,
      );
      const prevHadInflight = flushLockRef.current || replyLockRef.current;
      flushAbortRef.current?.abort();
      burstEpochRef.current += 1;
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = 0;
      flushLockRef.current = false;
      replyLockRef.current = false;
      pendingFlushRef.current = false;
      setBusy(false);
      setWaitingRead(false);
      setError('');
      setInput('');
      setUnreadWhileScrolled(0);
      unreadWhileScrolledRef.current = 0;
      setShowScrollFab(false);
      /* 직전 OC UI 상태를 그 OC 키로만 봉인 */
      if (stateRef.current.messages.length > 0 || stateRef.current.meta.pendingBehavior) {
        const sealedMeta = stateRef.current.meta;
        const sealed: OcChatThread = {
          messages: stateRef.current.messages,
          updatedAt: Date.now(),
          affection: clampAffection(stateRef.current.affection),
          story: stateRef.current.story,
          freeGainDate: stateRef.current.freeGainDate,
          freeGainToday: stateRef.current.freeGainToday,
          freeLossToday: sealedMeta.freeLossToday,
          lastSeenAt: stateRef.current.lastSeenAt || undefined,
          moodNote: sealedMeta.moodNote,
          turnsToday: sealedMeta.turnsToday,
          closedForToday: sealedMeta.closedForToday,
          closedUntil: sealedMeta.closedUntil,
          lastProactiveDate: sealedMeta.lastProactiveDate,
          pendingBehavior: sealedMeta.pendingBehavior,
          pendingClearedAt: sealedMeta.pendingClearedAt,
          recentDeltaReasons: sealedMeta.recentDeltaReasons,
          lastInteractionAt: sealedMeta.lastInteractionAt,
          neglectCheckedAt: sealedMeta.neglectCheckedAt,
          presence: sealedMeta.presence,
          presenceUpdatedAt: sealedMeta.presenceUpdatedAt,
          recentActions: sealedMeta.recentActions,
          memorySummary: memorySummaryRef.current,
          memorySummaryThroughAt: memorySummaryThroughAtRef.current,
          userMemory: userMemoryRef.current,
          userMemoryThroughAt: userMemoryThroughAtRef.current,
        };
        /* 캐시에 이미 있는 pending을 봉인이 지우지 않게 merge */
        const prevCached = peekOcChatThreadCache(prevId, vid);
        const sealedMerged = mergeOcChatThreads(prevCached, sealed);
        writeOcChatThreadCache(prevId, vid, sealedMerged);
        void saveOcChatThread(prevId, vid, sealedMerged).catch(() => {});
        setOcChatPendingUiOwned(prevId, vid, false);
        const handoffPending = sealedMerged.pendingBehavior;
        const prevChar =
          characters?.find((c) => String(c.id) === String(prevId)) || undefined;
        if (handoffPending?.applyAt) {
          scheduleOcChatPendingDelivery(
            prevId,
            vid,
            handoffPending.applyAt,
            prevChar,
            handoffPending.id,
          );
          if (handoffPending.applyAt <= Date.now()) {
            void tryDeliverPendingChat({
              characterId: prevId,
              visitorId: vid,
              character: prevChar,
              expectPendingId: handoffPending.id,
              force: true,
            }).catch(() => {});
          }
        }
        /*
         * API abort / epoch discard로 pending이 안 생긴 채 떠나면
         * 목록에서 영영 안 오고, A 재진입 때만 반응하던 구멍.
         */
        if (
          prevNeedsReply ||
          prevHadInflight ||
          ocChatNeedsReplyToTrailingUsers(
            sealedMerged.messages,
            sealedMerged.pendingBehavior,
          )
        ) {
          void completeOcChatReplyInBackground({
            characterId: prevId,
            visitorId: vid,
            character: prevChar,
          }).catch(() => {});
        }
      } else {
        setOcChatPendingUiOwned(prevId, vid, false);
      }
      memorySummaryRef.current = undefined;
      memorySummaryThroughAtRef.current = undefined;
      userMemoryRef.current = undefined;
      userMemoryThroughAtRef.current = undefined;
      revealedRef.current = new Set();
    }

    activeCharIdRef.current = nextId;
    const cached = peekOcChatThreadCache(nextId, vid);
    if (cached?.memorySummary) memorySummaryRef.current = cached.memorySummary;
    if (typeof cached?.memorySummaryThroughAt === 'number') {
      memorySummaryThroughAtRef.current = cached.memorySummaryThroughAt;
    }
    if (cached?.userMemory) userMemoryRef.current = cached.userMemory;
    if (typeof cached?.userMemoryThroughAt === 'number') {
      userMemoryThroughAtRef.current = cached.userMemoryThroughAt;
    }

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

    const emptyMeta: MetaState = {
      turnsToday: 0,
      closedForToday: false,
      freeLossToday: 0,
      recentDeltaReasons: [],
      presence: 'offline',
      presenceUpdatedAt: Date.now(),
      recentActions: [],
    };

    if (!cached || !cached.messages.length) {
      /* 이미 이 캐릭터 스레드를 불러온 상태면 그대로 확정 (전환이 아닐 때만) */
      if (
        !switching &&
        bootstrappedCharIdRef.current === nextId &&
        (stateRef.current.messages.length || stateRef.current.story)
      ) {
        setThreadReady(true);
        return;
      }
      /*
       * 캐시 없음: 서버 로드 전에 completedEpisodeIds=[]로 스토리 잠금을
       * 걸지 않는다. (자유채팅 유저에게 "스토리를 진행해 주세요" 깜빡임)
       * 전환 시에는 이전 OC 메시지를 절대 남기지 않음.
       */
      setMessages([]);
      setStory(undefined);
      setAffection(0);
      syncDisplayAffection(0);
      setFreeGainToday(0);
      setFreeGainDate(todayKeyLocal());
      setLastSeenAt(0);
      setMeta(emptyMeta);
      stateRef.current = {
        messages: [],
        story: undefined,
        affection: 0,
        freeGainToday: 0,
        freeGainDate: todayKeyLocal(),
        lastSeenAt: 0,
        meta: emptyMeta,
      };
      bootstrappedCharIdRef.current = nextId;
      setThreadReady(false);
      return;
    }

    const recoveredStory = ensureStory(cached.story, cached.messages);
    const nextMeta: MetaState = {
      moodNote: cached.moodNote,
      turnsToday: cached.turnsToday || 0,
      ...closedFieldsFromUntil(cached.closedUntil),
      pendingBehavior: cached.pendingBehavior,
      pendingClearedAt: cached.pendingClearedAt,
      lastProactiveDate: cached.lastProactiveDate,
      freeLossToday: cached.freeLossToday || 0,
      recentDeltaReasons: cached.recentDeltaReasons || [],
      lastInteractionAt: cached.lastInteractionAt,
      neglectCheckedAt: cached.neglectCheckedAt,
      presence:
        cached.presence === 'online' || cached.presence === 'offline'
          ? cached.presence
          : 'offline',
      presenceUpdatedAt: cached.presenceUpdatedAt || Date.now(),
      recentActions: cached.recentActions || [],
    };
    setMessages(cached.messages);
    setAffection(cached.affection || 0);
    syncDisplayAffection(cached.affection || 0);
    setStory(recoveredStory);
    setFreeGainToday(cached.freeGainToday || 0);
    setFreeGainDate(cached.freeGainDate || todayKeyLocal());
    setLastSeenAt(cached.lastSeenAt || 0);
    setMeta(nextMeta);
    bootstrappedCharIdRef.current = nextId;
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
      writeOcChatThreadCache(nextId, vid, { ...cached, story: recoveredStory });
    }
    /* characters는 dep에서 제외 — Firebase 스냅마다 스레드를 캐시로 덮어쓰면 채팅이 리셋되고 루프 위험이 큼 */
  }, [open, charId, syncDisplayAffection]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadCharId = charId;
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
          characterId: loadCharId,
          visitorId: visitorRef.current,
          character: characterNow,
        });
        if (cancelled || !stillOnChar(loadCharId)) return;

        const thread = await loadOcChatThread(loadCharId, visitorRef.current);
        if (cancelled || !stillOnChar(loadCharId)) return;
        setFreeGainDate(thread.freeGainDate || todayKeyLocal());
        setFreeGainToday(thread.freeGainToday || 0);
        let nextMeta: MetaState = {
          moodNote: thread.moodNote,
          turnsToday: thread.turnsToday || 0,
          ...closedFieldsFromUntil(thread.closedUntil),
          pendingBehavior: thread.pendingBehavior,
          pendingClearedAt: thread.pendingClearedAt,
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
          /* 로드 직후 threadReady 전 — 대기열에 넣고 스레드 준비 후 토스트.
           * 하트 수치는 알약 전까지 감소 전 값 유지 */
          pendingDisplayAffectionRef.current = affectionNow;
          queuePendingAffectionToast(loadCharId, visitorRef.current, -neglect.decay);
          const tierPayload = buildAffinityTierToastPayload({
            name: characterNow.name || '캐릭터',
            avatarUrl: resolveChatAvatarUrl(characterNow),
            prevAffection: thread.affection,
            nextAffection: affectionNow,
            chatbot: characterNow.chatbot,
          });
          if (tierPayload) {
            queuePendingAffinityTierToast(loadCharId, visitorRef.current, tierPayload);
          }
        } else {
          pendingDisplayAffectionRef.current = null;
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
            characterId: loadCharId,
            visitorId: visitorRef.current,
            character: characterNow,
          });
          if (cancelled || !stillOnChar(loadCharId)) return;
          const fresh = await loadOcChatThread(loadCharId, visitorRef.current);
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

        if (cancelled || !stillOnChar(loadCharId)) return;

        /*
         * 스레드를 보고 있을 때만 읽음 처리.
         * 목록만 연 상태에서도 lastSeenAt=now 하면 미읽음·알림 토스트가 즉시 사라짐.
         */
        const viewingThread = openRef.current && phoneViewRef.current === 'thread';
        const seenNow = viewingThread
          ? Date.now()
          : typeof thread.lastSeenAt === 'number'
            ? thread.lastSeenAt
            : stateRef.current.lastSeenAt || 0;
        if (viewingThread) setLastSeenAt(seenNow);
        else if (typeof thread.lastSeenAt === 'number') setLastSeenAt(thread.lastSeenAt);
        setAffection(affectionNow);
        /* 방치 감소 알약이 대기 중이면 표시 수치는 감소 전 유지 */
        if (pendingDisplayAffectionRef.current != null) {
          setDisplayAffection(clampAffection(thread.affection));
        } else {
          setDisplayAffection(affectionNow);
        }
        setMeta(nextMeta);
        setStory(nextStory);
        setMessages(nextMessages);
        bootstrappedCharIdRef.current = loadCharId;
        setThreadReady(true);
        stateRef.current = {
          ...stateRef.current,
          messages: nextMessages,
          affection: affectionNow,
          story: nextStory,
          lastSeenAt: seenNow,
          meta: nextMeta,
        };
        console.info('[oc-chat-ui] thread loaded', {
          characterId: loadCharId,
          messageCount: nextMessages.length,
          firstAt: nextMessages[0]?.at,
          lastAt: nextMessages[nextMessages.length - 1]?.at,
          clearedAt: thread.clearedAt,
          viewingThread,
        });
        writeOcChatThreadCache(loadCharId, visitorRef.current, {
          ...thread,
          messages: nextMessages,
          affection: affectionNow,
          story: nextStory,
          lastSeenAt: seenNow || undefined,
          pendingBehavior: pending,
          updatedAt: Date.now(),
        });
        if (thread.memorySummary) memorySummaryRef.current = thread.memorySummary;
        if (typeof thread.memorySummaryThroughAt === 'number') {
          memorySummaryThroughAtRef.current = thread.memorySummaryThroughAt;
        }
        if (thread.userMemory) userMemoryRef.current = thread.userMemory;
        if (typeof thread.userMemoryThroughAt === 'number') {
          userMemoryThroughAtRef.current = thread.userMemoryThroughAt;
        }

        try {
          if (!stillOnChar(loadCharId)) return;
          await saveOcChatThread(loadCharId, visitorRef.current, {
            messages: nextMessages,
            updatedAt: Date.now(),
            affection: affectionNow,
            story: nextStory,
            freeGainDate: thread.freeGainDate || todayKeyLocal(),
            freeGainToday: thread.freeGainToday || 0,
            freeLossToday: nextMeta.freeLossToday,
            lastSeenAt: seenNow || undefined,
            moodNote: nextMeta.moodNote,
            moodDate: nextMeta.moodNote ? todayKeyLocal() : undefined,
            turnsToday: nextMeta.turnsToday,
            turnsDate: todayKeyLocal(),
            closedForToday: nextMeta.closedForToday,
            closedDate: undefined,
            closedUntil: nextMeta.closedUntil,
            lastProactiveDate: nextMeta.lastProactiveDate,
            pendingBehavior: pending,
            pendingClearedAt: nextMeta.pendingClearedAt,
            recentDeltaReasons: nextMeta.recentDeltaReasons,
            lastInteractionAt: nextMeta.lastInteractionAt,
            neglectCheckedAt: nextMeta.neglectCheckedAt,
            presence: nextMeta.presence,
            presenceUpdatedAt: nextMeta.presenceUpdatedAt,
            recentActions: nextMeta.recentActions,
            memorySummary: memorySummaryRef.current,
            memorySummaryThroughAt: memorySummaryThroughAtRef.current,
            userMemory: userMemoryRef.current,
            userMemoryThroughAt: userMemoryThroughAtRef.current,
          });
        } catch (saveErr) {
          /* 로드 성공 후 lastSeen 동기화 실패는 대화 차단할 일 아님 — 재시도는 save 쪽이 함 */
          console.warn('[oc-chat] post-load save', saveErr);
        }

        /* 나갔다 왔을 때 유저 말이 끝에 남아 있으면(예약 없음) 바로 응답 재개 */
        if (
          !cancelled &&
          stillOnChar(loadCharId) &&
          ocChatNeedsReplyToTrailingUsers(nextMessages, pending) &&
          !needsStoryMode(characterNow, nextStory?.completedEpisodeIds)
        ) {
          pendingFlushRef.current = true;
          window.setTimeout(() => {
            if (!openRef.current || !stillOnChar(loadCharId)) return;
            void flushDebouncedChatRef.current();
          }, 120);
        }
      } catch (err) {
        if (!cancelled && stillOnChar(loadCharId)) {
          setError(formatOcChatFirebaseError(err, '대화를 불러오지 못했습니다'));
          /* 로드 실패 시에도 잠금 문구로 묶지 않음 — 캐시가 있으면 그 기준 유지 */
          setThreadReady(true);
        }
      } finally {
        if (!cancelled && stillOnChar(loadCharId)) {
          focusComposer();
          jumpBottomOnEnterRef.current = true;
          requestAnimationFrame(() => {
            scrollToEnd({ force: true, smooth: false });
            window.setTimeout(() => scrollToEnd({ force: true, smooth: false }), 50);
            window.setTimeout(() => scrollToEnd({ force: true, smooth: false }), 180);
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(storyTimer.current);
    };
  }, [charId, open, stillOnChar]);

  /*
   * 목록→스레드: charId가 같아도 로드 effect가 다시 안 돌아
   * (알림으로 캐시에만 쌓인 메시지)가 화면에 안 나오는 구멍.
   * 채팅창을 닫았다 열면 open dep로 로드가 다시 돌아서 보이던 증상.
   */
  useEffect(() => {
    if (!open || phoneView !== 'thread') return;
    const loadCharId = charId;
    const vid = visitorRef.current || getOrCreateChatVisitorId();
    visitorRef.current = vid;
    let cancelled = false;

    void (async () => {
      try {
        await tryDeliverPendingChat({
          characterId: loadCharId,
          visitorId: vid,
          character: characterRef.current,
          force: true,
        });
      } catch {
        /* 배달 실패해도 캐시 동기화는 진행 */
      }
      if (
        cancelled ||
        activeCharIdRef.current !== loadCharId ||
        phoneViewRef.current !== 'thread' ||
        !openRef.current
      ) {
        return;
      }

      const cached = peekOcChatThreadCache(loadCharId, vid);
      if (!cached?.messages?.length) return;

      const ui = stateRef.current.messages;
      const uiIds = new Set(ui.map((m) => m.id));
      const hasMissing = cached.messages.some((m) => !uiIds.has(m.id));
      const longer = cached.messages.length > ui.length;
      const lastDiffers =
        Boolean(cached.messages.length && ui.length) &&
        cached.messages[cached.messages.length - 1]?.id !== ui[ui.length - 1]?.id;

      const seenNow = Date.now();
      if (!hasMissing && !longer && !lastDiffers) {
        /* 메시지는 최신 — 읽음만 반영 */
        setLastSeenAt(seenNow);
        stateRef.current = { ...stateRef.current, lastSeenAt: seenNow };
        writeOcChatThreadCache(loadCharId, vid, {
          ...cached,
          lastSeenAt: seenNow,
          updatedAt: Math.max(cached.updatedAt || 0, seenNow),
        });
        void refreshInbox({ remote: false });
        return;
      }

      const nextMessages = cached.messages;
      const affectionNow =
        typeof cached.affection === 'number'
          ? clampAffection(cached.affection)
          : stateRef.current.affection;
      const nextMeta: MetaState = {
        ...stateRef.current.meta,
        moodNote: cached.moodNote ?? stateRef.current.meta.moodNote,
        turnsToday: cached.turnsToday ?? stateRef.current.meta.turnsToday,
        ...closedFieldsFromUntil(cached.closedUntil ?? stateRef.current.meta.closedUntil),
        pendingBehavior: cached.pendingBehavior,
        pendingClearedAt: cached.pendingClearedAt ?? stateRef.current.meta.pendingClearedAt,
        lastProactiveDate: cached.lastProactiveDate ?? stateRef.current.meta.lastProactiveDate,
        freeLossToday: cached.freeLossToday ?? stateRef.current.meta.freeLossToday,
        recentDeltaReasons: cached.recentDeltaReasons ?? stateRef.current.meta.recentDeltaReasons,
        lastInteractionAt: cached.lastInteractionAt ?? stateRef.current.meta.lastInteractionAt,
        neglectCheckedAt: cached.neglectCheckedAt ?? stateRef.current.meta.neglectCheckedAt,
        presence:
          cached.presence === 'online' || cached.presence === 'offline'
            ? cached.presence
            : stateRef.current.meta.presence,
        presenceUpdatedAt:
          typeof cached.presenceUpdatedAt === 'number'
            ? cached.presenceUpdatedAt
            : stateRef.current.meta.presenceUpdatedAt,
        recentActions: cached.recentActions ?? stateRef.current.meta.recentActions,
      };
      setMessages(nextMessages);
      setAffection(affectionNow);
      if (pendingDisplayAffectionRef.current == null) setDisplayAffection(affectionNow);
      setMeta(nextMeta);
      if (cached.story) setStory(cached.story);
      setLastSeenAt(seenNow);
      stateRef.current = {
        ...stateRef.current,
        messages: nextMessages,
        affection: affectionNow,
        story: cached.story ?? stateRef.current.story,
        lastSeenAt: seenNow,
        meta: nextMeta,
      };
      writeOcChatThreadCache(loadCharId, vid, {
        ...cached,
        messages: nextMessages,
        lastSeenAt: seenNow,
        updatedAt: Date.now(),
      });
      jumpBottomOnEnterRef.current = true;
      requestAnimationFrame(() => {
        scrollToEnd({ force: true, smooth: false });
      });
      void refreshInbox({ remote: false });
      console.info('[oc-chat-ui] thread resync after list', {
        characterId: loadCharId,
        messageCount: nextMessages.length,
        hadMissing: hasMissing,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, phoneView, charId, refreshInbox, scrollToEnd]);

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
      }).catch(() => {});
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
      const cur = stateRef.current.meta;
      const next = rollAmbientPresence(Date.now(), {
        current: cur.presence,
        lastInteractionAt: cur.lastInteractionAt,
        presenceUpdatedAt: cur.presenceUpdatedAt,
      });
      if (next === cur.presence) return;
      if (!stillOnChar(charId)) return;
      const patched: MetaState = {
        ...cur,
        presence: next,
        presenceUpdatedAt: Date.now(),
      };
      setMeta(patched);
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      /* 현재 열린 OC 메시지만 그 OC 키로 저장 */
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
      }).catch(() => {});
    };
    /* 열자마자 바로 굴리지 않음 — 첫 틱은 간격 뒤 */
    const id = window.setInterval(tick, 70_000);
    return () => window.clearInterval(id);
  }, [busy, charId, inStory, open, stillOnChar, waitingRead]);

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
      }).catch(() => {});
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

  /* 방 진입·OC 전환: 최근 메시지가 보이도록 하단 고정 (DOM/메시지 준비 전에는 플래그 유지) */
  useLayoutEffect(() => {
    if (!open || phoneView !== 'thread') return;
    if (!jumpBottomOnEnterRef.current) return;
    /* 스레드 로드 전 빈 화면에서 플래그를 소모하면 이후 스크롤이 안 됨 */
    if (!threadRef.current) return;
    if (messages.length === 0 && !threadReady) return;

    const count = messages.length + (busy || waitingRead ? 1 : 0);
    const ok = scrollToEnd({ force: true, smooth: false });
    if (!ok) return;
    jumpBottomOnEnterRef.current = false;
    prevMsgCountRef.current = count;
    const t1 = window.setTimeout(() => scrollToEnd({ force: true, smooth: false }), 50);
    const t2 = window.setTimeout(() => scrollToEnd({ force: true, smooth: false }), 180);
    const t3 = window.setTimeout(() => scrollToEnd({ force: true, smooth: false }), 360);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [open, phoneView, messages, threadReady, busy, waitingRead, charId, scrollToEnd]);

  useEffect(() => {
    if (!open || phoneView !== 'thread') return;
    if (jumpBottomOnEnterRef.current) return;
    const count = messages.length + (busy || waitingRead ? 1 : 0);
    const added = count - prevMsgCountRef.current;
    prevMsgCountRef.current = count;
    if (added > 0) {
      onMessagesAppended(added);
      return;
    }
    /* 같은 개수 갱신(읽음·내용) — stick이면 따라가고, 아니면 FAB만 */
    if (stickToBottomRef.current) {
      scrollToEnd({ force: true, smooth: false });
      return;
    }
    updateScrollUI();
  }, [
    messages,
    busy,
    waitingRead,
    awaitingChoice,
    open,
    phoneView,
    onMessagesAppended,
    scrollToEnd,
    updateScrollUI,
  ]);

  /* 스레드 메시지 변화 시 인박스 로컬 미리보기·미읽음만 갱신 (remote는 목록 폴링) */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void refreshInbox({ remote: false });
    }, 200);
    return () => window.clearTimeout(t);
  }, [messages.length, open, refreshInbox, charId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (relationAnim === 'in') {
        closeRelation();
        return;
      }
      if (phoneView === 'thread') {
        setPhoneView('list');
        onPhoneViewChange?.('list');
        /* 연출 중이어도 UI 소유를 풀어 백그라운드 배달·토스트가 막히지 않게 */
        const vid = visitorRef.current || getOrCreateChatVisitorId();
        setOcChatPendingUiOwned(charId, vid, false);
        const pending =
          stateRef.current.meta.pendingBehavior ||
          peekOcChatThreadCache(charId, vid)?.pendingBehavior;
        if (pending?.applyAt) {
          scheduleOcChatPendingDelivery(
            charId,
            vid,
            pending.applyAt,
            characterRef.current,
            pending.id,
          );
        }
        void refreshInbox();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [closeRelation, onClose, open, phoneView, refreshInbox, relationAnim]);

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
      const prevAffection = stateRef.current.affection;
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
        deferDisplayAffectionUntilToast(nextAffection);
        flashAffectionToast(counted);
      } else {
        syncDisplayAffection(nextAffection);
      }
      flashAffinityTierToast(prevAffection, nextAffection);

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
    [activeEpisode, busy, deferDisplayAffectionUntilToast, flashAffectionToast, flashAffinityTierToast, persistSnapshot, story, syncDisplayAffection, waitingRead],
  );

  const flushDebouncedChat = useCallback(async () => {
    const flushCharId = charId;
    if (flushLockRef.current) {
      pendingFlushRef.current = true;
      console.info('[oc-chat-ui] timing', {
        event: 'flush_queued',
        reason: 'already_flushing',
        replyLock: replyLockRef.current,
      });
      return;
    }
    if (!stillOnChar(flushCharId)) return;
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
    const flushStartedAt = Date.now();
    const flushVid = visitorRef.current || getOrCreateChatVisitorId();
    visitorRef.current = flushVid;
    setOcChatReplyGenerationInflight(flushCharId, flushVid, true);

    const lastUserText = () => {
      const msgs = stateRef.current.messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]?.role === 'user') return String(msgs[i]?.content || '');
      }
      return '';
    };
    const burstQuietMsFor = (text?: string) => resolveOcChatSendDebounceMs(text);

    const scheduleTrailingFlush = () => {
      window.clearTimeout(debounceTimer.current);
      const debounceMs = burstQuietMsFor(lastUserText());
      const elapsed = Date.now() - lastUserSendAtRef.current;
      const wait = Math.max(0, debounceMs - elapsed);
      console.info('[oc-chat-ui] timing', {
        event: 'trailing_flush_scheduled',
        waitMs: wait,
        debounceMs,
      });
      debounceTimer.current = window.setTimeout(() => {
        void flushDebouncedChat();
      }, wait);
    };

    /** 재요청 시 짧은 침묵만 — 전체 debounce를 다시 기다리면 체감 지연이 커짐 */
    const waitBurstQuiet = async (mode: 'initial' | 'regather') => {
      const debounceMs =
        mode === 'regather' ? OC_CHAT_REGATHER_QUIET_MS : burstQuietMsFor(lastUserText());
      for (;;) {
        const wait = debounceMs - (Date.now() - lastUserSendAtRef.current);
        if (wait <= 0) return debounceMs;
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
    let discardedApiCount = 0;
    let lastDiscardReason = '';

    try {
      for (let attempt = 0; attempt <= OC_CHAT_BURST_REGATHER_MAX; attempt++) {
        const quietMs = await waitBurstQuiet(attempt > 0 ? 'regather' : 'initial');

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
        const trailingBurst = countTrailingUserBurst(withUser);
        const burstFirstAt =
          typeof withUser[burstStart]?.at === 'number'
            ? withUser[burstStart]!.at
            : lastUserSendAtRef.current;

        flushAbortRef.current?.abort();
        const ac = new AbortController();
        flushAbortRef.current = ac;

        const apiStartedAt = Date.now();
        console.info('[oc-chat-ui] timing', {
          event: 'api_start',
          attempt,
          quietMs,
          trailingBurst,
          sinceBurstFirstMs: apiStartedAt - burstFirstAt,
          sinceFlushStartMs: apiStartedAt - flushStartedAt,
          discardedApiCount,
          lastDiscardReason: lastDiscardReason || undefined,
          lastUserPreview: String(last.content || '').slice(0, 40),
        });

        if (!stillOnChar(flushCharId)) return;

        let result: Awaited<ReturnType<typeof postOcChat>>;
        try {
          result = await postOcChat({
            characterId: flushCharId,
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
            memorySummary: memorySummaryRef.current,
            memorySummaryThroughAt: memorySummaryThroughAtRef.current,
            userMemory: userMemoryRef.current,
            userMemoryThroughAt: userMemoryThroughAtRef.current,
            signal: ac.signal,
          });
        } catch (err) {
          if (isAbortError(err) || burstEpochRef.current !== myEpoch) {
            discardedApiCount += 1;
            lastDiscardReason = 'abort_newer_burst';
            console.info('[oc-chat-ui] timing', {
              event: 'api_discard',
              reason: 'abort_newer_burst',
              attempt,
              apiMs: Date.now() - apiStartedAt,
              path: 'overlapping_api_cancelled',
            });
            /* 다른 OC로 떠나며 abort된 요청 — 백그라운드에서 다시 받아 pending 예약 */
            if (!stillOnChar(flushCharId)) {
              const leftChar =
                characters?.find((c) => String(c.id) === String(flushCharId)) ||
                characterRef.current;
              void completeOcChatReplyInBackground({
                characterId: flushCharId,
                visitorId: visitorRef.current || getOrCreateChatVisitorId(),
                character: leftChar,
              }).catch(() => {});
              return;
            }
            pendingFlushRef.current = false;
            continue;
          }
          throw err;
        }

        const apiMs = Date.now() - apiStartedAt;

        /* OC 이탈 — UI 연출 대신 pending으로 주차 후 백그라운드 배달 */
        if (!stillOnChar(flushCharId)) {
          const leftChar =
            characters?.find((c) => String(c.id) === String(flushCharId)) ||
            characterRef.current;
          await parkOcChatBehaviorAsPending({
            characterId: flushCharId,
            visitorId: visitorRef.current || getOrCreateChatVisitorId(),
            character: leftChar,
            behavior: result.behavior,
            affection: result.affection,
            freeGainToday: result.freeGainToday,
            freeLossToday: result.freeLossToday,
            freeGainDate: result.freeGainDate,
            deltaReason: result.deltaReason,
            memorySummary: result.memorySummary,
            memorySummaryThroughAt: result.memorySummaryThroughAt,
            userMemory: result.userMemory,
            userMemoryThroughAt: result.userMemoryThroughAt,
          });
          return;
        }

        /* API 대기 중 연타 → 불완전 응답 버리고 묶어서 재요청 */
        if (
          burstEpochRef.current !== myEpoch ||
          (hasLateUserMessages(stateRef.current.messages, includedAtStart) &&
            attempt < OC_CHAT_BURST_REGATHER_MAX)
        ) {
          discardedApiCount += 1;
          lastDiscardReason = burstEpochRef.current !== myEpoch ? 'epoch' : 'late_users';
          console.info('[oc-chat-ui] timing', {
            event: 'api_discard',
            reason: lastDiscardReason,
            attempt,
            apiMs,
            late: countTrailingUserBurst(stateRef.current.messages),
            path: 'overlapping_api_regather',
          });
          pendingFlushRef.current = false;
          continue;
        }

        const reasons = [...(metaSnap.recentDeltaReasons || [])];
        if (result.deltaReason && result.affinityDelta !== 0) {
          reasons.push(result.deltaReason);
        }

        const playStartedAt = Date.now();
        console.info('[oc-chat-ui] timing', {
          event: 'play_start',
          attempt,
          apiMs,
          action: result.behavior.action,
          bubbleCount: result.behavior.messages?.length || 0,
        });

        /* 호감·토스트는 읽음→답장 연출 끝난 뒤에만 (전송 직후 선반영 금지) */
        const playResult = await playBehavior(result.behavior, stateRef.current.messages, {
          affection: result.affection,
          freeGainToday: result.freeGainToday,
          freeGainDate: result.freeGainDate,
          story: st,
          expectEpoch: myEpoch,
        });
        const playMs = Date.now() - playStartedAt;

        /* play 도중 다른 OC로 이동 — 이후 메타/호감 반영은 새 OC에 섞이지 않게 중단 */
        if (!stillOnChar(flushCharId)) return;

        if (
          playResult === 'regather' ||
          burstEpochRef.current !== myEpoch
        ) {
          pendingFlushRef.current = false;
          discardedApiCount += 1;
          lastDiscardReason = 'play_regather';
          console.info('[oc-chat-ui] timing', {
            event: 'play_regather',
            attempt,
            apiMs,
            playMs,
            path: 'mid_play_newer_burst',
          });
          /* 다른 OC로 떠난 뒤엔 이 flush를 이어가지 않음 */
          if (!stillOnChar(flushCharId)) return;
          if (attempt < OC_CHAT_BURST_REGATHER_MAX) {
            continue;
          }
        }

        if (burstEpochRef.current !== myEpoch) {
          pendingFlushRef.current = false;
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

        if (typeof result.memorySummary === 'string') {
          memorySummaryRef.current = result.memorySummary.trim() || undefined;
        }
        if (typeof result.memorySummaryThroughAt === 'number') {
          memorySummaryThroughAtRef.current = result.memorySummaryThroughAt;
        }
        if (typeof result.userMemory === 'string') {
          userMemoryRef.current = result.userMemory.trim() || undefined;
        }
        if (typeof result.userMemoryThroughAt === 'number') {
          userMemoryThroughAtRef.current = result.userMemoryThroughAt;
        }

        const prevAffection = stateRef.current.affection;
        setAffection(result.affection);
        setFreeGainToday(result.freeGainToday);
        setFreeGainDate(result.freeGainDate);
        if (result.affinityDelta !== 0) {
          deferDisplayAffectionUntilToast(result.affection);
          flashAffectionToast(result.affinityDelta);
        } else {
          syncDisplayAffection(result.affection);
        }
        flashAffinityTierToast(prevAffection, result.affection);
        {
          const sealed = markUserMessagesReadThroughLastAssistant(
            stateRef.current.messages,
          );
          if (sealed !== stateRef.current.messages) setMessages(sealed);
          await persistSnapshot({
            messages: sealed,
            affection: result.affection,
            story: st,
            freeGainToday: result.freeGainToday,
            freeGainDate: result.freeGainDate,
            meta: afterMeta,
          });
        }

        console.info('[oc-chat-ui] timing', {
          event: 'turn_done',
          attempt,
          apiMs,
          playMs,
          totalFromBurstFirstMs: Date.now() - burstFirstAt,
          flushWallMs: Date.now() - flushStartedAt,
          discardedApiCount,
          trailingBurst,
          path: discardedApiCount > 0 ? 'regathered_then_ok' : 'single_pass',
        });
        busySilentRetryRef.current = 0;
        break;
      }
    } catch (err) {
      if (
        (typeof DOMException !== 'undefined' &&
          err instanceof DOMException &&
          err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        /* abort — 무시 */
      } else if (isOcChatTransientBusyError(err)) {
        /* 혼잡 문구 금지 — 읽음/대기 UI만 유지하고 조용히 재시도 */
        console.warn('[oc-chat] busy, silent retry', err);
        if (busySilentRetryRef.current < 4 && openRef.current && stillOnChar(flushCharId)) {
          busySilentRetryRef.current += 1;
          pendingFlushRef.current = true;
          const wait = 1_800 * busySilentRetryRef.current;
          window.setTimeout(() => {
            if (!openRef.current || !stillOnChar(flushCharId)) return;
            void flushDebouncedChatRef.current();
          }, wait);
        } else {
          busySilentRetryRef.current = 0;
        }
      } else {
        setError(formatOcChatFirebaseError(err, '전송 실패'));
      }
    } finally {
      flushLockRef.current = false;
      setOcChatReplyGenerationInflight(
        flushCharId,
        visitorRef.current || getOrCreateChatVisitorId(),
        false,
      );
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
      /*
       * 이탈·pendingFlush·trailingNeedsReply만으로 재flush하면 같은 유저 말에 답 2~5연타.
       * flush 이후 새로 온 유저 말이 있을 때만 다시 묶는다.
       */
      const needsAgain = lateUsers.length > 0;
      pendingFlushRef.current = false;
      if (needsAgain) {
        console.info('[oc-chat-ui] schedule trailing flush', {
          lateUserCount: lateUsers.length,
          trailingBurst: countTrailingUserBurst(trail),
          userBurstAtStart,
          waitMs: Math.max(
            0,
            burstQuietMsFor(lastUserText()) - (Date.now() - lastUserSendAtRef.current),
          ),
        });
        scheduleTrailingFlush();
      }
    }
  }, [
    charId,
    characters,
    deferDisplayAffectionUntilToast,
    flashAffectionToast,
    flashAffinityTierToast,
    focusComposer,
    inStory,
    persistSnapshot,
    playBehavior,
    stillOnChar,
    syncDisplayAffection,
  ]);

  const send = useCallback(async () => {
    const sendCharId = charId;
    const text = input.trim();
    /* 답장 대기 중에도 추가 전송 허용 (디바운스/다음 턴으로 이어짐) */
    if (!text || inStory) return;
    if (!stillOnChar(sendCharId)) return;
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
    if (!stillOnChar(sendCharId)) return;
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
        if (!openRef.current || !stillOnChar(sendCharId)) return;
        /*
         * replyLock이 연출 종료로 먼저 풀려도, 이미 답장이 붙은 유저 말은 읽음으로 확정.
         * (예전: !replyLock이면 early return → readAt 미반영 + 이후 persist가 미읽음 덮어쓰기)
         */
        const marked = replyLockRef.current
          ? markUserMessagesRead(stateRef.current.messages)
          : markUserMessagesReadThroughLastAssistant(stateRef.current.messages);
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
          characterId: sendCharId,
        }).catch(() => {});
      }, flashMs);
    }

    try {
      await persistSnapshot({
        messages: withUser,
        affection: aff,
        story: st,
        meta: nextMeta,
        skipSeen: !isViewingThread(),
        characterId: sendCharId,
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
        console.info('[oc-chat-ui] timing', {
          event: 'send_during_inflight',
          path: 'overlapping_api_or_play',
          flushLock: flushLockRef.current,
          replyLock: replyLockRef.current,
          preview: text.slice(0, 40),
        });
        return;
      }

      /* 마지막 메시지 기준 debounce — 짧은 리액션은 더 짧게 */
      const debounceMs = resolveOcChatSendDebounceMs(text);
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        void flushDebouncedChat();
      }, debounceMs);
      console.info('[oc-chat-ui] timing', {
        event: 'debounce_armed',
        debounceMs,
        preview: text.slice(0, 40),
      });
    } catch (err) {
      if (!isOcChatTransientBusyError(err)) {
        setError(formatOcChatFirebaseError(err, '전송 실패'));
      } else {
        console.warn('[oc-chat] send busy (no toast)', err);
      }
      focusComposer();
    }
  }, [
    charId,
    flushDebouncedChat,
    focusComposer,
    inStory,
    input,
    persistSnapshot,
    stillOnChar,
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
   * OC 전환 cleanup — 패널 닫힘으로 취급 금지.
   * (구버전: openRef=false + flushDebouncedChatRef → 새 OC id에 옛 메시지 저장)
   * 직전 OC 봉인은 useLayoutEffect가 담당.
   */
  useEffect(() => {
    const effectCharId = charId;
    return () => {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = 0;
      flushAbortRef.current?.abort();
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      setOcChatPendingUiOwned(effectCharId, vid, false);
    };
  }, [charId]);

  /* 패널 컴포넌트 진짜 언마운트 시에만 flush/pending 인계 */
  useEffect(() => {
    return () => {
      openRef.current = false;
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = 0;

      const id = activeCharIdRef.current;
      const vid = visitorRef.current || getOrCreateChatVisitorId();
      const pending = stateRef.current.meta.pendingBehavior;

      setOcChatPendingUiOwned(id, vid, false);
      if (pending?.applyAt) {
        scheduleOcChatPendingDelivery(
          id,
          vid,
          pending.applyAt,
          characterRef.current,
          pending.id,
        );
        if (pending.applyAt <= Date.now()) {
          void tryDeliverPendingChat({
            characterId: id,
            visitorId: vid,
            character: characterRef.current,
            expectPendingId: pending.id,
            force: true,
          }).catch(() => {});
        }
      }

      if (replyLockRef.current || flushLockRef.current) {
        pendingFlushRef.current = true;
        return;
      }

      const last = stateRef.current.messages[stateRef.current.messages.length - 1];
      if (
        last?.role === 'user' ||
        pendingFlushRef.current ||
        ocChatNeedsReplyToTrailingUsers(
          stateRef.current.messages,
          stateRef.current.meta.pendingBehavior,
        )
      ) {
        pendingFlushRef.current = false;
        void flushDebouncedChatRef.current();
      }
    };
  }, []);

  /* 채팅창만 닫아도(상세는 유지) pending 타이머·미응답 flush 보장 */
  useEffect(() => {
    if (open) return;
    const vid = visitorRef.current || getOrCreateChatVisitorId();
    setOcChatPendingUiOwned(charId, vid, false);
    const pending = stateRef.current.meta.pendingBehavior;
    if (pending?.applyAt) {
      scheduleOcChatPendingDelivery(
        charId,
        vid,
        pending.applyAt,
        characterRef.current,
        pending.id,
      );
      if (pending.applyAt <= Date.now()) {
        void tryDeliverPendingChat({
          characterId: charId,
          visitorId: vid,
          character: characterRef.current,
          expectPendingId: pending.id,
          force: true,
        }).catch(() => {});
      }
    }
  }, [open, charId]);

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
          /* 바깥(백드롭) = 채팅 전체 닫기 (목록으로 돌아가지 않음) */
          onClose();
        }}
      />
      <div className="oc-chat-phone" style={chatPointStyle as CSSProperties}>
        {affToast ? (
          <div
            key={affToast.id}
            className={`oc-chat-aff-toast${affToast.delta > 0 ? ' is-up' : ' is-down'}${
              affToast.leaving ? ' is-leaving' : ' is-enter'
            }`}
            role="status"
            aria-live="polite"
            aria-label={
              affToast.delta > 0
                ? `호감 +${affToast.delta}`
                : `호감 ${affToast.delta}`
            }
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              if (!affToast.leaving) return;
              if (!String(e.animationName || '').includes('ocChatAffToastOut')) return;
              window.clearTimeout(affToastTimer.current);
              setAffToast(null);
            }}
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
        <OcChatAffinityTierToast
          payload={tierToastQueue[0] ?? null}
          onDone={onAffinityTierToastDone}
        />
        <div className={`oc-chat-stack${phoneView === 'thread' ? ' is-thread' : ''}`}>
          <div className="oc-chat-screen oc-chat-screen--list" aria-hidden={phoneView !== 'list'}>
            <header className="oc-chat-phone__head oc-chat-phone__head--list">
              <div className="oc-chat-phone__meta">
                <div className="oc-chat-phone__name">채팅</div>
              </div>
              <button type="button" className="oc-chat-phone__close" onClick={onClose} aria-label="닫기">
                ✕
              </button>
            </header>
            <OcChatInboxList
              items={inboxItems}
              characters={characters}
              onSelect={(next) => {
                setPhoneView('thread');
                onPhoneViewChange?.('thread');
                jumpBottomOnEnterRef.current = true;
                onSelectCharacter?.(next);
              }}
            />
          </div>

          <div className="oc-chat-screen oc-chat-screen--thread" aria-hidden={phoneView !== 'thread'}>
        <header className="oc-chat-phone__head">
          <button
            type="button"
            className="oc-chat-phone__back"
            aria-label="채팅 목록"
            onClick={() => {
              setPhoneView('list');
              onPhoneViewChange?.('list');
              /*
               * 목록으로 나가면 숨은 스레드 연출에 UI 소유를 붙잡지 않음.
               * 소유가 남으면 AlertHost/타이머 배달·토스트가 막힘.
               */
              const vid = visitorRef.current || getOrCreateChatVisitorId();
              setOcChatPendingUiOwned(charId, vid, false);
              const pending =
                stateRef.current.meta.pendingBehavior ||
                peekOcChatThreadCache(charId, vid)?.pendingBehavior;
              if (pending?.applyAt) {
                scheduleOcChatPendingDelivery(
                  charId,
                  vid,
                  pending.applyAt,
                  characterRef.current,
                  pending.id,
                );
              }
              void refreshInbox();
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                d="M15 18l-6-6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
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

        <div className="oc-chat-phone__thread-wrap">
        <div className="oc-chat-phone__thread lh-scroll" ref={threadRef}>
          {messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const next = i < messages.length - 1 ? messages[i + 1] : null;
              const showDaySep = !prev || chatDayKey(prev.at) !== chatDayKey(m.at);
              const clusterCont = Boolean(prev && isChatClusterMate(prev, m));
              const clusterEnd = !next || !isChatClusterMate(m, next);
              const showAvatar =
                m.role === 'assistant' && m.kind !== 'narration' && !clusterCont;
              const showUnread = isOcChatUserMsgUnread(messages, i);
              const showReadLabel =
                m.role === 'user' &&
                m.kind !== 'narration' &&
                !showUnread &&
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
        <button
          type="button"
          className={`oc-chat-new-msg-pill${unreadWhileScrolled > 0 ? ' is-show' : ''}`}
          onClick={() => scrollToEnd({ force: true, smooth: true })}
        >
          <span>새 메시지 {unreadWhileScrolled}개</span>
          <span className="oc-chat-new-msg-pill__arrow" aria-hidden>
            ▾
          </span>
        </button>
        <button
          type="button"
          className={`oc-chat-scroll-fab${
            showScrollFab && unreadWhileScrolled <= 0 ? ' is-show' : ''
          }`}
          aria-label="최신 메시지로"
          onClick={() => scrollToEnd({ force: true, smooth: true })}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
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
        </div>
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
              <span className="oc-chat-relation__score">· {displayAffection}</span>
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
