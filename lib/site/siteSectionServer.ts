/** Server-only: Firebase RTDB site section fetch with timeout + slim list for cache API */

import {
  isSiteSectionId,
  SITE_SECTION_CACHE_TTL_SEC,
  SITE_SECTION_DEFAULT_LIMIT,
  type SiteSectionId,
} from '@/lib/site/siteSectionMeta';

export {
  isSiteSectionId,
  SITE_SECTION_CACHE_TTL_SEC,
  SITE_SECTION_DEFAULT_LIMIT,
  SITE_SECTION_IDS,
  type SiteSectionId,
} from '@/lib/site/siteSectionMeta';

const RTDB_BASE =
  'https://llikebread-default-rtdb.asia-southeast1.firebasedatabase.app';

const HEAVY_LIST: ReadonlySet<SiteSectionId> = new Set([
  'notices',
  'diary',
  'gallery',
  'scrap',
  'reviews',
  'quotes',
  'timeline',
  'trpg',
  'music_tracks',
  'char_archive',
]);

function rtdbAuthQuery(): string {
  const secret = (process.env.FIREBASE_DATABASE_SECRET || '').trim();
  return secret ? `auth=${encodeURIComponent(secret)}` : '';
}

function normalizeArray(raw: unknown): unknown {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    const keys = Object.keys(raw as object);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (raw as Record<string, unknown>)[k]);
    }
  }
  return raw;
}

/** TRPG 시나리오에서 VN/로그 본문 제거 — 목록·캐시용 */
export function slimSiteSectionData(section: SiteSectionId, data: unknown): unknown {
  if (section !== 'trpg') return data;
  const list = normalizeArray(data);
  if (!Array.isArray(list)) return data;
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const row = item as Record<string, unknown>;
    const { vnScene, vnEditable, logs, ...rest } = row;
    return {
      ...rest,
      hasVn: Boolean(vnScene),
      logCount: Array.isArray(logs) ? logs.length : 0,
    };
  });
}

export type FetchSiteSectionOptions = {
  limit?: number;
  /** ms, default 5000 */
  timeoutMs?: number;
  slim?: boolean;
};

export async function fetchSiteSectionServer(
  section: SiteSectionId,
  opts: FetchSiteSectionOptions = {},
): Promise<{ data: unknown; timedOut: boolean; fromLimit: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const defaultLimit = SITE_SECTION_DEFAULT_LIMIT[section];
  const limit =
    opts.limit != null
      ? Math.min(200, Math.max(1, opts.limit))
      : defaultLimit ?? null;
  const useLimit = limit != null && HEAVY_LIST.has(section);

  const auth = rtdbAuthQuery();
  const qs: string[] = [];
  if (useLimit) {
    qs.push('orderBy=%22%24key%22', `limitToLast=${limit}`);
  }
  if (auth) qs.push(auth);
  const q = qs.length ? `?${qs.join('&')}` : '';
  const url = `${RTDB_BASE}/lhdata/site/${section}.json${q}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      next: { revalidate: SITE_SECTION_CACHE_TTL_SEC },
    });
    if (!res.ok) {
      throw new Error(`site section ${section} fetch ${res.status}`);
    }
    let data = normalizeArray(await res.json());
    if (opts.slim !== false) {
      data = slimSiteSectionData(section, data);
    }
    return { data, timedOut: false, fromLimit: useLimit };
  } catch (err) {
    const timedOut =
      (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'));
    if (timedOut) {
      return { data: null, timedOut: true, fromLimit: useLimit };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
