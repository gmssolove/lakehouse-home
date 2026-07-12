/** ISO 8601 duration (PT14M15S) → "14:15" / "1:02:03" */
export function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return '';
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
}

/** @deprecated use formatDuration */
export const formatIso8601Duration = formatDuration;

/** publishedAt → "05.22" (month.day, never HH:MM) */
export function formatYoutubeUploadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

/** Cached upload labels that look like clock times (old bug) */
export function isClockLikeLabel(value: string | undefined): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test((value || '').trim());
}

export type YoutubeVideoDetails = {
  durationLabel?: string;
  uploadLabel?: string;
  durationRaw?: string;
  publishedAt?: string;
};

export async function fetchYoutubeVideoDetails(videoId: string): Promise<YoutubeVideoDetails> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key || !videoId) {
    if (!key) console.warn('[youtube] YOUTUBE_API_KEY missing');
    return {};
  }

  const endpoint =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?id=${encodeURIComponent(videoId)}` +
    `&part=contentDetails,snippet` +
    `&key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      items?: Array<{
        contentDetails?: { duration?: string };
        snippet?: { publishedAt?: string };
      }>;
    };
    const item = data.items?.[0];
    if (!item) return {};
    const durationRaw = item.contentDetails?.duration || '';
    const publishedAt = item.snippet?.publishedAt || '';
    const durationLabel = durationRaw ? formatDuration(durationRaw) : undefined;
    const uploadLabel = publishedAt ? formatYoutubeUploadDate(publishedAt) : undefined;
    console.log('[youtube] details', { videoId, durationRaw, publishedAt, durationLabel, uploadLabel });
    return {
      durationLabel,
      uploadLabel,
      durationRaw: durationRaw || undefined,
      publishedAt: publishedAt || undefined,
    };
  } catch {
    return {};
  }
}

/** Force dark theme on Twitter oEmbed blockquote HTML */
export function forceTweetDarkTheme(html: string): string {
  return html.replace(/<blockquote\b([^>]*)>/gi, (_full, attrs: string) => {
    let a = String(attrs);
    if (/data-theme\s*=/i.test(a)) {
      a = a.replace(/data-theme\s*=\s*(["'])[\s\S]*?\1/i, 'data-theme="dark"');
      a = a.replace(/data-theme\s*=\s*[^\s"'`>]+/i, 'data-theme="dark"');
    } else {
      a += ' data-theme="dark"';
    }
    if (!/\btwitter-tweet\b/i.test(a)) {
      if (/\bclass\s*=/i.test(a)) {
        a = a.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (_m, q: string, cls: string) => {
          const next = /\btwitter-tweet\b/.test(cls) ? cls : `${cls} twitter-tweet`.trim();
          return `class=${q}${next}${q}`;
        });
      } else {
        a += ' class="twitter-tweet"';
      }
    }
    return `<blockquote${a}>`;
  });
}
