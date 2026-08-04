import {
  PROACTIVE_AFFECTION_MIN,
  needsStoryMode,
  rollProactiveSend,
  todayKeyLocal,
} from '@/lib/oc/ocChatAffinity';
import {
  hoursSince,
  parseOcChatBehavior,
  PROACTIVE_IDLE_MS,
  type OcChatBehavior,
} from '@/lib/oc/ocChatBehavior';
import {
  applyDuePendingBehavior,
  behaviorToPending,
  computePendingApplyAt,
  createChatMessage,
  lastMessageAt,
  ocChatNeedsReplyToTrailingUsers,
  OC_CHAT_API_HISTORY,
  type OcChatThread,
} from '@/lib/oc/ocChat';
import {
  listAllOcChatThreadsServer,
  loadOcCharactersServer,
} from '@/lib/oc/ocChatRtdbServer';
import {
  listOcChatThreadsFromR2,
  pickNewerThread,
  saveOcChatThreadToR2,
} from '@/lib/oc/ocChatThreadStore';
import {
  loadOcWorldData,
  pickDailyEventsForOc,
  type OcWorldData,
} from '@/lib/oc/ocChatWorld';
import type { OcCharacter } from '@/lib/types/character';

async function listMergedOcChatThreads() {
  const [fromFb, fromR2] = await Promise.all([
    listAllOcChatThreadsServer().catch(() => []),
    listOcChatThreadsFromR2().catch(() => []),
  ]);
  const map = new Map<string, { characterId: string; visitorId: string; thread: OcChatThread }>();
  for (const ref of fromFb) {
    map.set(`${ref.characterId}/${ref.visitorId}`, ref);
  }
  for (const ref of fromR2) {
    const key = `${ref.characterId}/${ref.visitorId}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, ref);
      continue;
    }
    map.set(key, {
      characterId: ref.characterId,
      visitorId: ref.visitorId,
      thread: pickNewerThread(prev.thread, ref.thread),
    });
  }
  return [...map.values()];
}

async function persistCronThread(
  characterId: string,
  visitorId: string,
  thread: OcChatThread,
): Promise<void> {
  await saveOcChatThreadToR2(characterId, visitorId, thread);
}

export type OcChatProactiveKind = 'task' | 'emotion';

const MAX_PENDING_PER_TICK = 40;
const MAX_PROACTIVE_PER_TICK = 3;
/** API 실패·탭 닫힘으로 유저 말만 남은 스레드 복구 (채팅창 안 열어도) */
const MAX_TRAILING_REPLY_PER_TICK = 4;
/** 라이브 flush와 경합 피하려고 최소 이 시간 지난 trailing만 */
const TRAILING_REPLY_MIN_AGE_MS = 90_000;

export type OcChatCronResult = {
  pendingScanned: number;
  pendingDelivered: number;
  pendingBubbles: number;
  trailingScanned: number;
  trailingRecovered: number;
  proactiveScanned: number;
  proactiveSent: number;
  proactiveSkippedRoll: number;
  errors: string[];
};

export function resolveProactiveKind(opts: {
  thread: OcChatThread;
  character: OcCharacter;
  world: OcWorldData;
}): OcChatProactiveKind {
  const open = (opts.thread.openThreads || []).filter((t) => t.summary?.trim());
  if (open.length) return 'task';

  const relatedIds = (opts.character.relationships || [])
    .map((r) => (r.worldCharacterId || '').trim())
    .filter(Boolean);
  const todays = pickDailyEventsForOc({
    events: opts.world.dailyEvents,
    ocId: String(opts.character.id),
    relatedWorldIds: relatedIds,
  });
  if (todays.length) return 'task';
  return 'emotion';
}

function originFromRequest(reqUrl: string): string {
  try {
    return new URL(reqUrl).origin;
  } catch {
    return 'https://lakehouse.me.kr';
  }
}

function trailingUserLastAt(thread: OcChatThread): number {
  const msgs = thread.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || (m.kind || 'chat') === 'narration') continue;
    if (m.role !== 'user') break;
    if (typeof m.at === 'number' && m.at > 0) return m.at;
  }
  return lastMessageAt(msgs) || 0;
}

async function callChatReplyApi(opts: {
  origin: string;
  characterId: string;
  visitorId: string;
  thread: OcChatThread;
}): Promise<{
  behavior: OcChatBehavior;
  affection: number;
  freeGainToday: number;
  freeLossToday: number;
  freeGainDate?: string;
  deltaReason?: string;
  memorySummary?: string;
  memorySummaryThroughAt?: number;
  userMemory?: string;
  userMemoryThroughAt?: number;
}> {
  const lastAt = lastMessageAt(opts.thread.messages);
  let userPresence: unknown = undefined;
  try {
    const { loadOcUserPresenceFromR2 } = await import('@/lib/oc/ocChatUserPresenceStore');
    const { resolveOcUserPresence } = await import('@/lib/oc/ocChatUserPresence');
    userPresence = resolveOcUserPresence(await loadOcUserPresenceFromR2(opts.visitorId));
  } catch {
    userPresence = undefined;
  }
  const res = await fetch(`${opts.origin}/api/oc-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: opts.characterId,
      visitorId: opts.visitorId,
      messages: opts.thread.messages.slice(-OC_CHAT_API_HISTORY).map((m) => ({
        role: m.role,
        content: m.content,
        at: m.at,
        kind: m.kind,
        stickerId: m.stickerId,
        stickerUrl: m.stickerUrl,
      })),
      affection: opts.thread.affection,
      freeGainToday: opts.thread.freeGainToday || 0,
      freeLossToday: opts.thread.freeLossToday || 0,
      moodNote: opts.thread.moodNote,
      turnsToday: opts.thread.turnsToday || 0,
      hoursSinceLast: hoursSince(lastAt),
      closedForToday: Boolean(opts.thread.closedForToday),
      recentDeltaReasons: opts.thread.recentDeltaReasons,
      presence: opts.thread.presence,
      recentActions: opts.thread.recentActions,
      memorySummary: opts.thread.memorySummary,
      memorySummaryThroughAt: opts.thread.memorySummaryThroughAt,
      userMemory: opts.thread.userMemory,
      userMemoryThroughAt: opts.thread.userMemoryThroughAt,
      userPresence,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`chat api ${res.status}: ${text.slice(0, 220)}`);
  }
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('chat api invalid json');
  }
  const behavior = parseOcChatBehavior(JSON.stringify(data.behavior ?? data));
  return {
    behavior,
    affection:
      typeof data.affection === 'number' ? data.affection : opts.thread.affection,
    freeGainToday:
      typeof data.freeGainToday === 'number'
        ? data.freeGainToday
        : opts.thread.freeGainToday || 0,
    freeLossToday:
      typeof data.freeLossToday === 'number'
        ? data.freeLossToday
        : opts.thread.freeLossToday || 0,
    freeGainDate:
      typeof data.freeGainDate === 'string' ? data.freeGainDate : opts.thread.freeGainDate,
    deltaReason:
      typeof data.deltaReason === 'string' ? data.deltaReason : behavior.deltaReason,
    memorySummary:
      typeof data.memorySummary === 'string' ? data.memorySummary : undefined,
    memorySummaryThroughAt:
      typeof data.memorySummaryThroughAt === 'number'
        ? data.memorySummaryThroughAt
        : undefined,
    userMemory: typeof data.userMemory === 'string' ? data.userMemory : undefined,
    userMemoryThroughAt:
      typeof data.userMemoryThroughAt === 'number' ? data.userMemoryThroughAt : undefined,
  };
}

