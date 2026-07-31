/** 클라이언트 전용 — 채팅 스레드 즉시 표시용 캐시 (메모리 + localStorage) */

const PREFIX = 'lh_oc_chat_thread_v1:';
const memory = new Map<string, unknown>();

function key(characterId: string, visitorId: string): string {
  return `${PREFIX}${characterId}::${visitorId}`;
}

export function peekOcChatThreadCacheRaw(
  characterId: string,
  visitorId: string,
): unknown | null {
  const k = key(characterId, visitorId);
  if (memory.has(k)) return memory.get(k) ?? null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    memory.set(k, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeOcChatThreadCacheRaw(
  characterId: string,
  visitorId: string,
  thread: unknown,
): void {
  const k = key(characterId, visitorId);
  memory.set(k, thread);
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(k, JSON.stringify(thread));
  } catch {
    /* quota / private mode */
  }
}

export function clearOcChatThreadCache(characterId: string, visitorId: string): void {
  const k = key(characterId, visitorId);
  memory.delete(k);
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
