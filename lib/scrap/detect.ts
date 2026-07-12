import type { ScrapKind } from '@/lib/types/site-content';

export function extractYoutubeId(url: string): string | null {
  const u = url.trim();
  const m =
    u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/) ||
    u.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
  return m?.[1] || null;
}

export function isTwitterUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, '').toLowerCase();
    return host === 'twitter.com' || host === 'x.com' || host.endsWith('.twitter.com') || host.endsWith('.x.com');
  } catch {
    return /(?:twitter\.com|x\.com)\//i.test(url);
  }
}

export function isYoutubeUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, '').toLowerCase();
    return host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
  } catch {
    return /(?:youtube\.com|youtu\.be)\//i.test(url);
  }
}

export function detectScrapKind(url?: string, body?: string): ScrapKind {
  const u = (url || '').trim();
  if (!u) return 'memo';
  if (isTwitterUrl(u)) return 'twitter';
  if (isYoutubeUrl(u)) return 'youtube';
  return 'link';
}

export function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function youtubeThumb(id: string) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
