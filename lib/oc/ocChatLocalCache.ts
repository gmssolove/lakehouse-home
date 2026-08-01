/** 클라이언트 전용 — 채팅 스레드 즉시 표시용 캐시 (메모리 + localStorage) */

const PREFIX = 'lh_oc_chat_thread_v1:';
/** 가장 길었던 스냅샷 — 짧은 덮어쓰기로 지워진 기록 복구용 (길어질 때만 갱신) */
const BACKUP_PREFIX = 'lh_oc_chat_backup_v1:';
const memory = new Map<string, unknown>();

function key(characterId: string, visitorId: string): string {
  return `${PREFIX}${characterId}::${visitorId}`;
}

function backupKey(characterId: string, visitorId: string): string {
  return `${BACKUP_PREFIX}${characterId}::${visitorId}`;
}

function messageCount(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const msgs = (raw as { messages?: unknown }).messages;
  return Array.isArray(msgs) ? msgs.length : 0;
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
  /* 더 긴 스냅샷만 백업 — 짧은 wipe가 백업을 덮지 않음 */
  try {
    const bakK = backupKey(characterId, visitorId);
    const prevRaw = localStorage.getItem(bakK);
    const prevLen = prevRaw ? messageCount(JSON.parse(prevRaw)) : 0;
    const nextLen = messageCount(thread);
    if (nextLen > prevLen) {
      localStorage.setItem(bakK, JSON.stringify(thread));
    }
  } catch {
    /* ignore backup failures */
  }
}

export function peekOcChatThreadBackupRaw(
  characterId: string,
  visitorId: string,
): unknown | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(backupKey(characterId, visitorId));
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * 같은 캐릭터의 로컬 캐시/백업 중 가장 긴 스레드.
 * visitorId가 바뀌어 새 빈 스레드가 열린 경우 복구에 사용.
 */
export function findLongestLocalThreadRawForCharacter(
  characterId: string,
): { visitorId: string; thread: unknown; source: 'cache' | 'backup' } | null {
  if (typeof window === 'undefined') return null;
  let best: { visitorId: string; thread: unknown; source: 'cache' | 'backup'; len: number } | null =
    null;
  const consider = (k: string, source: 'cache' | 'backup') => {
    const prefix = source === 'cache' ? PREFIX : BACKUP_PREFIX;
    if (!k.startsWith(prefix)) return;
    const rest = k.slice(prefix.length);
    const sep = rest.indexOf('::');
    if (sep < 0) return;
    const cid = rest.slice(0, sep);
    const vid = rest.slice(sep + 2);
    if (cid !== characterId || !vid) return;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      const thread = JSON.parse(raw) as unknown;
      const len = messageCount(thread);
      if (!best || len > best.len) {
        best = { visitorId: vid, thread, source, len };
      }
    } catch {
      /* skip */
    }
  };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(PREFIX)) consider(k, 'cache');
      else if (k.startsWith(BACKUP_PREFIX)) consider(k, 'backup');
    }
  } catch {
    return null;
  }
  if (!best || best.len <= 0) return null;
  return { visitorId: best.visitorId, thread: best.thread, source: best.source };
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
  /* 백업은 초기화 시에만 지움 — clear 호출부가 reset일 때 함께 제거 */
}

export function clearOcChatThreadBackup(characterId: string, visitorId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(backupKey(characterId, visitorId));
  } catch {
    /* ignore */
  }
}
