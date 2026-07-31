import { AwsClient } from 'aws4fetch';
import { mergeOcChatThreads, normalizeChatThread, type OcChatThread } from '@/lib/oc/ocChat';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';

const PREFIX = 'oc-chat-threads';

let awsClient: AwsClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getAwsClient(): AwsClient {
  if (awsClient) return awsClient;
  awsClient = new AwsClient({
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  });
  return awsClient;
}

function objectUrl(key: string): string {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const bucket = requireEnv('R2_BUCKET_NAME');
  const path = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`;
}

function threadKey(characterId: string, visitorId: string): string {
  return `${PREFIX}/${encodeURIComponent(characterId)}/${encodeURIComponent(visitorId)}.json`;
}

function listUrl(continuationToken?: string): string {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const bucket = requireEnv('R2_BUCKET_NAME');
  const qs = new URLSearchParams({ 'list-type': '2', prefix: `${PREFIX}/` });
  if (continuationToken) qs.set('continuation-token', continuationToken);
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}?${qs}`;
}

export async function loadOcChatThreadFromR2(
  characterId: string,
  visitorId: string,
): Promise<OcChatThread | null> {
  const res = await getAwsClient().fetch(objectUrl(threadKey(characterId, visitorId)));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 get failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  if (!text.trim()) return null;
  return normalizeChatThread(JSON.parse(text));
}

export async function saveOcChatThreadToR2(
  characterId: string,
  visitorId: string,
  thread: OcChatThread,
  opts?: { replace?: boolean },
): Promise<void> {
  let toSave = thread;
  if (!opts?.replace) {
    try {
      const existing = await loadOcChatThreadFromR2(characterId, visitorId);
      if (existing) toSave = mergeOcChatThreads(existing, thread);
    } catch {
      /* 기존 없음/읽기 실패 시 그대로 저장 */
    }
  }
  const payload = stripUndefinedDeep({
    messages: toSave.messages,
    updatedAt: Math.max(toSave.updatedAt ?? 0, Date.now()),
    affection: toSave.affection ?? 0,
    story: toSave.story,
    freeGainDate: toSave.freeGainDate,
    freeGainToday: toSave.freeGainToday,
    freeLossToday: toSave.freeLossToday,
    lastSeenAt: toSave.lastSeenAt,
    moodNote: toSave.moodNote,
    moodDate: toSave.moodDate,
    turnsToday: toSave.turnsToday,
    turnsDate: toSave.turnsDate,
    closedForToday: toSave.closedForToday,
    closedDate: toSave.closedDate,
    closedUntil: toSave.closedUntil,
    lastProactiveDate: toSave.lastProactiveDate,
    pendingBehavior: toSave.pendingBehavior,
    recentDeltaReasons: toSave.recentDeltaReasons,
    lastInteractionAt: toSave.lastInteractionAt,
    neglectCheckedAt: toSave.neglectCheckedAt,
    presence: toSave.presence,
    presenceUpdatedAt: toSave.presenceUpdatedAt,
    recentActions: toSave.recentActions,
    openThreads: toSave.openThreads,
  });
  const body = JSON.stringify(payload);
  const res = await getAwsClient().fetch(objectUrl(threadKey(characterId, visitorId)), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  });
  if (!res.ok) throw new Error(`R2 put failed: ${res.status} ${await res.text()}`);
}

export async function deleteOcChatThreadFromR2(
  characterId: string,
  visitorId: string,
): Promise<void> {
  const res = await getAwsClient().fetch(objectUrl(threadKey(characterId, visitorId)), {
    method: 'DELETE',
  });
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`R2 delete failed: ${res.status} ${await res.text()}`);
}

function parseListKeys(xml: string): { keys: string[]; nextToken?: string; truncated: boolean } {
  const keys: string[] = [];
  const keyRe = /<Key>([^<]+)<\/Key>/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(xml))) {
    keys.push(m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml);
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return {
    keys,
    truncated,
    nextToken: tokenMatch?.[1],
  };
}

export async function listOcChatThreadsFromR2(): Promise<
  Array<{ characterId: string; visitorId: string; thread: OcChatThread }>
> {
  const client = getAwsClient();
  const out: Array<{ characterId: string; visitorId: string; thread: OcChatThread }> = [];
  let token: string | undefined;
  do {
    const res = await client.fetch(listUrl(token));
    if (!res.ok) throw new Error(`R2 list failed: ${res.status} ${await res.text()}`);
    const xml = await res.text();
    const page = parseListKeys(xml);
    for (const key of page.keys) {
      const match = key.match(/^oc-chat-threads\/([^/]+)\/([^/]+)\.json$/);
      if (!match) continue;
      const characterId = decodeURIComponent(match[1]!);
      const visitorId = decodeURIComponent(match[2]!);
      try {
        const thread = await loadOcChatThreadFromR2(characterId, visitorId);
        if (thread) out.push({ characterId, visitorId, thread });
      } catch {
        /* skip bad object */
      }
    }
    token = page.truncated ? page.nextToken : undefined;
  } while (token);
  return out;
}

/** Firebase·R2 중 더 최신(updatedAt) 스레드를 고른다. */
export function isBlankOcChatThread(t: OcChatThread | null | undefined): boolean {
  if (!t) return true;
  return (
    !(t.messages && t.messages.length) &&
    !t.pendingBehavior &&
    !t.story &&
    !(typeof t.affection === 'number' && t.affection > 0) &&
    !t.lastSeenAt &&
    !t.lastInteractionAt
  );
}

export function pickNewerThread(a: OcChatThread | null, b: OcChatThread | null): OcChatThread {
  return mergeOcChatThreads(a, b);
}
