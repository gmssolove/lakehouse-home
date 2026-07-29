import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { normalizeChatThread, type OcChatThread } from '@/lib/oc/ocChat';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';

const PREFIX = 'oc-chat-threads';

let s3Client: S3Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const accountId = requireEnv('R2_ACCOUNT_ID');
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return s3Client;
}

function threadKey(characterId: string, visitorId: string): string {
  return `${PREFIX}/${encodeURIComponent(characterId)}/${encodeURIComponent(visitorId)}.json`;
}

async function bodyToString(body: unknown): Promise<string> {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (typeof (body as { transformToString?: () => Promise<string> }).transformToString === 'function') {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

export async function loadOcChatThreadFromR2(
  characterId: string,
  visitorId: string,
): Promise<OcChatThread | null> {
  try {
    const res = await getS3Client().send(
      new GetObjectCommand({
        Bucket: requireEnv('R2_BUCKET_NAME'),
        Key: threadKey(characterId, visitorId),
      }),
    );
    const text = await bodyToString(res.Body);
    if (!text.trim()) return null;
    return normalizeChatThread(JSON.parse(text));
  } catch (err) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
    const http =
      err && typeof err === 'object' && '$metadata' in err
        ? Number((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode)
        : 0;
    if (name === 'NoSuchKey' || http === 404) return null;
    throw err;
  }
}

export async function saveOcChatThreadToR2(
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
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: requireEnv('R2_BUCKET_NAME'),
      Key: threadKey(characterId, visitorId),
      Body: Buffer.from(JSON.stringify(payload), 'utf8'),
      ContentType: 'application/json; charset=utf-8',
    }),
  );
}

export async function deleteOcChatThreadFromR2(
  characterId: string,
  visitorId: string,
): Promise<void> {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: requireEnv('R2_BUCKET_NAME'),
        Key: threadKey(characterId, visitorId),
      }),
    );
  } catch (err) {
    const http =
      err && typeof err === 'object' && '$metadata' in err
        ? Number((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode)
        : 0;
    if (http === 404) return;
    throw err;
  }
}

export async function listOcChatThreadsFromR2(): Promise<
  Array<{ characterId: string; visitorId: string; thread: OcChatThread }>
> {
  const bucket = requireEnv('R2_BUCKET_NAME');
  const client = getS3Client();
  const out: Array<{ characterId: string; visitorId: string; thread: OcChatThread }> = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${PREFIX}/`,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents || []) {
      const key = obj.Key || '';
      const m = key.match(/^oc-chat-threads\/([^/]+)\/([^/]+)\.json$/);
      if (!m) continue;
      const characterId = decodeURIComponent(m[1]!);
      const visitorId = decodeURIComponent(m[2]!);
      try {
        const thread = await loadOcChatThreadFromR2(characterId, visitorId);
        if (thread) out.push({ characterId, visitorId, thread });
      } catch {
        /* skip bad object */
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
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
  const aBlank = isBlankOcChatThread(a);
  const bBlank = isBlankOcChatThread(b);
  if (aBlank && bBlank) return normalizeChatThread(null);
  if (aBlank) return b!;
  if (bBlank) return a!;
  return (b!.updatedAt || 0) > (a!.updatedAt || 0) ? b! : a!;
}
