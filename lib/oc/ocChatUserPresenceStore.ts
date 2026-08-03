/** R2 — visitor별 유저 presence 스냅샷 */

import { AwsClient } from 'aws4fetch';
import {
  normalizeOcUserPresenceSnap,
  type OcUserPresenceSnap,
} from '@/lib/oc/ocChatUserPresence';

const PREFIX = 'oc-user-presence';

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

function presenceKey(visitorId: string): string {
  return `${PREFIX}/${encodeURIComponent(visitorId)}.json`;
}

export async function loadOcUserPresenceFromR2(
  visitorId: string,
): Promise<OcUserPresenceSnap | null> {
  const id = String(visitorId || '').trim();
  if (!id) return null;
  const res = await getAwsClient().fetch(objectUrl(presenceKey(id)));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 presence get failed: ${res.status}`);
  const text = await res.text();
  if (!text.trim()) return null;
  return normalizeOcUserPresenceSnap(JSON.parse(text));
}

export async function saveOcUserPresenceToR2(
  visitorId: string,
  snap: OcUserPresenceSnap,
): Promise<void> {
  const id = String(visitorId || '').trim();
  if (!id) return;
  const body = JSON.stringify(normalizeOcUserPresenceSnap(snap));
  const res = await getAwsClient().fetch(objectUrl(presenceKey(id)), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  });
  if (!res.ok) throw new Error(`R2 presence put failed: ${res.status}`);
}
