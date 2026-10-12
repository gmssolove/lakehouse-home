import { fetchSiteFaviconBytes } from '@/lib/lake/siteFaviconServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    const bytes = await fetchSiteFaviconBytes();
    if (!bytes) {
      return NextResponse.redirect(new URL('/favicon.svg', origin), 302);
    }
    return new NextResponse(bytes.body, {
      headers: {
        'Content-Type': bytes.contentType,
        'Cache-Control': CACHE,
      },
    });
  } catch {
    return NextResponse.redirect(new URL('/favicon.svg', origin), 302);
  }
}
