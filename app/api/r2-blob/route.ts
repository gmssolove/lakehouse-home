import { isR2PublicUrl } from '@/lib/media/displayImageUrl';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** WebGL 텍스처용 — R2 이미지를 같은 출처로 중계해 CORS 우회 */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get('src')?.trim() || '';
  if (!src || !isR2PublicUrl(src)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 400 });
  }

  try {
    const upstream = await fetch(src, {
      headers: { Accept: 'image/*' },
      cache: 'force-cache',
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'upstream' }, { status: 502 });
    }
    const type = upstream.headers.get('content-type') || 'image/png';
    if (!type.startsWith('image/')) {
      return NextResponse.json({ error: 'not-image' }, { status: 502 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return NextResponse.json({ error: 'fetch' }, { status: 502 });
  }
}
