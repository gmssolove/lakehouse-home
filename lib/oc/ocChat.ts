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
import { auth, db } from '@/lib/firebase/client';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';
import type { OcCharacter } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';

export const OC_CHAT_VISITOR_KEY = 'lh_oc_chat_visitor';
/** API/모델에 넘기는 최근 대화 말풍선 수 (~18턴 왕복). 비용 상한. */
export const OC_CHAT_API_HISTORY = 36;
export const OC_CHAT_STORE_MAX = 200;

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
): Promise<void> {
  const res = await fetch('/api/oc-chat-thread', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId, visitorId, thread }),
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

export function trimChatMessages(messages: OcChatMessage[], max = OC_CHAT_STORE_MAX): OcChatMessage[] {
  if (messages.length <= max) return messages;
  return messages.slice(messages.length - max);
}

export function createChatMessage(
  role: OcChatRole,
  content: string,
  kind: OcChatMessageKind = 'chat',
  opts?: { readAt?: number | null; stickerUrl?: string; stickerId?: string },
): OcChatMessage {
  const msg: OcChatMessage = {
    id: newId(),
    role,
    content: content.trim(),
    at: Date.now(),
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
): OcChatMessage[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== 'user' || m.readAt) return m;
    changed = true;
    return { ...m, readAt: at };
  });
  return changed ? next : messages;
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

/** 연속 메시지 모아 응답 — 대기 ms */
export const OC_CHAT_SEND_DEBOUNCE_MS = 2600;
/** API/연출 중 버스트가 커졌을 때 최대 재요청 횟수 */
export const OC_CHAT_BURST_REGATHER_MAX = 3;

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
    applyAt,
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

  return {
    messages: trimChatMessages(messages),
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
    pendingBehavior: normalizePending(o.pendingBehavior),
    recentDeltaReasons,
    lastInteractionAt,
    neglectCheckedAt,
    presence,
    presenceUpdatedAt,
    recentActions,
    openThreads,
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
      readAt: m.readAt ?? prev.readAt,
      stickerUrl: m.stickerUrl || prev.stickerUrl,
      stickerId: m.stickerId || prev.stickerId,
    });
  }
  return [...map.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));
}

