import { signInAnonymously } from 'firebase/auth';
import { get, onValue, ref, remove, set, type Unsubscribe } from 'firebase/database';
import {
  clampAffection,
  isChatClosedNow,
  needsStoryMode,
  nextClosedUntil,
  PROACTIVE_AFFECTION_MIN,
  rollProactiveSend,
  todayKeyLocal,
} from '@/lib/oc/ocChatAffinity';
import {
  delayKindToMs,
  hoursSince,
  looksLikeBehaviorDump,
  nextLocalMidnightMs,
  parseOcChatBehavior,
  parseOcChatProactive,
  PROACTIVE_IDLE_MS,
  splitBubbleGapMs,
  type OcChatAction,
  type OcChatBehavior,
  type OcChatDelayKind,
  type OcChatPendingBehavior,
} from '@/lib/oc/ocChatBehavior';
import type { OcChatRecentAction } from '@/lib/oc/ocChatPresence';
import {
  appendRecentAction,
  presenceComeOnlineMs,
  resolveRecentActionsForPrompt,
  resolveResponseDelaySeconds,
} from '@/lib/oc/ocChatPresence';
import { resolveSticker } from '@/lib/oc/ocChatStickers';
import {
  areNearDuplicateLines,
  collapseSameIntentShortBubbles,
} from '@/lib/oc/ocChatVerify';
import { auth, db } from '@/lib/firebase/client';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';
import type { OcCharacter } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';
import {
  clearOcChatThreadBackup,
  clearOcChatThreadCache,
  findLongestLocalThreadRawForCharacter,
  peekOcChatThreadBackupRaw,
  peekOcChatThreadCacheRaw,
  writeOcChatThreadCacheRaw,
} from '@/lib/oc/ocChatLocalCache';

export const OC_CHAT_VISITOR_KEY = 'lh_oc_chat_visitor';
/** API/모델에 넘기는 최근 대화 말풍선 수 (~18턴 왕복). 비용 상한. */
export const OC_CHAT_API_HISTORY = 36;
/** 보관 한도 없음 — 하위 호환용 상수(trim no-op) */
export const OC_CHAT_STORE_MAX = Number.POSITIVE_INFINITY;

export type OcChatRole = 'user' | 'assistant';

export type OcChatMessageKind = 'chat' | 'story' | 'narration' | 'choice' | 'sticker';

export type OcChatMessage = {
  id: string;
  role: OcChatRole;
  content: string;
  at: number;
  kind?: OcChatMessageKind;
  /** user 전용: 없으면 안 읽음, 숫자면 읽은 시각 */
  readAt?: number | null;
  /** kind=sticker 일 때 이미지 URL */
  stickerUrl?: string;
  stickerId?: string;
};

export type OcChatStoryState = {
  episodeId: string;
  sceneId: string;
  completedEpisodeIds: string[];
};

export type OcChatThread = {
  messages: OcChatMessage[];
  updatedAt: number;
  affection: number;
  story?: OcChatStoryState;
  freeGainDate?: string;
  freeGainToday?: number;
  /** 오늘 자유대화 하락량 */
  freeLossToday?: number;
  lastSeenAt?: number;
  moodNote?: string;
  moodDate?: string;
  turnsToday?: number;
  turnsDate?: string;
  closedForToday?: boolean;
  closedDate?: string;
  /** end_for_today 후 이 시각까지 응답 잠금 (닫힌 시각 + 1~2h 랜덤) */
  closedUntil?: number;
  lastProactiveDate?: string;
  pendingBehavior?: OcChatPendingBehavior;
  /** 최근 호감 사유 (반복 감쇠용, 비표시) */
  recentDeltaReasons?: string[];
  lastInteractionAt?: number;
  neglectCheckedAt?: number;
  /** 메신저 presence */
  presence?: 'online' | 'offline';
  presenceUpdatedAt?: number;
  recentActions?: Array<{
    at: number;
    action: string;
    presence: 'online' | 'offline';
    note?: string;
  }>;
  /** 미해결 용건(선톡 A 카테고리). 없으면 감정형 선톡. */
  openThreads?: Array<{ id?: string; summary: string }>;
  /** 최근 창 밖 대화의 누적 장기 기억 요약 */
  memorySummary?: string;
  /** memorySummary에 반영된 마지막 메시지 at */
  memorySummaryThroughAt?: number;
  /** 대화 초기화 시각 — merge 시 이 이후의 짧은 스레드가 옛 긴 기록을 되살리지 않게 */
  clearedAt?: number;
  /** 이 시각 이전에 만든 pending은 merge에서 무시(배달·abort·취소) */
  pendingClearedAt?: number;
};

function threadPath(characterId: string, visitorId: string) {
  return `lhdata/oc_chat_threads/${characterId}/${visitorId}`;
}

function characterThreadsPath(characterId: string) {
  return `lhdata/oc_chat_threads/${characterId}`;
}

/**
 * RTDB 쓰기는 보통 auth 필요.
 * - 관리자 세션이 있으면 그대로 사용
 * - 없으면 익명 로그인 시도 (Firebase에서 꺼져 있으면 조용히 스킵)
 */
export async function ensureOcChatAuth(): Promise<void> {
  await auth.authStateReady();
  if (auth.currentUser) return;
  try {
    await signInAnonymously(auth);
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/admin-restricted-operation|operation-not-allowed|OPERATION_NOT_ALLOWED/i.test(`${code} ${msg}`)) {
      /* Anonymous 로그인 비활성 — 클라이언트 쓰기는 실패할 수 있어 API로 폴백 */
      console.warn('[oc-chat] anonymous auth unavailable', code || msg);
      return;
    }
    throw err;
  }
}

export function formatOcChatFirebaseError(err: unknown, fallback = '채팅 저장에 실패했습니다'): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (/admin-restricted-operation/i.test(raw)) {
    return '게스트 로그인(익명 인증)이 꺼져 있습니다. 관리자 로그인 후 이용하거나 Firebase Anonymous를 켜 주세요.';
  }
  if (/PERMISSION_DENIED|permission-denied|401|403/i.test(raw)) {
    return '채팅 저장 권한이 없습니다. 잠시 후 다시 열어 주세요.';
  }
  return raw.trim() || fallback;
}

function isPermissionDeniedError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err || '');
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  return /PERMISSION_DENIED|permission-denied|401|403/i.test(`${code} ${raw}`);
}

async function saveOcChatThreadViaApi(
  characterId: string,
  visitorId: string,
  thread: OcChatThread,
  opts?: { replace?: boolean },
): Promise<void> {
  const safeThread = stripUndefinedDeep(normalizeChatThread(thread));
  const res = await fetch('/api/oc-chat-thread', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId,
      visitorId,
      thread: safeThread,
      replace: opts?.replace === true,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `thread api save ${res.status}`);
  }
}

