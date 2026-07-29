import {
  PROACTIVE_AFFECTION_MIN,
  needsStoryMode,
  rollProactiveSend,
  todayKeyLocal,
} from '@/lib/oc/ocChatAffinity';
import { hoursSince, PROACTIVE_IDLE_MS } from '@/lib/oc/ocChatBehavior';
import {
  applyDuePendingBehavior,
  createChatMessage,
  lastMessageAt,
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

export type OcChatCronResult = {
  pendingScanned: number;
  pendingDelivered: number;
  pendingBubbles: number;
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
    return 'https://lakehouse.me.jp';
  }
}

async function callProactiveApi(opts: {
  origin: string;
  characterId: string;
  visitorId: string;
  thread: OcChatThread;
  proactiveKind: OcChatProactiveKind;
}): Promise<{ reachOut: boolean; messages: string[]; moodNote?: string }> {
  const lastAt = lastMessageAt(opts.thread.messages);
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

/** Cron: deliver due pending replies and proactive pings while offline */
export async function runOcChatCronTick(opts: {
  requestUrl: string;
}): Promise<OcChatCronResult> {
  const result: OcChatCronResult = {
    pendingScanned: 0,
    pendingDelivered: 0,
    pendingBubbles: 0,
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
      for (const line of decision.messages) {
        msgs = [...msgs, createChatMessage('assistant', line, 'chat')];
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
