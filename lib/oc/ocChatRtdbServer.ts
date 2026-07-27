import {
  normalizeChatThread,
  type OcChatThread,
} from '@/lib/oc/ocChat';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';
import type { OcCharacter } from '@/lib/types/character';

const RTDB_BASE =
  'https://llikebread-default-rtdb.asia-southeast1.firebasedatabase.app';

export const RTDB_CHARS_URL = `${RTDB_BASE}/lhdata/oc_characters.json`;
export const RTDB_THREADS_URL = `${RTDB_BASE}/lhdata/oc_chat_threads.json`;

function threadUrl(characterId: string, visitorId: string): string {
  return `${RTDB_BASE}/lhdata/oc_chat_threads/${encodeURIComponent(characterId)}/${encodeURIComponent(visitorId)}.json`;
}

export type OcChatThreadRef = {
  characterId: string;
  visitorId: string;
  thread: OcChatThread;
};

function asCharacterList(raw: unknown): OcCharacter[] {
  if (Array.isArray(raw)) return raw as OcCharacter[];
  if (raw && typeof raw === 'object') {
    return Object.values(raw as Record<string, OcCharacter>);
  }
  return [];
}

export async function loadOcCharactersServer(): Promise<OcCharacter[]> {
  const res = await fetch(RTDB_CHARS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`characters fetch ${res.status}`);
  return asCharacterList(await res.json());
}

/** 전체 스레드 스캔 (개인 규모). 크론용. */
export async function listAllOcChatThreadsServer(): Promise<OcChatThreadRef[]> {
  const res = await fetch(RTDB_THREADS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`threads fetch ${res.status}`);
  const root = await res.json();
  if (!root || typeof root !== 'object') return [];
  const out: OcChatThreadRef[] = [];
  for (const [characterId, visitors] of Object.entries(root as Record<string, unknown>)) {
    if (!characterId || !visitors || typeof visitors !== 'object') continue;
    for (const [visitorId, raw] of Object.entries(visitors as Record<string, unknown>)) {
      if (!visitorId || !raw || typeof raw !== 'object') continue;
      out.push({
        characterId,
        visitorId,
        thread: normalizeChatThread(raw),
      });
    }
  }
  return out;
}

export async function saveOcChatThreadServer(
  characterId: string,
  visitorId: string,
  thread: OcChatThread,
): Promise<void> {
  const payload = stripUndefinedDeep({
    messages: thread.messages,
    updatedAt: thread.updatedAt ?? Date.now(),
    affection: thread.affection ?? 0,
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
  });
  const res = await fetch(threadUrl(characterId, visitorId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`thread save ${res.status}: ${text.slice(0, 200)}`);
  }
}