async function deleteOcChatThreadViaApi(characterId: string, visitorId: string): Promise<void> {
  const qs = new URLSearchParams({ characterId, visitorId });
  const res = await fetch(`/api/oc-chat-thread?${qs}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `thread api delete ${res.status}`);
  }
}

/** 해당 OC의 채팅 스레드만 삭제 (다른 OC 영향 없음) — 관리자용, 전 방문자 */
export async function resetOcChatForCharacter(characterId: string): Promise<void> {
  const id = String(characterId || '').trim();
  if (!id) throw new Error('캐릭터 ID가 없습니다');
  if (/[./\[\]]/.test(id)) throw new Error('잘못된 캐릭터 ID');
  await ensureOcChatAuth();
  try {
    await remove(ref(db, characterThreadsPath(id)));
  } catch (err) {
    if (!isPermissionDeniedError(err)) throw err;
    throw new Error('전체 스레드 삭제는 관리자 권한이 필요합니다');
  }
}

/** 이 방문자↔이 OC 스레드만 삭제 (다른 사람 대화 유지) */
export async function resetOcChatThreadForVisitor(
  characterId: string,
  visitorId: string,
): Promise<void> {
  const id = String(characterId || '').trim();
  const vid = String(visitorId || '').trim();
  if (!id) throw new Error('캐릭터 ID가 없습니다');
  if (!vid) throw new Error('방문자 ID가 없습니다');
  if (/[./\[\]]/.test(id) || /[./\[\]]/.test(vid)) throw new Error('잘못된 ID');
  await ensureOcChatAuth();
  try {
    await remove(ref(db, threadPath(id, vid)));
  } catch {
    /* firebase optional */
  }
  await deleteOcChatThreadViaApi(id, vid);
  clearOcChatThreadCache(id, vid);
  clearOcChatThreadBackup(id, vid);
}

export function peekOcChatThreadCache(
  characterId: string,
  visitorId: string,
): OcChatThread | null {
  const raw = peekOcChatThreadCacheRaw(characterId, visitorId);
  if (raw == null) return null;
  return normalizeChatThread(raw);
}

export function writeOcChatThreadCache(
  characterId: string,
  visitorId: string,
  thread: OcChatThread,
): void {
  writeOcChatThreadCacheRaw(characterId, visitorId, stripUndefinedDeep(normalizeChatThread(thread)));
}

const pendingDeliveryTimers = new Map<string, number>();
/** 채팅창이 열려 playBehavior가 연출 중일 때 백그라운드 타이머 배달 금지 */
const uiOwnedPendingKeys = new Set<string>();
/** 같은 스레드 pending 배달 동시 실행 합치기 */
const pendingDeliveryInflight = new Map<string, Promise<number>>();

function pendingDeliveryKey(characterId: string, visitorId: string): string {
  return `${characterId}::${visitorId}`;
}

export function cancelOcChatPendingDelivery(
  characterId: string,
  visitorId: string,
): void {
  if (typeof window === 'undefined') return;
  const key = pendingDeliveryKey(characterId, visitorId);
  const prev = pendingDeliveryTimers.get(key);
  if (prev) window.clearTimeout(prev);
  pendingDeliveryTimers.delete(key);
}

/** UI 연출이 pending 배달을 책임질 때 — 타이머/폴링이 같은 답을 또 붙이지 않게 */
export function setOcChatPendingUiOwned(
  characterId: string,
  visitorId: string,
  owned: boolean,
): void {
  const key = pendingDeliveryKey(characterId, visitorId);
  if (owned) {
    uiOwnedPendingKeys.add(key);
    cancelOcChatPendingDelivery(characterId, visitorId);
  } else {
    uiOwnedPendingKeys.delete(key);
  }
}

/** 창이 닫혀 있어도 applyAt에 답장 배달 (언마운트 생존) */
export function scheduleOcChatPendingDelivery(
  characterId: string,
  visitorId: string,
  applyAt: number | undefined,
  character?: Pick<OcCharacter, 'chatbot'>,
  expectPendingId?: string,
): void {
  if (typeof window === 'undefined') return;
  const key = pendingDeliveryKey(characterId, visitorId);
  const prev = pendingDeliveryTimers.get(key);
  if (prev) window.clearTimeout(prev);
  if (!applyAt || uiOwnedPendingKeys.has(key)) {
    pendingDeliveryTimers.delete(key);
    return;
  }
  const delay = Math.max(0, applyAt - Date.now()) + 60;
  const id = window.setTimeout(() => {
    pendingDeliveryTimers.delete(key);
    if (uiOwnedPendingKeys.has(key)) return;
    void tryDeliverPendingChat({
      characterId,
      visitorId,
      character,
      expectPendingId,
    }).catch(() => {});
  }, delay);
  pendingDeliveryTimers.set(key, id);
}

export function getOrCreateChatVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const hit = localStorage.getItem(OC_CHAT_VISITOR_KEY)?.trim();
    if (hit) return hit;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(OC_CHAT_VISITOR_KEY, id);
    return id;
  } catch {
    return `v-${Date.now().toString(36)}`;
  }
}

/** 대화 기록은 자르지 않음 */
export function trimChatMessages(messages: OcChatMessage[]): OcChatMessage[] {
  return messages;
}

export function createChatMessage(
  role: OcChatRole,
  content: string,
  kind: OcChatMessageKind = 'chat',
  opts?: { readAt?: number | null; stickerUrl?: string; stickerId?: string; at?: number },
): OcChatMessage {
  const msg: OcChatMessage = {
    id: newId(),
    role,
    content: content.trim(),
    at: typeof opts?.at === 'number' && Number.isFinite(opts.at) ? opts.at : Date.now(),
    kind,
  };
  if (opts?.stickerUrl) {
    msg.stickerUrl = opts.stickerUrl;
    msg.stickerId = opts.stickerId;
    if (!msg.kind || msg.kind === 'chat') msg.kind = 'sticker';
  }
  if (role === 'user') {
    msg.readAt = opts && 'readAt' in opts ? opts.readAt : null;
  }
  return msg;
}

export function markUserMessagesRead(
  messages: OcChatMessage[],
  at = Date.now(),
  opts?: { throughAt?: number },
): OcChatMessage[] {
  const throughAt = opts?.throughAt;
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== 'user' || m.readAt) return m;
    if (typeof throughAt === 'number' && m.at > throughAt) return m;
    changed = true;
    return { ...m, readAt: at };
  });
  return changed ? next : messages;
}

/**
 * 마지막 OC 답장(내레이션 제외) 이전의 유저 말만 읽음 처리.
 * 답장 뒤에 붙은 연타(아직 미응답)는 미읽음 "1" 유지.
 */
export function markUserMessagesReadThroughLastAssistant(
  messages: OcChatMessage[],
  at = Date.now(),
): OcChatMessage[] {
  let lastAsst = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    if ((m.kind || 'chat') === 'narration') continue;
    lastAsst = i;
    break;
  }
  if (lastAsst < 0) return messages;
  let changed = false;
  const next = messages.map((m, i) => {
    if (i >= lastAsst) return m;
    if (m.role !== 'user' || m.readAt) return m;
    if ((m.kind || 'chat') === 'narration') return m;
    changed = true;
    return { ...m, readAt: at };
  });
  return changed ? next : messages;
}

/** UI: 뒤에 OC 답장이 있으면 readAt 누락이어도 읽음으로 본다 */
export function isOcChatUserMsgUnread(
  messages: OcChatMessage[],
  index: number,
): boolean {
  const m = messages[index];
  if (!m || m.role !== 'user' || (m.kind || 'chat') === 'narration') return false;
  if (m.readAt) return false;
  for (let j = index + 1; j < messages.length; j++) {
    const n = messages[j];
    if (!n || n.role !== 'assistant') continue;
    if ((n.kind || 'chat') === 'narration') continue;
    return false;
  }
  return true;
}

export function countCharUnread(thread: OcChatThread): number {
  const seen = typeof thread.lastSeenAt === 'number' ? thread.lastSeenAt : 0;
  let n = 0;
  for (const m of thread.messages) {
    if (m.role !== 'assistant') continue;
    if (m.kind === 'narration') continue;
    if (m.at > seen) n += 1;
  }
  return n;
}

export function sleepMs(ms: number): Promise<void> {
  const t = Math.max(0, Math.round(ms));
  if (t <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, t);
  });
}

/** 같은 분·같은 화자면 말풍선 묶음 */
export function chatMinuteKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
}

export function chatDayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function isChatClusterMate(a: OcChatMessage, b: OcChatMessage): boolean {
  if (a.role !== b.role) return false;
  if (a.kind === 'narration' || b.kind === 'narration') return false;
  return chatMinuteKey(a.at) === chatMinuteKey(b.at);
}

/** 채팅 말풍선 옆 — "오후 7:01" */
export function formatChatClock(at: number): string {
  const d = new Date(at);
  const h24 = d.getHours();
  const m = d.getMinutes();
  const period = h24 < 12 ? '오전' : '오후';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${period} ${h12}:${String(m).padStart(2, '0')}`;
}

/** 채팅 목록 상대 시간 — "방금" / "N분 전" / "어제" / "M월 D일" */
export function formatChatRelativeTime(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return '';
  const diff = Math.max(0, now - at);
  if (diff < 60_000) return '방금';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}시간 전`;

  const d = new Date(at);
  const n = new Date(now);
  const startOfToday = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60_000;
  if (at >= startOfYesterday && at < startOfToday) return '어제';

  if (d.getFullYear() === n.getFullYear()) {
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

export type OcChatInboxItem = {
  characterId: string;
  lastAt: number;
  preview: string;
  unread: number;
  updatedAt: number;
};

export function previewFromChatMessage(m: OcChatMessage | undefined): string {
  if (!m) return '';
  if (m.kind === 'sticker') return '스티커';
  const text = String(m.content || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 120);
}

export function inboxItemFromThread(
  characterId: string,
  thread: OcChatThread | null | undefined,
): OcChatInboxItem | null {
  if (!thread?.messages?.length) return null;
  const last = thread.messages[thread.messages.length - 1]!;
  const lastAt = typeof last.at === 'number' ? last.at : 0;
  if (!lastAt) return null;
  return {
    characterId: String(characterId),
    lastAt,
    preview: previewFromChatMessage(last),
    unread: countCharUnread(thread),
    updatedAt:
      typeof thread.updatedAt === 'number' && thread.updatedAt > 0
        ? thread.updatedAt
        : lastAt,
  };
}

/** 서버 inbox + 로컬 캐시를 lastAt 기준으로 병합 (스레드 있는 것만). 더 오래된 항목으로 덮지 않음. */
export function mergeOcChatInboxItems(
  ...lists: OcChatInboxItem[][]
): OcChatInboxItem[] {
  const map = new Map<string, OcChatInboxItem>();
  for (const list of lists) {
    for (const item of list) {
      const id = String(item.characterId);
      const prev = map.get(id);
      if (!prev) {
        map.set(id, { ...item, characterId: id });
        continue;
      }
      if (item.lastAt > prev.lastAt) {
        map.set(id, { ...item, characterId: id });
        continue;
      }
      if (item.lastAt < prev.lastAt) continue;
      /* lastAt 동일 — unread/updatedAt만 보강. preview는 비어 있을 때만 채움(문구 깜빡임 방지) */
      const nextUnread = Math.max(prev.unread, item.unread);
      const nextUpdated = Math.max(prev.updatedAt || 0, item.updatedAt || 0);
      map.set(id, {
        ...prev,
        characterId: id,
        unread: nextUnread,
        updatedAt: nextUpdated || prev.lastAt,
        preview: prev.preview || item.preview,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
}

export function collectLocalOcChatInbox(visitorId: string, characterIds: string[]): OcChatInboxItem[] {
  const out: OcChatInboxItem[] = [];
  for (const id of characterIds) {
    const item = inboxItemFromThread(id, peekOcChatThreadCache(id, visitorId));
    if (item) out.push(item);
  }
  return out;
}

export async function fetchOcChatInbox(visitorId: string): Promise<OcChatInboxItem[]> {
  const vid = String(visitorId || '').trim();
  if (!vid) return [];
  const res = await fetch(`/api/oc-chat-inbox?visitorId=${encodeURIComponent(vid)}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: OcChatInboxItem[] };
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((raw) => {
      const characterId = String(raw?.characterId || '').trim();
      const lastAt = Number(raw?.lastAt) || 0;
      if (!characterId || !lastAt) return null;
      return {
        characterId,
        lastAt,
        preview: String(raw?.preview || ''),
        unread: Math.max(0, Math.floor(Number(raw?.unread) || 0)),
        updatedAt: Number(raw?.updatedAt) || lastAt,
      } satisfies OcChatInboxItem;
    })
    .filter((x): x is OcChatInboxItem => !!x)
    .sort((a, b) => b.lastAt - a.lastAt);
}

