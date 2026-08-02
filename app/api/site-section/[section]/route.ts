import { NextResponse } from 'next/server';
import {
  fetchSiteSectionServer,
  isSiteSectionId,
  SITE_SECTION_CACHE_TTL_SEC,
  SITE_SECTION_DEFAULT_LIMIT,
} from '@/lib/site/siteSectionServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL = SITE_SECTION_CACHE_TTL_SEC;

function cacheControl(): string {
  return `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 4}`;
}

type CfCacheStorage = CacheStorage & { default?: Cache };

function getCachesDefault(): Cache | null {
  try {
    const store = (globalThis as unknown as { caches?: CfCacheStorage }).caches;
    return store?.default ?? null;
  } catch {
    return null;
  }
}

async function matchEdgeCache(request: Request): Promise<Response | null> {
  const cache = getCachesDefault();
  if (!cache) return null;
  try {
    return (await cache.match(request)) ?? null;
  } catch {
    return null;
  }
}

async function putEdgeCache(request: Request, response: Response): Promise<void> {
  const cache = getCachesDefault();
  if (!cache) return;
  try {
    await cache.put(request, response.clone());
  } catch {
    /* Cache API unavailable (local / some runtimes) */
  }
}

type Ctx = { params: Promise<{ section: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { section: raw } = await ctx.params;
  if (!isSiteSectionId(raw)) {
    return NextResponse.json({ error: 'unknown section' }, { status: 400 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam
    ? Number(limitParam)
    : SITE_SECTION_DEFAULT_LIMIT[raw];
  const slim = url.searchParams.get('slim') !== '0';

  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('limit', String(limit ?? ''));
  cacheUrl.searchParams.set('slim', slim ? '1' : '0');
  const cacheReq = new Request(cacheUrl.toString(), { method: 'GET' });

  const hit = await matchEdgeCache(cacheReq);
  if (hit) {
    const headers = new Headers(hit.headers);
    headers.set('X-Site-Section-Cache', 'HIT');
    return new NextResponse(hit.body, { status: hit.status, headers });
  }

  try {
    const result = await fetchSiteSectionServer(raw, {
      limit: Number.isFinite(limit) ? limit : undefined,
      timeoutMs: 5000,
      slim,
    });

    if (result.timedOut) {
      return NextResponse.json(
        { data: null, timedOut: true, section: raw },
        {
          status: 504,
          headers: {
            'Cache-Control': 'no-store',
            'X-Site-Section-Cache': 'TIMEOUT',
          },
        },
      );
    }

    const body = JSON.stringify({
      data: result.data,
      timedOut: false,
      section: raw,
      fromLimit: result.fromLimit,
    });
    const response = new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': cacheControl(),
        'X-Site-Section-Cache': 'MISS',
      },
    });
    await putEdgeCache(cacheReq, response);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    return NextResponse.json(
      { error: msg, data: null, section: raw },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