async function callProactiveApi(opts: {
  origin: string;
  characterId: string;
  visitorId: string;
  thread: OcChatThread;
  proactiveKind: OcChatProactiveKind;
}): Promise<{ reachOut: boolean; messages: string[]; moodNote?: string }> {
  const lastAt = lastMessageAt(opts.thread.messages);
  let userPresence: unknown = undefined;
  try {
    const { loadOcUserPresenceFromR2 } = await import('@/lib/oc/ocChatUserPresenceStore');
    const { resolveOcUserPresence } = await import('@/lib/oc/ocChatUserPresence');
    userPresence = resolveOcUserPresence(await loadOcUserPresenceFromR2(opts.visitorId));
  } catch {
    userPresence = undefined;
  }
  const res = await fetch(`${opts.origin}/api/oc-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'proactive',
      characterId: opts.characterId,
      visitorId: opts.visitorId,
      messages: opts.thread.messages.slice(-OC_CHAT_API_HISTORY).map((m) => ({
        role: m.role,
        content: m.content,
        at: m.at,
        kind: m.kind,
        stickerId: m.stickerId,
        stickerUrl: m.stickerUrl,
      })),
      affection: opts.thread.affection,
      moodNote: opts.thread.moodNote,
      hoursSinceLast: hoursSince(lastAt),
      proactiveKind: opts.proactiveKind,
      openThreads: opts.thread.openThreads,
      memorySummary: opts.thread.memorySummary,
      userMemory: opts.thread.userMemory,
      userPresence,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`proactive api ${res.status}: ${text.slice(0, 180)}`);
  }
  let data: {
    reachOut?: boolean;
    messages?: unknown;
    moodNote?: string;
  } = {};
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error('proactive api invalid json');
  }
  const messages = Array.isArray(data.messages)
    ? data.messages.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return {
    reachOut: Boolean(data.reachOut) && messages.length > 0,
    messages,
    moodNote: String(data.moodNote || '').trim() || undefined,
  };
}

/** Cron: deliver due pending replies, recover stuck trailing users, proactive pings */
export async function runOcChatCronTick(opts: {
  requestUrl: string;
}): Promise<OcChatCronResult> {
  const result: OcChatCronResult = {
    pendingScanned: 0,
    pendingDelivered: 0,
    pendingBubbles: 0,
    trailingScanned: 0,
    trailingRecovered: 0,
    proactiveScanned: 0,
    proactiveSent: 0,
    proactiveSkippedRoll: 0,
    errors: [],
  };

  const origin = originFromRequest(opts.requestUrl);
  const [characters, refs, world] = await Promise.all([
    loadOcCharactersServer(),
    listMergedOcChatThreads(),
    loadOcWorldData(),
  ]);
  const charById = new Map(characters.map((c) => [String(c.id), c]));
  const today = todayKeyLocal();
  const now = Date.now();

  // 1) due pendingBehavior delivery (no model call)
  for (const ref of refs) {
    if (!ref.thread.pendingBehavior) continue;
    if ((ref.thread.pendingBehavior.applyAt || 0) > now) continue;
    result.pendingScanned += 1;
    if (result.pendingDelivered >= MAX_PENDING_PER_TICK) continue;
    const character = charById.get(ref.characterId);
    try {
      const applied = applyDuePendingBehavior(ref.thread, {
        character,
        now,
      });
      if (!applied) continue;
      await persistCronThread(ref.characterId, ref.visitorId, applied.thread);
      ref.thread = applied.thread;
      result.pendingDelivered += 1;
      result.pendingBubbles += applied.added;
    } catch (e) {
      result.errors.push(
        `pending ${ref.characterId}/${ref.visitorId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 1.5) 유저 말만 남고 pending 없음 → 채팅창 안 열어도 API 재요청
  for (const ref of refs) {
    if (result.trailingRecovered >= MAX_TRAILING_REPLY_PER_TICK) break;
    const character = charById.get(ref.characterId);
    if (!character?.chatbot?.enabled) continue;
    const thread = ref.thread;
    if (needsStoryMode(character, thread.story?.completedEpisodeIds)) continue;
    if (thread.closedForToday) continue;
    if (!ocChatNeedsReplyToTrailingUsers(thread.messages, thread.pendingBehavior)) {
      continue;
    }
    const lastUserAt = trailingUserLastAt(thread);
    if (!lastUserAt || now - lastUserAt < TRAILING_REPLY_MIN_AGE_MS) continue;

    result.trailingScanned += 1;
    try {
      const reply = await callChatReplyApi({
        origin,
        characterId: ref.characterId,
        visitorId: ref.visitorId,
        thread,
      });
      if (
        !ocChatNeedsReplyToTrailingUsers(ref.thread.messages, ref.thread.pendingBehavior)
      ) {
        continue;
      }
      const wasOffline = ref.thread.presence !== 'online';
      const applyAt = computePendingApplyAt(reply.behavior, wasOffline);
      const pending = behaviorToPending(reply.behavior, applyAt);
      const reasons = [...(ref.thread.recentDeltaReasons || [])];
      if (reply.deltaReason && (reply.behavior.affinityDelta || 0) !== 0) {
        reasons.push(reply.deltaReason);
      }
      let next: OcChatThread = {
        ...ref.thread,
        updatedAt: Date.now(),
        affection: reply.affection,
        freeGainToday: reply.freeGainToday,
        freeLossToday: reply.freeLossToday,
        freeGainDate: reply.freeGainDate || ref.thread.freeGainDate || today,
        pendingBehavior: pending,
        moodNote: reply.behavior.moodNote || ref.thread.moodNote,
        recentDeltaReasons: reasons.slice(-8),
        lastInteractionAt: Date.now(),
        memorySummary: reply.memorySummary ?? ref.thread.memorySummary,
        memorySummaryThroughAt:
          reply.memorySummaryThroughAt ?? ref.thread.memorySummaryThroughAt,
        userMemory: reply.userMemory ?? ref.thread.userMemory,
        userMemoryThroughAt:
          reply.userMemoryThroughAt ?? ref.thread.userMemoryThroughAt,
      };
      if (applyAt <= Date.now()) {
        const applied = applyDuePendingBehavior(next, { character, now: Date.now() });
        if (applied) next = applied.thread;
      }
      await persistCronThread(ref.characterId, ref.visitorId, next);
      ref.thread = next;
      result.trailingRecovered += 1;
    } catch (e) {
      result.errors.push(
        `trailing ${ref.characterId}/${ref.visitorId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 2) proactive reach-out (affection + idle + once/day)
  for (const ref of refs) {
    if (result.proactiveSent >= MAX_PROACTIVE_PER_TICK) break;
    const character = charById.get(ref.characterId);
    if (!character?.chatbot?.enabled) continue;
    const thread = ref.thread;
    if (needsStoryMode(character, thread.story?.completedEpisodeIds)) continue;
    if (thread.affection < PROACTIVE_AFFECTION_MIN) continue;
    if (thread.closedForToday || thread.pendingBehavior) continue;
    if (thread.lastProactiveDate === today) continue;
    const lastAt = lastMessageAt(thread.messages);
    if (!lastAt || now - lastAt < PROACTIVE_IDLE_MS) continue;
    if (!thread.messages.some((m) => m.role === 'user')) continue;
    if (ocChatNeedsReplyToTrailingUsers(thread.messages, thread.pendingBehavior)) {
      continue;
    }

    result.proactiveScanned += 1;

    if (!rollProactiveSend(thread.affection)) {
      try {
        const next = {
          ...thread,
          lastProactiveDate: today,
          updatedAt: now,
        };
        await persistCronThread(ref.characterId, ref.visitorId, next);
        ref.thread = next;
        result.proactiveSkippedRoll += 1;
      } catch (e) {
        result.errors.push(
          `proactive-roll ${ref.characterId}/${ref.visitorId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      continue;
    }

    try {
      const kind = resolveProactiveKind({ thread, character, world });
      const decision = await callProactiveApi({
        origin,
        characterId: ref.characterId,
        visitorId: ref.visitorId,
        thread,
        proactiveKind: kind,
      });
      if (!decision.reachOut || !decision.messages.length) {
        const next = {
          ...thread,
          lastProactiveDate: today,
          updatedAt: Date.now(),
        };
        await persistCronThread(ref.characterId, ref.visitorId, next);
        ref.thread = next;
        continue;
      }
      let msgs = thread.messages;
      const baseAt = Date.now();
      for (let i = 0; i < decision.messages.length; i++) {
        const line = decision.messages[i]!;
        msgs = [
          ...msgs,
          createChatMessage('assistant', line, 'chat', { at: baseAt + i }),
        ];
      }
      const next: OcChatThread = {
        ...thread,
        messages: msgs,
        moodNote: decision.moodNote || thread.moodNote,
        moodDate: today,
        lastProactiveDate: today,
        updatedAt: Date.now(),
        lastSeenAt: thread.lastSeenAt,
        presence: 'online',
        presenceUpdatedAt: Date.now(),
      };
      await persistCronThread(ref.characterId, ref.visitorId, next);
      ref.thread = next;
      result.proactiveSent += 1;
    } catch (e) {
      result.errors.push(
        `proactive ${ref.characterId}/${ref.visitorId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