const CHAT_WEEKDAYS = [
  '일요일',
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
] as const;

/** 날짜 구분 — "7월 28일 화요일" (연도 없음) */
export function formatChatDayLabel(at: number): string {
  const d = new Date(at);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${CHAT_WEEKDAYS[d.getDay()]}`;
}

/** 연속 메시지 모아 응답 — 기본 대기 ms */
export const OC_CHAT_SEND_DEBOUNCE_MS = 1800;
/** 짧은 이모티콘·리액션 직후 대기 (더 짧게 묶음) */
export const OC_CHAT_REACTION_DEBOUNCE_MS = 850;
/** API/연출 중 연타로 재요청할 때 추가 침묵 대기 (전체 debounce 재적용 금지) */
export const OC_CHAT_REGATHER_QUIET_MS = 650;
/** API/연출 중 버스트가 커졌을 때 최대 재요청 횟수 */
export const OC_CHAT_BURST_REGATHER_MAX = 3;

/** ^0^/ · ㅋㅋ · 이모지 등 — 직전 말에 붙는 짧은 리액션 */
export function looksLikeShortReaction(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 28) return false;
  if (/^(ㅋ+|ㅎ+|ㅠ+|ㅜ+|ㅇㅇ|응|어|웅|헐|와|오|아+|네|ㅇㅋ|ㄱㄱ|ㄱㅅ|ㄴㄴ|ㄷㄷ|ㅎㅎ|ㅋㅋ)$/i.test(t)) {
    return true;
  }
  /* 카오모지·기호 위주 */
  if (/^[\^ㅇㅋㅎㅠㅜㄷ;:.\-~!?*_/\\|()[\]{}<>'"`~\s0-9a-zA-Z]+$/.test(t) && t.length <= 16) {
    if (/[\^;:()<>_|~*]/.test(t) || /[ㅋㅎㅠㅜㅇ]/.test(t)) return true;
  }
  try {
    if (/\p{Extended_Pictographic}/u.test(t) && t.replace(/\s/g, '').length <= 12) return true;
  } catch {
    /* older runtimes */
  }
  return false;
}

/** 마지막 유저 말 기준 debounce */
export function resolveOcChatSendDebounceMs(lastUserText?: string): number {
  return looksLikeShortReaction(lastUserText || '')
    ? OC_CHAT_REACTION_DEBOUNCE_MS
    : OC_CHAT_SEND_DEBOUNCE_MS;
}

/**
 * flush 스냅샷에 없던 유저 말(응답 도중 연타)을 분리.
 * 봇 답은 head 뒤에 붙이고 lateUsers를 맨 뒤로 두어 다음 flush가 잡게 함.
 */
export function extractLateUserMessages<T extends { id: string; role?: string }>(
  messages: T[],
  includedIds: Set<string>,
): { head: T[]; lateUsers: T[] } {
  const head: T[] = [];
  const lateUsers: T[] = [];
  for (const m of messages) {
    if (m.role === 'user' && !includedIds.has(m.id)) lateUsers.push(m);
    else head.push(m);
  }
  return { head, lateUsers };
}

/** flush 시작 이후에 들어온 user 말이 있는지 */
export function hasLateUserMessages(
  messages: Array<{ id: string; role?: string }>,
  includedIds: Set<string>,
): boolean {
  return messages.some((m) => m.role === 'user' && !includedIds.has(m.id));
}

/** 끝에서부터 연속된 user 말풍선 수 */
export function countTrailingUserBurst(
  messages: Array<{ role?: string; kind?: string }>,
): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || (m.kind || 'chat') === 'narration') continue;
    if (m.role !== 'user') break;
    n += 1;
  }
  return n;
}

/** 마지막이 유저 말이고, 대기 중인 답장 예약이 없으면 새 응답이 필요 */
export function ocChatNeedsReplyToTrailingUsers(
  messages: Array<{ role?: string; kind?: string }>,
  pending?: OcChatPendingBehavior | null,
): boolean {
  if (countTrailingUserBurst(messages) <= 0) return false;
  if (
    pending &&
    (pending.action === 'respond' ||
      pending.action === 'read_only' ||
      pending.action === 'end_for_today' ||
      pending.action === 'ignore')
  ) {
    return false;
  }
  return true;
}


function normalizeStory(raw: unknown): OcChatStoryState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const episodeId = String(o.episodeId || '').trim();
  const sceneId = String(o.sceneId || '').trim();
  if (!episodeId || !sceneId) return undefined;
  const completed = Array.isArray(o.completedEpisodeIds)
    ? o.completedEpisodeIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return { episodeId, sceneId, completedEpisodeIds: completed };
}

function normalizePending(raw: unknown): OcChatPendingBehavior | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const applyAt = typeof o.applyAt === 'number' ? o.applyAt : 0;
  const action = String(o.action || '') as OcChatAction;
  if (!applyAt || !['respond', 'read_only', 'ignore', 'end_for_today'].includes(action)) {
    return undefined;
  }
  const messages = Array.isArray(o.messages)
    ? o.messages.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const presenceRaw = String(o.presenceState || '').trim();
  const presenceState =
    presenceRaw === 'online' || presenceRaw === 'offline' ? presenceRaw : undefined;
  return {
    id: String(o.id || '').trim() || undefined,
    applyAt,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : undefined,
    action,
    messages,
    moodNote: String(o.moodNote || '').trim() || undefined,
    affinityDelta: typeof o.affinityDelta === 'number' ? o.affinityDelta : 0,
    presenceState,
    responseDelaySeconds:
      typeof o.responseDelaySeconds === 'number' ? o.responseDelaySeconds : undefined,
    sticker:
      o.sticker && typeof o.sticker === 'object'
        ? {
            id: String((o.sticker as { id?: string }).id || '').trim() || undefined,
            tags: Array.isArray((o.sticker as { tags?: unknown }).tags)
              ? ((o.sticker as { tags: unknown[] }).tags || [])
                  .map((t) => String(t || '').trim())
                  .filter(Boolean)
                  .slice(0, 4)
              : undefined,
          }
        : o.sticker === null
          ? null
          : undefined,
  };
}

