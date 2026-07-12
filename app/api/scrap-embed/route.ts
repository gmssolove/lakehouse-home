import { NextResponse } from 'next/server';
import {
  detectScrapKind,
  extractYoutubeId,
  hostLabel,
  isTwitterUrl,
  isYoutubeUrl,
} from '@/lib/scrap/detect';
import { fetchYoutubeVideoDetails, forceTweetDarkTheme } from '@/lib/scrap/youtube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EmbedPayload = {
  kind: 'twitter' | 'youtube' | 'link' | 'memo';
  sourceUrl: string;
  author?: string;
  handle?: string;
  body?: string;
  embedHtml?: string;
  youtubeId?: string;
  youtubeTitle?: string;
  youtubeChannel?: string;
  youtubeThumbUrl?: string;
  youtubeEmbedHtml?: string;
  youtubeDuration?: string;
  youtubeUploadDate?: string;
  fallback?: boolean;
};

async function fetchTwitter(url: string): Promise<EmbedPayload> {
  const endpoint =
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}` +
    `&omit_script=true&dnt=true&theme=dark`;

  console.log('[scrap-embed] twitter oembed URL:', endpoint);

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return { kind: 'twitter', sourceUrl: url, fallback: true };
    }
    const data = (await res.json()) as {
      author_name?: string;
      author_url?: string;
      html?: string;
    };
    if (!data.html?.trim()) {
      return { kind: 'twitter', sourceUrl: url, author: data.author_name, fallback: true };
    }
    let handle: string | undefined;
    if (data.author_url) {
      const m = data.author_url.match(/(?:twitter|x)\.com\/([^/?#]+)/i);
      if (m?.[1]) handle = `@${m[1]}`;
    }
    return {
      kind: 'twitter',
      sourceUrl: url,
      author: data.author_name || 'Twitter',
      handle,
      embedHtml: forceTweetDarkTheme(data.html),
    };
  } catch {
    return { kind: 'twitter', sourceUrl: url, fallback: true };
  }
}

async function fetchYoutube(url: string): Promise<EmbedPayload> {
  const youtubeId = extractYoutubeId(url);
  if (!youtubeId) {
    return { kind: 'link', sourceUrl: url, fallback: true };
  }

  const details = await fetchYoutubeVideoDetails(youtubeId);

  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
        html?: string;
      };
      return {
        kind: 'youtube',
        sourceUrl: url,
        youtubeId,
        youtubeTitle: data.title,
        youtubeChannel: data.author_name,
        youtubeThumbUrl: data.thumbnail_url,
        youtubeEmbedHtml: data.html,
        youtubeDuration: details.durationLabel,
        youtubeUploadDate: details.uploadLabel,
      };
    }
  } catch {
    /* fall through */
  }
  return {
    kind: 'youtube',
    sourceUrl: url,
    youtubeId,
    youtubeThumbUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    youtubeDuration: details.durationLabel,
    youtubeUploadDate: details.uploadLabel,
    fallback: true,
  };
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('url')?.trim() || '';
  if (!raw) {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }

  let sourceUrl = raw;
  if (!/^https?:\/\//i.test(sourceUrl)) sourceUrl = `https://${sourceUrl}`;

  try {
    const kind = detectScrapKind(sourceUrl);
    if (kind === 'twitter' || isTwitterUrl(sourceUrl)) {
      return NextResponse.json(await fetchTwitter(sourceUrl));
    }
    if (kind === 'youtube' || isYoutubeUrl(sourceUrl)) {
      return NextResponse.json(await fetchYoutube(sourceUrl));
    }
    return NextResponse.json({
      kind: 'link' as const,
      sourceUrl,
      author: hostLabel(sourceUrl),
    });
  } catch {
    return NextResponse.json({
      kind: detectScrapKind(sourceUrl),
      sourceUrl,
      fallback: true,
    } satisfies EmbedPayload);
  }
}