function pickPendingBehavior(
  a?: OcChatPendingBehavior,
  b?: OcChatPendingBehavior,
  aMsgLen = 0,
  bMsgLen = 0,
): OcChatPendingBehavior | undefined {
  if (!a && !b) return undefined;
  if (a && !b) {
    /* b가 메시지를 더 많이 갖고 pending을 비웠으면 이미 배달된 것 */
    if (bMsgLen > aMsgLen) return undefined;
    return a;
  }
  if (!a && b) {
    if (aMsgLen > bMsgLen) return undefined;
    return b;
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
  const messages = trimChatMessages(mergeChatMessages(na.messages, nb.messages));

  return normalizeChatThread({
    ...older,
    ...newer,
    messages,
    pendingBehavior: pickPendingBehavior(
      na.pendingBehavior,
      nb.pendingBehavior,
      na.messages.length,
      nb.messages.length,
    ),
    affection: Math.max(na.affection || 0, nb.affection || 0),
    updatedAt: Math.max(na.updatedAt || 0, nb.updatedAt || 0),
    lastSeenAt: Math.max(na.lastSeenAt || 0, nb.lastSeenAt || 0) || undefined,
    lastInteractionAt:
      Math.max(na.lastInteractionAt || 0, nb.lastInteractionAt || 0) || undefined,
    freeGainToday: Math.max(na.freeGainToday || 0, nb.freeGainToday || 0),
    freeLossToday: Math.max(na.freeLossToday || 0, nb.freeLossToday || 0),
    turnsToday: Math.max(na.turnsToday || 0, nb.turnsToday || 0),
  });
}

export async function loadOcChatThread(
  characterId: string,
  visitorId: string,
): Promise<OcChatThread> {
  /* API가 R2+Firebase를 이미 병합 — 클라이언트 이중 Firebase get 생략으로 로드 지연 감소 */
  const fromApi = await loadOcChatThreadViaApi(characterId, visitorId);
  if (fromApi && !isBlankThreadForMerge(fromApi)) return fromApi;

  await auth.authStateReady().catch(() => undefined);
  try {
    const snap = await get(ref(db, threadPath(characterId, visitorId)));
    return mergeOcChatThreads(fromApi, normalizeChatThread(snap.val()));
  } catch {
    return fromApi || normalizeChatThread(null);
  }
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
): Promise<void> {
  const next: OcChatThread = {
    messages: trimChatMessages(thread.messages),
    updatedAt: Date.now(),
    affection: clampAffection(thread.affection ?? 0),
    story: thread.story,
    freeGainDate: thread.freeGainDate,
    freeGainToday: thread.freeGainToday,
    freeLossToday: thread.freeLossToday,
    lastSeenAt: thread.lastSeenAt,
    moodNote: thread.moodNote,
    moodDate: thread.moodDate,
    turnsToday: thread.turnsToday,
    turnsDate: thread.turnsDate,
    closedForToday: thread.closedForToday,
    closedDate: thread.closedDate,
    closedUntil: thread.closedUntil,
    lastProactiveDate: thread.lastProactiveDate,
    pendingBehavior: thread.pendingBehavior,
    recentDeltaReasons: thread.recentDeltaReasons,
    lastInteractionAt: thread.lastInteractionAt,
    neglectCheckedAt: thread.neglectCheckedAt,
    presence: thread.presence,
    presenceUpdatedAt: thread.presenceUpdatedAt,
    recentActions: thread.recentActions,
    openThreads: thread.openThreads,
  };

  /* 주 저장소: R2 API — 서버에서 기존 스레드와 merge */
  await saveOcChatThreadViaApi(characterId, visitorId, next);

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

  if (action === 'ignore') {
    return {
      added: 0,
      thread: {
        ...thread,
        pendingBehavior: undefined,
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
  if (action === 'read_only' || action === 'respond' || action === 'end_for_today') {
    msgs = markUserMessagesRead(msgs, now);
  }

  if (action === 'read_only') {
    return {
      added: 0,
      thread: {
        ...thread,
        messages: msgs,
        pendingBehavior: undefined,
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

  const lines = (pending.messages || []).filter(
    (line) => line.trim() && !looksLikeBehaviorDump(line),
  );
  const sticker = resolveSticker(opts?.character?.chatbot, pending.sticker || null);
  let added = 0;

  for (const line of lines) {
    msgs = [...msgs, createChatMessage('assistant', line, 'chat')];
    added += 1;
  }
  if (sticker) {
    msgs = [
      ...msgs,
      createChatMessage('assistant', '스티커', 'sticker', {
        stickerUrl: sticker.imageUrl,
        stickerId: sticker.id,
      }),
    ];
    added += 1;
  }

  return {
    added,
    thread: {
      ...thread,
      messages: trimChatMessages(msgs),
      pendingBehavior: undefined,
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
  const snippet = trimmed.slice(0, 160);
  if (snippet && !snippet.startsWith('<')) {
    return `${snippet}${rawBody.length > 160 ? '…' : ''} (${status})`;
  }
  if (status === 429) {
    return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
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
}): Promise<OcChatApiResult> {
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
      mode: 'chat',
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
    }),
  });
  const rawBody = await res.text();
  type OcChatPostJson = {
    behavior?: OcChatBehavior;
    reply?: string;
    affinityDelta?: number;
    affection?: number;
    freeGainToday?: number;
    freeLossToday?: number;
    freeGainDate?: string;
    deltaReason?: string;
    error?: string;
  };
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
    affinityDelta: typeof data.affinityDelta === 'number' ? data.affinityDelta : behavior.affinityDelta,
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
  };
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
  return {
    applyAt,
    action: behavior.action,
    messages: behavior.messages.filter((m) => m.trim() && !looksLikeBehaviorDump(m)),
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
}): Promise<number> {
  const thread = await loadOcChatThread(params.characterId, params.visitorId);
  const result = applyDuePendingBehavior(thread, { character: params.character });
  if (!result) return 0;
  await saveOcChatThread(params.characterId, params.visitorId, result.thread);
  return result.added;
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
  for (let i = 0; i < decision.messages.length; i++) {
    if (i > 0) await sleepMs(splitBubbleGapMs());
    msgs = [...msgs, createChatMessage('assistant', decision.messages[i]!, 'chat')];
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