export function normalizeChatThread(raw: unknown): OcChatThread {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(o.messages) ? o.messages : [];
  const messages: OcChatMessage[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
    const stickerUrl = String(m.stickerUrl || '').trim() || undefined;
    const stickerId = String(m.stickerId || '').trim() || undefined;
    const content = String(m.content || '').trim();
    if (!role || (!content && !stickerUrl)) continue;
    const kindRaw = String(m.kind || (stickerUrl ? 'sticker' : 'chat'));
    const kind: OcChatMessageKind =
      kindRaw === 'story' ||
      kindRaw === 'narration' ||
      kindRaw === 'choice' ||
      kindRaw === 'sticker' ||
      kindRaw === 'chat'
        ? kindRaw
        : 'chat';
    const readAt =
      m.readAt === null
        ? null
        : typeof m.readAt === 'number' && Number.isFinite(m.readAt)
          ? m.readAt
          : role === 'user'
            ? null
            : undefined;
    messages.push({
      id: String(m.id || newId()),
      role,
      content: content || (stickerUrl ? '스티커' : ''),
      at: typeof m.at === 'number' ? m.at : Date.now(),
      kind,
      ...(stickerUrl ? { stickerUrl, stickerId } : {}),
      ...(role === 'user' ? { readAt } : {}),
    });
  }
  const today = todayKeyLocal();
  const freeGainDate = String(o.freeGainDate || '').trim() || undefined;
  const freeGainToday =
    typeof o.freeGainToday === 'number' && Number.isFinite(o.freeGainToday)
      ? Math.max(0, o.freeGainToday)
      : 0;
  const freeLossToday =
    typeof o.freeLossToday === 'number' && Number.isFinite(o.freeLossToday)
      ? Math.max(0, o.freeLossToday)
      : 0;
  const turnsDate = String(o.turnsDate || '').trim() || undefined;
  const turnsToday =
    typeof o.turnsToday === 'number' && Number.isFinite(o.turnsToday)
      ? Math.max(0, o.turnsToday)
      : 0;
  const closedDate = String(o.closedDate || '').trim() || undefined;
  const closedUntilRaw =
    typeof o.closedUntil === 'number' && Number.isFinite(o.closedUntil)
      ? o.closedUntil
      : undefined;
  let closedUntil: number | undefined;
  if (closedUntilRaw != null) {
    closedUntil = isChatClosedNow(closedUntilRaw) ? closedUntilRaw : undefined;
  } else if (closedDate === today && o.closedForToday === true) {
    /* 예전: 당일 잠금 → 다음날 자정까지로 이관 */
    const until = nextLocalMidnightMs();
    closedUntil = isChatClosedNow(until) ? until : undefined;
  }
  const closedForToday = isChatClosedNow(closedUntil);
  const moodDate = String(o.moodDate || '').trim() || undefined;
  const lastSeenAt =
    typeof o.lastSeenAt === 'number' && Number.isFinite(o.lastSeenAt)
      ? o.lastSeenAt
      : undefined;
  const recentDeltaReasons = Array.isArray(o.recentDeltaReasons)
    ? o.recentDeltaReasons.map((x) => String(x || '').trim()).filter(Boolean).slice(-8)
    : [];
  const lastInteractionAt =
    typeof o.lastInteractionAt === 'number' && Number.isFinite(o.lastInteractionAt)
      ? o.lastInteractionAt
      : lastMessageAt(messages);
  const neglectCheckedAt =
    typeof o.neglectCheckedAt === 'number' && Number.isFinite(o.neglectCheckedAt)
      ? o.neglectCheckedAt
      : undefined;
  const presenceRaw = String(o.presence || '').trim();
  const presence =
    presenceRaw === 'online' || presenceRaw === 'offline' ? presenceRaw : undefined;
  const presenceUpdatedAt =
    typeof o.presenceUpdatedAt === 'number' && Number.isFinite(o.presenceUpdatedAt)
      ? o.presenceUpdatedAt
      : undefined;
  const recentActions = Array.isArray(o.recentActions)
    ? o.recentActions
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const a = item as Record<string, unknown>;
          const at = typeof a.at === 'number' ? a.at : 0;
          const action = String(a.action || '').trim();
          const p = String(a.presence || '').trim();
          if (!at || !action || (p !== 'online' && p !== 'offline')) return null;
          return {
            at,
            action,
            presence: p as 'online' | 'offline',
            note: String(a.note || '').trim() || undefined,
          };
        })
        .filter(Boolean)
        .slice(-10) as OcChatThread['recentActions']
    : undefined;
  const openThreads = Array.isArray(o.openThreads)
    ? o.openThreads
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const t = item as Record<string, unknown>;
          const summary = String(t.summary || '').trim();
          if (!summary) return null;
          const id = String(t.id || '').trim() || undefined;
          return { id, summary };
        })
        .filter(Boolean)
        .slice(0, 8) as OcChatThread['openThreads']
    : undefined;
  const memorySummary = String(o.memorySummary || '').trim().slice(0, 800) || undefined;
  const memorySummaryThroughAt =
    typeof o.memorySummaryThroughAt === 'number' && Number.isFinite(o.memorySummaryThroughAt)
      ? o.memorySummaryThroughAt
      : undefined;
  const clearedAt =
    typeof o.clearedAt === 'number' && Number.isFinite(o.clearedAt) && o.clearedAt > 0
      ? o.clearedAt
      : undefined;
  const pendingClearedAt =
    typeof o.pendingClearedAt === 'number' &&
    Number.isFinite(o.pendingClearedAt) &&
    o.pendingClearedAt > 0
      ? o.pendingClearedAt
      : undefined;
  let pendingBehavior = normalizePending(o.pendingBehavior);
  if (
    pendingBehavior &&
    pendingClearedAt &&
    (pendingBehavior.createdAt || 0) > 0 &&
    (pendingBehavior.createdAt || 0) <= pendingClearedAt
  ) {
    pendingBehavior = undefined;
  }

  return {
    messages: trimChatMessages(dedupeRecentAssistantDuplicates(messages)),
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    affection: clampAffection(typeof o.affection === 'number' ? o.affection : 0),
    story: normalizeStory(o.story),
    freeGainDate,
    freeGainToday: freeGainDate === today ? freeGainToday : 0,
    freeLossToday: freeGainDate === today ? freeLossToday : 0,
    lastSeenAt,
    moodNote: moodDate === today ? String(o.moodNote || '').trim() || undefined : undefined,
    moodDate: moodDate === today ? moodDate : undefined,
    turnsToday: turnsDate === today ? turnsToday : 0,
    turnsDate: turnsDate === today ? turnsDate : undefined,
    closedForToday,
    closedDate: undefined,
    closedUntil,
    lastProactiveDate: String(o.lastProactiveDate || '').trim() || undefined,
    pendingBehavior,
    recentDeltaReasons,
    lastInteractionAt,
    neglectCheckedAt,
    presence,
    presenceUpdatedAt,
    recentActions,
    openThreads,
    memorySummary,
    memorySummaryThroughAt,
    clearedAt,
    pendingClearedAt,
  };
}

async function loadOcChatThreadViaApi(
  characterId: string,
  visitorId: string,
): Promise<OcChatThread | null> {
  if (typeof window === 'undefined') return null;
  const qs = new URLSearchParams({ characterId, visitorId });
  const res = await fetch(`/api/oc-chat-thread?${qs}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { thread?: unknown } | null;
  if (!data?.thread) return null;
  return normalizeChatThread(data.thread);
}

function pickNewerThreadClient(a: OcChatThread, b: OcChatThread | null): OcChatThread {
  return mergeOcChatThreads(a, b);
}

/** 메시지 id 기준 합집합 — 느린/겹친 저장이 답장을 지우지 않게 */
function mergeChatMessages(a: OcChatMessage[], b: OcChatMessage[]): OcChatMessage[] {
  const map = new Map<string, OcChatMessage>();
  for (const m of a) map.set(m.id, m);
  for (const m of b) {
    const prev = map.get(m.id);
    if (!prev) {
      map.set(m.id, m);
      continue;
    }
    map.set(m.id, {
      ...prev,
      ...m,
      /* 숫자 readAt 우선 — null/누락이 읽음을 다시 덮어쓰지 않게 */
      readAt:
        typeof m.readAt === 'number'
          ? m.readAt
          : typeof prev.readAt === 'number'
            ? prev.readAt
            : (m.readAt ?? prev.readAt),
      stickerUrl: m.stickerUrl || prev.stickerUrl,
      stickerId: m.stickerId || prev.stickerId,
    });
  }
  const sorted = [...map.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));
  /* 이중 배달로 생긴 같은 내용 복사본 제거 (A B B A → A B) */
  return dedupeRecentAssistantDuplicates(sorted);
}

function pendingLooksDelivered(
  pending: OcChatPendingBehavior,
  messages: OcChatMessage[],
): boolean {
  const lines = pending.messages || [];
  if (!lines.length && !pending.sticker) {
    /* read_only/ignore 예약은 말풍선이 없음 — clearedAt으로만 소거 */
    return false;
  }
  return pendingLinesAlreadyPresent(messages, lines, Boolean(pending.sticker));
}

function pickPendingBehavior(
  a?: OcChatPendingBehavior,
  b?: OcChatPendingBehavior,
  aMessages: OcChatMessage[] = [],
  bMessages: OcChatMessage[] = [],
  pendingClearedAt = 0,
): OcChatPendingBehavior | undefined {
  const alive = (p?: OcChatPendingBehavior) => {
    if (!p) return undefined;
    if (
      pendingClearedAt > 0 &&
      typeof p.createdAt === 'number' &&
      p.createdAt > 0 &&
      p.createdAt <= pendingClearedAt
    ) {
      return undefined;
    }
    return p;
  };
  a = alive(a);
  b = alive(b);
  if (!a && !b) return undefined;
  if (a && !b) {
    /*
     * 예전: 메시지 길이 같으면 pending 삭제 → lastSeen/재입장 저장이
     * 아직 배달 안 된 답장 예약을 지워버리는 버그.
     * 이제는 실제 배달됐을 때만 제거.
     */
    if (pendingLooksDelivered(a, bMessages)) return undefined;
    return a;
  }
  if (!a && b) {
    if (pendingLooksDelivered(b, aMessages)) return undefined;
    return b;
  }
  /* 같은 예약이면 id가 있는 쪽·더 늦은 applyAt 우선 */
  if (a!.id && b!.id && a!.id === b!.id) {
    return (a!.applyAt || 0) >= (b!.applyAt || 0) ? a : b;
  }
  return (a!.applyAt || 0) >= (b!.applyAt || 0) ? a : b;
}

function isBlankThreadForMerge(t: OcChatThread): boolean {
  return (
    !t.messages.length &&
    !t.pendingBehavior &&
    !t.story &&
    !(t.affection > 0) &&
    !t.lastSeenAt &&
    !t.lastInteractionAt
  );
}

function pickStoryState(
  a: OcChatStoryState | undefined,
  b: OcChatStoryState | undefined,
): OcChatStoryState | undefined {
  if (!a) return b;
  if (!b) return a;
  const aDone = a.completedEpisodeIds?.length || 0;
  const bDone = b.completedEpisodeIds?.length || 0;
  const completedEpisodeIds = Array.from(
    new Set([...(a.completedEpisodeIds || []), ...(b.completedEpisodeIds || [])]),
  );
  /* 완료 목록이 더 많은 쪽의 episode/scene을 우선하되, 완료 id는 합친다 */
  const base = bDone > aDone ? b : aDone > bDone ? a : b.sceneId ? b : a;
  return {
    episodeId: base.episodeId || a.episodeId || b.episodeId,
    sceneId: base.sceneId || a.sceneId || b.sceneId,
    completedEpisodeIds,
  };
}

/** R2/Firebase·동시 저장 병합. 빈 스레드(리셋)는 상대를 그대로 씀. */
export function mergeOcChatThreads(
  a: OcChatThread | null | undefined,
  b: OcChatThread | null | undefined,
): OcChatThread {
  const na = normalizeChatThread(a);
  const nb = normalizeChatThread(b);
  if (isBlankThreadForMerge(na)) return nb;
  if (isBlankThreadForMerge(nb)) return na;

  const newer = (nb.updatedAt || 0) >= (na.updatedAt || 0) ? nb : na;
  const older = newer === nb ? na : nb;

  /*
   * 의도적 초기화(clearedAt)만 긴 기록을 버린다.
   * (예전 looksLikeWipe: 짧은 최신 스냅샷이 긴 대화를 지워버리는 버그가 있었음)
   */
  const clearAt = Math.max(na.clearedAt || 0, nb.clearedAt || 0);
  if (clearAt > 0) {
    const cleared = (na.clearedAt || 0) >= (nb.clearedAt || 0) ? na : nb;
    const other = cleared === na ? nb : na;
    if (clearAt >= (other.updatedAt || 0)) {
      return normalizeChatThread({
        ...cleared,
        clearedAt: clearAt,
        updatedAt: Math.max(cleared.updatedAt || 0, clearAt),
      });
    }
    /* 초기화 이후 이어 쓴 쪽과 초기화 이전 쪽이 섞일 때: clearedAt 이후 메시지만 남김 */
    const kept = mergeChatMessages(na.messages, nb.messages).filter(
      (m) => m.at >= clearAt - 50,
    );
    return normalizeChatThread({
      ...newer,
      ...cleared,
      messages: kept.length ? kept : cleared.messages,
      story: cleared.story,
      affection: Math.max(cleared.affection || 0, newer === cleared ? newer.affection : 0),
      clearedAt: clearAt,
      updatedAt: Math.max(na.updatedAt || 0, nb.updatedAt || 0),
      memorySummary: cleared.memorySummary,
      memorySummaryThroughAt: cleared.memorySummaryThroughAt,
    });
  }

  const messages = trimChatMessages(mergeChatMessages(na.messages, nb.messages));
  const pendingClearedAt =
    Math.max(na.pendingClearedAt || 0, nb.pendingClearedAt || 0) || undefined;

  return normalizeChatThread({
    ...older,
    ...newer,
    messages,
    story: pickStoryState(na.story, nb.story),
    pendingBehavior: pickPendingBehavior(
      na.pendingBehavior,
      nb.pendingBehavior,
      na.messages,
      nb.messages,
      pendingClearedAt || 0,
    ),
    affection: Math.max(na.affection || 0, nb.affection || 0),
    updatedAt: Math.max(na.updatedAt || 0, nb.updatedAt || 0),
    lastSeenAt: Math.max(na.lastSeenAt || 0, nb.lastSeenAt || 0) || undefined,
    lastInteractionAt:
      Math.max(na.lastInteractionAt || 0, nb.lastInteractionAt || 0) || undefined,
    freeGainToday: Math.max(na.freeGainToday || 0, nb.freeGainToday || 0),
    freeLossToday: Math.max(na.freeLossToday || 0, nb.freeLossToday || 0),
    turnsToday: Math.max(na.turnsToday || 0, nb.turnsToday || 0),
    memorySummary:
      (na.memorySummaryThroughAt || 0) >= (nb.memorySummaryThroughAt || 0)
        ? na.memorySummary || nb.memorySummary
        : nb.memorySummary || na.memorySummary,
    memorySummaryThroughAt:
      Math.max(na.memorySummaryThroughAt || 0, nb.memorySummaryThroughAt || 0) || undefined,
    clearedAt: undefined,
    pendingClearedAt,
  });
}

/** 짧은 스냅샷이 긴 기록을 덮지 않게 — clearedAt(초기화) 없을 때만 */
function protectAgainstAccidentalShrink(
  existing: OcChatThread | null | undefined,
  incoming: OcChatThread,
): OcChatThread {
  if (!existing || existing.messages.length <= incoming.messages.length) return incoming;
  if (incoming.clearedAt && incoming.clearedAt >= (existing.updatedAt || 0)) {
    return incoming;
  }
  const gap = existing.messages.length - incoming.messages.length;
  if (gap < 3) return incoming;
  console.warn('[oc-chat] refuse shrink — merge longer existing', {
    existing: existing.messages.length,
    incoming: incoming.messages.length,
  });
  return mergeOcChatThreads(existing, incoming);
}

export async function loadOcChatThread(
  characterId: string,
  visitorId: string,
): Promise<OcChatThread> {
  const cached = peekOcChatThreadCache(characterId, visitorId);
  const backup = normalizeChatThread(peekOcChatThreadBackupRaw(characterId, visitorId));
  /* API가 R2+Firebase를 이미 병합 — 클라이언트 이중 Firebase get 생략으로 로드 지연 감소 */
  const fromApi = await loadOcChatThreadViaApi(characterId, visitorId);
  let remote = fromApi;
  if (!fromApi || isBlankThreadForMerge(fromApi)) {
    await auth.authStateReady().catch(() => undefined);
    try {
      const snap = await get(ref(db, threadPath(characterId, visitorId)));
      remote = mergeOcChatThreads(fromApi, normalizeChatThread(snap.val()));
    } catch {
      remote = fromApi || normalizeChatThread(null);
    }
  }
  let merged = mergeOcChatThreads(cached, remote);
  /* 로컬 최장 백업 복구 (짧은 wipe 이후) */
  if (
    backup.messages.length > merged.messages.length + 2 &&
    !merged.clearedAt
  ) {
    console.info('[oc-chat] recover from local backup', {
      characterId,
      backup: backup.messages.length,
      current: merged.messages.length,
    });
    merged = mergeOcChatThreads(merged, backup);
  }
  /*
   * visitorId가 바뀌어 새 짧은 스레드만 보일 때 —
   * 같은 캐릭터의 다른 로컬 키에 긴 기록이 있으면 합친다.
   */
  if (!merged.clearedAt && merged.messages.length < 8) {
    const longest = findLongestLocalThreadRawForCharacter(characterId);
    if (longest && messageCountLike(longest.thread) > merged.messages.length + 2) {
      console.info('[oc-chat] recover from other local visitor cache', {
        characterId,
        fromVisitor: longest.visitorId.slice(0, 8),
        source: longest.source,
        recovered: messageCountLike(longest.thread),
        current: merged.messages.length,
      });
      merged = mergeOcChatThreads(merged, normalizeChatThread(longest.thread));
    }
  }
  writeOcChatThreadCache(characterId, visitorId, merged);
  console.info('[oc-chat] thread load', {
    characterId,
    visitorId: visitorId.slice(0, 8),
    cached: cached?.messages.length || 0,
    remote: remote?.messages.length || 0,
    backup: backup.messages.length,
    merged: merged.messages.length,
  });
  if (merged.pendingBehavior?.applyAt) {
    scheduleOcChatPendingDelivery(
      characterId,
      visitorId,
      merged.pendingBehavior.applyAt,
      undefined,
      merged.pendingBehavior.id,
    );
  }
  return merged;
}

function messageCountLike(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const msgs = (raw as { messages?: unknown }).messages;
  return Array.isArray(msgs) ? msgs.length : 0;
}

export function subscribeOcChatThread(
  characterId: string,
  visitorId: string,
  onData: (thread: OcChatThread) => void,
): Unsubscribe {
  let stopped = false;
  let lastUpdated = -1;

  const emit = (thread: OcChatThread) => {
    const at = thread.updatedAt || 0;
    if (at === lastUpdated && lastUpdated >= 0) return;
    lastUpdated = at;
    onData(thread);
  };

  const pull = () => {
    void loadOcChatThread(characterId, visitorId)
      .then((thread) => {
        if (!stopped) emit(thread);
      })
      .catch(() => {});
  };

  pull();
  const pollId = window.setInterval(pull, 4000);

  let unsubFb: Unsubscribe | null = null;
  try {
    unsubFb = onValue(ref(db, threadPath(characterId, visitorId)), (snap) => {
      if (stopped) return;
      void loadOcChatThreadViaApi(characterId, visitorId).then((fromApi) => {
        if (stopped) return;
        emit(mergeOcChatThreads(normalizeChatThread(snap.val()), fromApi));
      });
    });
  } catch {
    /* firebase subscribe optional */
  }

  return () => {
    stopped = true;
    window.clearInterval(pollId);
    unsubFb?.();
  };
}

export async function saveOcChatThread(
  characterId: string,
  visitorId: string,
  thread: OcChatThread,
  opts?: { replace?: boolean },
): Promise<void> {
  const existingLocal = peekOcChatThreadCache(characterId, visitorId);
  const protectedThread = opts?.replace
    ? thread
    : protectAgainstAccidentalShrink(existingLocal, thread);
  const next: OcChatThread = {
    messages: trimChatMessages(protectedThread.messages),
    updatedAt: Date.now(),
    affection: clampAffection(protectedThread.affection ?? 0),
    story: protectedThread.story,
    freeGainDate: protectedThread.freeGainDate,
    freeGainToday: protectedThread.freeGainToday,
    freeLossToday: protectedThread.freeLossToday,
    lastSeenAt: protectedThread.lastSeenAt,
    moodNote: protectedThread.moodNote,
    moodDate: protectedThread.moodDate,
    turnsToday: protectedThread.turnsToday,
    turnsDate: protectedThread.turnsDate,
    closedForToday: protectedThread.closedForToday,
    closedDate: protectedThread.closedDate,
    closedUntil: protectedThread.closedUntil,
    lastProactiveDate: protectedThread.lastProactiveDate,
    pendingBehavior: protectedThread.pendingBehavior,
    recentDeltaReasons: protectedThread.recentDeltaReasons,
    lastInteractionAt: protectedThread.lastInteractionAt,
    neglectCheckedAt: protectedThread.neglectCheckedAt,
    presence: protectedThread.presence,
    presenceUpdatedAt: protectedThread.presenceUpdatedAt,
    recentActions: protectedThread.recentActions,
    openThreads: protectedThread.openThreads,
    memorySummary: protectedThread.memorySummary,
    memorySummaryThroughAt: protectedThread.memorySummaryThroughAt,
    clearedAt: protectedThread.clearedAt,
    pendingClearedAt: protectedThread.pendingClearedAt,
  };

  /* 즉시 로컬 캐시 — 다시 열 때 딜레이 없이 표시 */
  if (opts?.replace) {
    writeOcChatThreadCache(characterId, visitorId, next);
    clearOcChatThreadBackup(characterId, visitorId);
  } else {
    writeOcChatThreadCache(
      characterId,
      visitorId,
      mergeOcChatThreads(peekOcChatThreadCache(characterId, visitorId), next),
    );
  }
  scheduleOcChatPendingDelivery(
    characterId,
    visitorId,
    next.pendingBehavior?.applyAt,
    undefined,
    next.pendingBehavior?.id,
  );

  /* 주 저장소: R2 API — 서버에서 기존 스레드와 merge (replace 시 덮어쓰기) */
  await saveOcChatThreadViaApi(characterId, visitorId, next, opts);

  /* Firebase는 best-effort — 실패해도 무시 */
  try {
    await ensureOcChatAuth();
    if (auth.currentUser) {
      await set(ref(db, threadPath(characterId, visitorId)), stripUndefinedDeep(next));
    }
  } catch {
    /* ignore */
  }
}

/** pending 대사가 이미 스레드 끝에 붙어 있는지 (이중 배달 방지) */
export function pendingLinesAlreadyAtTail(
  messages: Array<{ role?: string; kind?: string; content?: string }>,
  lines: string[],
  expectSticker = false,
): boolean {
  if (!lines.length && !expectSticker) return false;
  const want = lines.map((l) => l.trim()).filter(Boolean);
  if (!want.length && !expectSticker) return false;
  let i = messages.length - 1;
  if (expectSticker) {
    const last = messages[i];
    if (!last || last.role !== 'assistant' || (last.kind || 'chat') !== 'sticker') {
      return false;
    }
    i -= 1;
  }
  for (let w = want.length - 1; w >= 0; w -= 1) {
    const m = messages[i];
    if (
      !m ||
      m.role !== 'assistant' ||
      (m.kind || 'chat') !== 'chat' ||
      String(m.content || '').trim() !== want[w]
    ) {
      return false;
    }
    i -= 1;
  }
  return true;
}

/**
 * pending 대사열이 최근 assistant 구간에 순서대로 이미 있는지.
 * 꼬리 정확 일치뿐 아니라 연출 중 새로고침 후 부분/역순 합쳐진 경우도 커버.
 */
export function pendingLinesAlreadyPresent(
  messages: Array<{ role?: string; kind?: string; content?: string }>,
  lines: string[],
  expectSticker = false,
): boolean {
  if (pendingLinesAlreadyAtTail(messages, lines, expectSticker)) return true;
  const want = lines.map((l) => l.trim()).filter(Boolean);
  if (!want.length) return false;
  const recent = messages.slice(-Math.max(24, want.length * 4));
  let wi = 0;
  for (const m of recent) {
    if (m.role !== 'assistant' || (m.kind || 'chat') !== 'chat') continue;
    if (String(m.content || '').trim() !== want[wi]) continue;
    wi += 1;
    if (wi >= want.length) {
      if (!expectSticker) return true;
      return recent.some(
        (x) => x.role === 'assistant' && (x.kind || 'chat') === 'sticker',
      );
    }
  }
  return false;
}

/** 연속 동일 assistant 말풍선 제거 (이중 배달 안전망) */
export function dedupeAdjacentAssistantMessages<
  T extends { role?: string; kind?: string; content?: string; at?: number },
>(messages: T[]): T[] {
  const out: T[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (
      prev &&
      m.role === 'assistant' &&
      prev.role === 'assistant' &&
      (m.kind || 'chat') === 'chat' &&
      (prev.kind || 'chat') === 'chat' &&
      String(m.content || '').trim() === String(prev.content || '').trim() &&
      Math.abs((m.at || 0) - (prev.at || 0)) < 180_000
    ) {
      continue;
    }
    out.push(m);
  }
  return out;
}

/**
 * 짧은 시간창 안 같은 assistant 문구 중복 제거 (앞쪽 유지).
 * 새로고침 이중 배달의 A B B A → A B.
 */
export function dedupeRecentAssistantDuplicates<
  T extends { role?: string; kind?: string; content?: string; at?: number },
>(messages: T[], windowMs = 180_000): T[] {
  const out: T[] = [];
  for (const m of messages) {
    if (m.role === 'assistant' && (m.kind || 'chat') === 'chat') {
      const content = String(m.content || '').trim();
      if (content) {
        const dup = out.some((p) => {
          if (p.role !== 'assistant' || (p.kind || 'chat') !== 'chat') return false;
          if (Math.abs((m.at || 0) - (p.at || 0)) >= windowMs) return false;
          const prev = String(p.content || '').trim();
          return prev === content || areNearDuplicateLines(prev, content);
        });
        if (dup) continue;
      }
    }
    out.push(m);
  }
  return out;
}

/** 응답 messages 배열 안 인접 중복 문구 제거 */
export function dedupeAdjacentTextLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    if (out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out;
}

/** 기한이 된 pending만 스레드에 반영 (I/O 없음). 크론·클라이언트 공용. */
export function applyDuePendingBehavior(
  thread: OcChatThread,
  opts?: { character?: Pick<OcCharacter, 'chatbot'>; now?: number },
): { thread: OcChatThread; added: number } | null {
  const now = opts?.now ?? Date.now();
  const pending = thread.pendingBehavior;
  if (!pending || pending.applyAt > now) return null;

  const today = todayKeyLocal();
  const action = pending.action;
  const pendingClearedAt = Math.max(
    thread.pendingClearedAt || 0,
    typeof pending.createdAt === 'number' && pending.createdAt > 0
      ? pending.createdAt
      : now,
  );

  if (action === 'ignore') {
    return {
      added: 0,
      thread: {
        ...thread,
        pendingBehavior: undefined,
        pendingClearedAt,
        moodNote: pending.moodNote || thread.moodNote,
        moodDate: pending.moodNote ? today : thread.moodDate,
        presence: pending.presenceState || thread.presence,
        presenceUpdatedAt: now,
        recentActions: appendRecentAction(thread.recentActions, {
          at: now,
          action: 'ignore',
          presence:
            pending.presenceState === 'online' || pending.presenceState === 'offline'
              ? pending.presenceState
              : thread.presence === 'online'
                ? 'online'
                : 'offline',
          note: pending.moodNote,
        }),
        updatedAt: now,
        lastSeenAt: thread.lastSeenAt,
      },
    };
  }

  let msgs = thread.messages;
  const throughAt =
    typeof pending.createdAt === 'number' ? pending.createdAt : undefined;

  /*
   * pending 생성 이후에 붙은 유저 말은 이번 답장 대상이 아님.
   * 읽음 스킵만 하면 답장 앞에 남아 "1"이 고착되고 trailing flush도 안 돈다
   * → 답장 뒤로 빼서 미읽음 유지 + 후속 응답 대상으로.
   */
  let lateAfterPending: OcChatMessage[] = [];
  if (
    throughAt != null &&
    (action === 'read_only' || action === 'respond' || action === 'end_for_today')
  ) {
    const head: OcChatMessage[] = [];
    const late: OcChatMessage[] = [];
    for (const m of msgs) {
      if (m.role === 'user' && (m.kind || 'chat') !== 'narration' && m.at > throughAt) {
        late.push(m);
      } else {
        head.push(m);
      }
    }
    msgs = head;
    lateAfterPending = late;
  }

  if (action === 'read_only' || action === 'respond' || action === 'end_for_today') {
    msgs = markUserMessagesRead(msgs, now);
  }

  if (action === 'read_only') {
    msgs = lateAfterPending.length ? [...msgs, ...lateAfterPending] : msgs;
    return {
      added: 0,
      thread: {
        ...thread,
        messages: msgs,
        pendingBehavior: undefined,
        pendingClearedAt,
        moodNote: pending.moodNote || thread.moodNote,
        moodDate: pending.moodNote ? today : thread.moodDate,
        presence: 'online',
        presenceUpdatedAt: now,
        recentActions: appendRecentAction(thread.recentActions, {
          at: now,
          action: 'read_only',
          presence: 'online',
          note: pending.moodNote,
        }),
        updatedAt: now,
        lastSeenAt: thread.lastSeenAt,
      },
    };
  }

  const lines = collapseSameIntentShortBubbles(
    (pending.messages || []).filter(
      (line) => line.trim() && !looksLikeBehaviorDump(line),
    ),
  );
  const sticker = resolveSticker(opts?.character?.chatbot, pending.sticker || null);
  let added = 0;
  const recentAsstText = msgs
    .filter((m) => m.role === 'assistant' && (m.kind || 'chat') === 'chat')
    .map((m) => m.content)
    .slice(-8);

  /* 이미 UI/다른 경로가 같은 대사를 붙였으면 또 붙이지 않음 */
  const alreadyDelivered = pendingLinesAlreadyPresent(msgs, lines, Boolean(sticker));
  if (!alreadyDelivered) {
    let t = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (recentAsstText.some((prev) => areNearDuplicateLines(prev, line))) {
        console.info('[oc-chat] skip near-dup pending line', { line: line.slice(0, 60) });
        continue;
      }
      /* at을 1ms씩 벌려 배열 순서 = 시간 순서 (동일 ms + id 정렬 뒤집힘 방지) */
      msgs = [
        ...msgs,
        createChatMessage('assistant', line, 'chat', { at: now + t }),
      ];
      recentAsstText.push(line);
      added += 1;
      t += 1;
    }
    if (sticker && added > 0) {
      msgs = [
        ...msgs,
        createChatMessage('assistant', '스티커', 'sticker', {
          stickerUrl: sticker.imageUrl,
          stickerId: sticker.id,
          at: now + t,
        }),
      ];
      added += 1;
    } else if (sticker && added === 0 && !alreadyDelivered) {
      /* 대사만 중복이고 스티커는 아직 없으면 스티커만 */
      const hasSticker = msgs.some(
        (m) => m.role === 'assistant' && (m.kind || 'chat') === 'sticker',
      );
      if (!hasSticker) {
        msgs = [
          ...msgs,
          createChatMessage('assistant', '스티커', 'sticker', {
            stickerUrl: sticker.imageUrl,
            stickerId: sticker.id,
            at: now,
          }),
        ];
        added += 1;
      }
    }
  }

  /* 답장까지 반영된 유저 말 읽음 확정 + 연타분은 답장 뒤로 */
  msgs = markUserMessagesReadThroughLastAssistant(msgs, now);
  if (lateAfterPending.length) {
    msgs = [...msgs, ...lateAfterPending];
  }

  return {
    added,
    thread: {
      ...thread,
      messages: trimChatMessages(msgs),
      pendingBehavior: undefined,
      pendingClearedAt,
      moodNote: pending.moodNote || thread.moodNote,
      moodDate: pending.moodNote ? today : thread.moodDate,
      presence: 'online',
      presenceUpdatedAt: now,
      closedForToday: action === 'end_for_today' ? true : isChatClosedNow(thread.closedUntil),
      closedDate: undefined,
      closedUntil:
        action === 'end_for_today'
          ? nextClosedUntil()
          : isChatClosedNow(thread.closedUntil)
            ? thread.closedUntil
            : undefined,
      recentActions: appendRecentAction(thread.recentActions, {
        at: now,
        action,
        presence: 'online',
        note: pending.moodNote,
      }),
      updatedAt: now,
      lastSeenAt: thread.lastSeenAt,
      lastInteractionAt: now,
    },
  };
}

export function lastMessageAt(messages: OcChatMessage[]): number | undefined {
  if (!messages.length) return undefined;
  return messages[messages.length - 1]?.at;
}

export type OcChatApiResult = {
  behavior: OcChatBehavior;
  affection: number;
  affinityDelta: number;
  freeGainToday: number;
  freeLossToday: number;
  freeGainDate: string;
  deltaReason?: string;
  memorySummary?: string;
  memorySummaryThroughAt?: number;
};

export type OcChatProactiveResult = {
  reachOut: boolean;
  messages: string[];
  moodNote?: string;
  delay: OcChatDelayKind;
};

function parseOcChatApiErrorField(rawBody: string): string | null {
  const trimmed = rawBody.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === 'object') {
      const err = (parsed as { error?: unknown }).error;
      if (typeof err === 'string' && err.trim()) return err.trim();
    }
  } catch {
    return null;
  }
  return null;
}

function isLiteralEdgeRequestNotAllowed(rawBody: string): boolean {
  return /^request not allowed\.?$/i.test(rawBody.trim());
}

function looksLikeCloudflareBlock(status: number, rawBody: string): boolean {
  if (status === 502) return false;
  const body = rawBody.trim();
  if (!body) return false;
  if (parseOcChatApiErrorField(body) != null) return false;
  if (body.startsWith('{') || body.startsWith('[')) {
    try {
      JSON.parse(body);
      return false;
    } catch {
      /* non-JSON payload */
    }
  }
  if (isLiteralEdgeRequestNotAllowed(body)) return true;
  return (
    /just a moment/i.test(body) ||
    /cf-browser-verification/i.test(body) ||
    /cdn-cgi\/challenge/i.test(body) ||
    /checking your browser/i.test(body)
  );
}

function ocChatHttpErrorMessage(status: number, rawBody: string): string {
  const apiError = parseOcChatApiErrorField(rawBody);
  if (apiError) {
    if (/API_KEY|키가 없/i.test(apiError)) {
      return '채팅 API 키가 설정되지 않았습니다. 배포 환경 시크릿을 확인해 주세요.';
    }
    if (status === 503 || /UNAVAILABLE|overloaded|high demand/i.test(apiError)) {
      return `서버가 잠시 바쁩니다. 잠시 후 다시 보내 주세요. (${status})`;
    }
    return status >= 500 ? `서버 오류: ${apiError}` : apiError;
  }
  const trimmed = rawBody.trim();
  /* 엣지 plain text — 보안망 단정하지 말고 원문 표시 */
  if (/^request not allowed\.?$/i.test(trimmed)) {
    return `서버가 요청을 거절했습니다 (Request not allowed, ${status}). 새로고침 후 다시 시도해 주세요.`;
  }
  if (looksLikeCloudflareBlock(status, rawBody)) {
    return `브라우저 보안 확인이 가로막았습니다 (${status}). 일반 창에서 새로고침 후 다시 시도해 주세요.`;
  }
  if (status === 503) {
    return '서버가 잠시 바쁩니다. 잠시 후 다시 보내 주세요. (503)';
  }
  if (status === 429) {
    return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
  }
  const snippet = trimmed.slice(0, 160);
  if (snippet && !snippet.startsWith('<')) {
    return `${snippet}${rawBody.length > 160 ? '…' : ''} (${status})`;
  }
  return `채팅 요청 실패 (${status})`;
}

function parseOcChatJsonBody<T extends object>(rawBody: string, status: number): T {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    throw new Error(ocChatHttpErrorMessage(status, rawBody));
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(ocChatHttpErrorMessage(status, rawBody));
  }
}

export async function postOcChat(params: {
  characterId: string;
  visitorId: string;
  messages: OcChatMessage[];
  affection: number;
  freeGainToday: number;
  freeLossToday?: number;
  moodNote?: string;
  turnsToday?: number;
  hoursSinceLast?: number;
  closedForToday?: boolean;
  recentDeltaReasons?: string[];
  presence?: 'online' | 'offline';
  recentActions?: OcChatThread['recentActions'];
  memorySummary?: string;
  memorySummaryThroughAt?: number;
  signal?: AbortSignal;
}): Promise<OcChatApiResult> {
  type OcChatPostJson = {
    behavior?: OcChatBehavior;
    reply?: string;
    affinityDelta?: number;
    affection?: number;
    freeGainToday?: number;
    freeLossToday?: number;
    freeGainDate?: string;
    deltaReason?: string;
    memorySummary?: string;
    memorySummaryThroughAt?: number;
    error?: string;
  };

  const recent = params.messages
    .filter((m) => m.kind === 'chat' || m.kind === 'choice' || m.kind === 'sticker' || !m.kind)
    .slice(-OC_CHAT_API_HISTORY)
    .map((m) => ({
      role: m.role,
      content:
        m.content?.trim() ||
        (m.kind === 'sticker'
          ? m.stickerId
            ? `(스티커:${m.stickerId})`
            : '(스티커)'
          : ''),
      at: m.at,
      kind: m.kind,
      stickerId: m.stickerId,
      stickerUrl: m.stickerUrl,
    }))
    .filter((m) => m.content);

  const body = {
    mode: 'chat' as const,
    characterId: params.characterId,
    visitorId: params.visitorId,
    messages: recent,
    affection: params.affection,
    freeGainToday: params.freeGainToday,
    freeLossToday: params.freeLossToday,
    moodNote: params.moodNote,
    turnsToday: params.turnsToday,
    hoursSinceLast: params.hoursSinceLast,
    closedForToday: params.closedForToday,
    recentDeltaReasons: params.recentDeltaReasons,
    presence: params.presence,
    recentActions: resolveRecentActionsForPrompt(
      params.recentActions as OcChatRecentAction[] | undefined,
      params.messages,
    ),
    memorySummary: params.memorySummary,
    memorySummaryThroughAt: params.memorySummaryThroughAt,
  };

  const runOnce = async (): Promise<OcChatApiResult> => {
    const res = await fetch('/api/oc-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: params.signal,
    });
    const rawBody = await res.text();
    if (!res.ok) {
      throw new Error(ocChatHttpErrorMessage(res.status, rawBody));
    }
    const data = parseOcChatJsonBody<OcChatPostJson>(rawBody, res.status);
    const behavior =
      data.behavior ||
      parseOcChatBehavior('', data.reply || '');
    if (
      behavior.action === 'respond' ||
      behavior.action === 'end_for_today'
    ) {
      if (!behavior.messages.length && data.reply) {
        behavior.messages = [String(data.reply).trim()].filter(Boolean);
      }
    }
    return {
      behavior,
      affinityDelta:
        typeof data.affinityDelta === 'number' ? data.affinityDelta : behavior.affinityDelta,
      affection: clampAffection(
        typeof data.affection === 'number' ? data.affection : params.affection,
      ),
      freeGainToday:
        typeof data.freeGainToday === 'number' ? data.freeGainToday : params.freeGainToday,
      freeLossToday:
        typeof data.freeLossToday === 'number'
          ? data.freeLossToday
          : params.freeLossToday || 0,
      freeGainDate: String(data.freeGainDate || todayKeyLocal()),
      deltaReason: data.deltaReason || behavior.deltaReason,
      memorySummary:
        typeof data.memorySummary === 'string' && data.memorySummary.trim()
          ? data.memorySummary.trim().slice(0, 800)
          : params.memorySummary,
      memorySummaryThroughAt:
        typeof data.memorySummaryThroughAt === 'number' &&
        Number.isFinite(data.memorySummaryThroughAt)
          ? data.memorySummaryThroughAt
          : params.memorySummaryThroughAt,
    };
  };

  try {
    return await runOnce();
  } catch (err) {
    if (params.signal?.aborted) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    const retryable = /\(50[023]\)|\(429\)|서버 오류|Request not allowed|가로막|UNAVAILABLE|overloaded|잠시/i.test(
      msg,
    );
    if (!retryable) throw err;
    await sleepMs(650);
    if (params.signal?.aborted) throw err;
    return await runOnce();
  }
}

export async function postOcChatProactive(params: {
  characterId: string;
  visitorId: string;
  messages: OcChatMessage[];
  affection: number;
  moodNote?: string;
  hoursSinceLast?: number;
}): Promise<OcChatProactiveResult> {
  const recent = params.messages
    .filter((m) => m.kind === 'chat' || m.kind === 'choice' || m.kind === 'sticker' || !m.kind)
    .slice(-OC_CHAT_API_HISTORY)
    .map((m) => ({
      role: m.role,
      content:
        m.content?.trim() ||
        (m.kind === 'sticker'
          ? m.stickerId
            ? `(스티커:${m.stickerId})`
            : '(스티커)'
          : ''),
      at: m.at,
      kind: m.kind,
      stickerId: m.stickerId,
      stickerUrl: m.stickerUrl,
    }))
    .filter((m) => m.content);
  const res = await fetch('/api/oc-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'proactive',
      characterId: params.characterId,
      visitorId: params.visitorId,
      messages: recent,
      affection: params.affection,
      moodNote: params.moodNote,
      hoursSinceLast: params.hoursSinceLast,
    }),
  });
  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(ocChatHttpErrorMessage(res.status, rawBody));
  }
  const data = parseOcChatJsonBody<OcChatProactiveResult & { error?: string }>(
    rawBody,
    res.status,
  );
  if (data.reachOut != null) {
    return {
      reachOut: Boolean(data.reachOut) && (data.messages || []).length > 0,
      messages: Array.isArray(data.messages) ? data.messages.map(String).filter(Boolean) : [],
      moodNote: data.moodNote,
      delay: data.delay || 'short',
    };
  }
  return parseOcChatProactive(JSON.stringify(data));
}

/** 답장 예약 시각 — presence 전환 + responseDelay */
export function computePendingApplyAt(
  behavior: OcChatBehavior,
  wasOffline: boolean,
  now = Date.now(),
): number {
  if (behavior.delay === 'next_day') return nextLocalMidnightMs(now);
  const willOnline =
    behavior.presenceState !== 'offline' &&
    (behavior.action === 'respond' ||
      behavior.action === 'end_for_today' ||
      behavior.action === 'read_only' ||
      (behavior.action === 'ignore' && behavior.presenceState === 'online'));
  let ms = 0;
  if (wasOffline && willOnline) ms += presenceComeOnlineMs();
  ms +=
    resolveResponseDelaySeconds({
      aiSeconds: behavior.responseDelaySeconds,
      delayKind: behavior.delay,
      wasOffline,
    }) * 1000;
  return now + Math.max(400, ms);
}

export function behaviorToPending(
  behavior: OcChatBehavior,
  applyAt: number,
): OcChatPendingBehavior {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    applyAt,
    createdAt: Date.now(),
    action: behavior.action,
    messages: collapseSameIntentShortBubbles(
      dedupeAdjacentTextLines(
        behavior.messages.filter((m) => m.trim() && !looksLikeBehaviorDump(m)),
      ),
    ),
    moodNote: behavior.moodNote,
    affinityDelta: behavior.affinityDelta,
    presenceState: behavior.presenceState,
    responseDelaySeconds: behavior.responseDelaySeconds,
    typingIndicatorEvents: behavior.typingIndicatorEvents,
    sticker: behavior.sticker,
  };
}

/**
 * 기한이 된 pendingBehavior를 스레드에 배달 (lastSeenAt 유지 → 미읽음 배지).
 * 창이 닫혀 있어도 동작. @returns 추가된 말풍선 수
 */
export async function tryDeliverPendingChat(params: {
  characterId: string;
  visitorId: string;
  character?: Pick<OcCharacter, 'chatbot'>;
  /** 예약 당시 id — 취소·교체된 옛 타이머는 무시 */
  expectPendingId?: string;
  /** UI 핸드오프(창 닫힘 등) — uiOwned여도 배달 */
  force?: boolean;
}): Promise<number> {
  const key = pendingDeliveryKey(params.characterId, params.visitorId);
  if (!params.force && uiOwnedPendingKeys.has(key)) return 0;

  const existing = pendingDeliveryInflight.get(key);
  if (existing) return existing;

  const run = (async () => {
    const matchesExpect = (pending: OcChatPendingBehavior | undefined) => {
      if (!pending) return false;
      if (params.expectPendingId && pending.id && pending.id !== params.expectPendingId) {
        return false;
      }
      return (pending.applyAt || 0) <= Date.now();
    };

    /*
     * 캐시만으로 먼저 배달하면, 직전 전송이 아직 캐시에 안 붙은 유저 말을
     * 빠뜨린 채 저장할 수 있다. 항상 remote+최신 캐시를 합친 뒤 배달.
     */
    const remote = await loadOcChatThread(params.characterId, params.visitorId);
    const thread = mergeOcChatThreads(
      peekOcChatThreadCache(params.characterId, params.visitorId),
      remote,
    );
    if (!matchesExpect(thread.pendingBehavior)) return 0;

    /* load 중에 또 유저 말이 붙었으면 한 번 더 합침 */
    const latest = mergeOcChatThreads(
      peekOcChatThreadCache(params.characterId, params.visitorId),
      thread,
    );
    if (!matchesExpect(latest.pendingBehavior)) return 0;

    const result = applyDuePendingBehavior(latest, { character: params.character });
    if (!result) return 0;
    const msgs = dedupeRecentAssistantDuplicates(
      dedupeAdjacentAssistantMessages(result.thread.messages),
    );
    await saveOcChatThread(params.characterId, params.visitorId, {
      ...result.thread,
      messages: msgs,
    });
    return result.added;
  })();

  pendingDeliveryInflight.set(key, run);
  try {
    return await run;
  } finally {
    if (pendingDeliveryInflight.get(key) === run) {
      pendingDeliveryInflight.delete(key);
    }
  }
}

/**
 * 호감 임계 + 유휴 시 선톡 시도. 성공하면 스레드에 메시지 append (미읽음).
 * @returns 추가된 메시지 수
 */
export async function tryDeliverProactiveChat(params: {
  characterId: string;
  visitorId: string;
  character: Pick<OcCharacter, 'chatbot'>;
}): Promise<number> {
  const thread = await loadOcChatThread(params.characterId, params.visitorId);
  if (needsStoryMode(params.character, thread.story?.completedEpisodeIds)) return 0;
  if (thread.affection < PROACTIVE_AFFECTION_MIN) return 0;
  if (thread.closedForToday) return 0;
  if (thread.lastProactiveDate === todayKeyLocal()) return 0;
  if (thread.pendingBehavior) return 0;

  const lastAt = lastMessageAt(thread.messages);
  if (!lastAt || Date.now() - lastAt < PROACTIVE_IDLE_MS) return 0;
  if (!thread.messages.some((m) => m.role === 'user')) return 0;

  const today = todayKeyLocal();
  /* 하루 1회 시도 기회 — 구간별 확률로 실제 발송 여부 결정 */
  if (!rollProactiveSend(thread.affection)) {
    await saveOcChatThread(params.characterId, params.visitorId, {
      ...thread,
      lastProactiveDate: today,
      updatedAt: Date.now(),
    });
    return 0;
  }

  const decision = await postOcChatProactive({
    characterId: params.characterId,
    visitorId: params.visitorId,
    messages: thread.messages,
    affection: thread.affection,
    moodNote: thread.moodNote,
    hoursSinceLast: hoursSince(lastAt),
  });

  if (!decision.reachOut || !decision.messages.length) {
    await saveOcChatThread(params.characterId, params.visitorId, {
      ...thread,
      lastProactiveDate: today,
      updatedAt: Date.now(),
    });
    return 0;
  }

  await sleepMs(delayKindToMs(decision.delay));
  let msgs = thread.messages;
  const baseAt = Date.now();
  for (let i = 0; i < decision.messages.length; i++) {
    if (i > 0) await sleepMs(splitBubbleGapMs());
    msgs = [
      ...msgs,
      createChatMessage('assistant', decision.messages[i]!, 'chat', {
        at: baseAt + i * 1000,
      }),
    ];
  }
  await saveOcChatThread(params.characterId, params.visitorId, {
    ...thread,
    messages: msgs,
    moodNote: decision.moodNote || thread.moodNote,
    moodDate: today,
    lastProactiveDate: today,
    updatedAt: Date.now(),
    lastSeenAt: thread.lastSeenAt,
  });
  return decision.messages.length;
}

