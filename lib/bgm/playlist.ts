import type { SiteBgm } from '@/lib/types/site-content';
import type { BgmKind, BgmTrack } from '@/lib/bgm/types';

export function parseYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const embed = u.pathname.match(/^\/embed\/([^/?#]+)/);
      if (embed) return embed[1];
      const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shorts) return shorts[1];
    }
  } catch {
    /* not a URL */
  }

  const loose = raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/,
  );
  return loose?.[1] || null;
}

export function normalizeTrack(track: BgmTrack): BgmTrack {
  if (track.kind !== 'url') return track;
  const ytId = parseYoutubeId(track.id);
  if (!ytId) return track;
  return { ...track, kind: 'youtube', id: ytId };
}

export function trackFromSrc(src: {
  url?: string;
  youtubeId?: string;
  fileData?: string;
  title?: string;
  artist?: string;
  scope?: 'page' | 'character';
}): BgmTrack | null {
  const scope = src.scope || 'page';
  const title = src.title || 'BGM';
  const artist = src.artist || '';

  if (src.fileData?.trim()) {
    const raw = src.fileData.trim();
    /* 오디오 URL 칸에 YouTube 링크가 들어간 경우 */
    const ytFromFile = parseYoutubeId(raw);
    if (ytFromFile) {
      return { kind: 'youtube', id: ytFromFile, title, artist, scope };
    }
    return { kind: 'file', id: raw, title, artist, scope };
  }
  if (src.youtubeId?.trim()) {
    const raw = src.youtubeId.trim();
    const ytId = parseYoutubeId(raw) || (/^[A-Za-z0-9_-]{6,}$/.test(raw) ? raw : null);
    if (ytId) {
      return { kind: 'youtube', id: ytId, title, artist, scope };
    }
  }
  if (src.url?.trim()) {
    const ytId = parseYoutubeId(src.url);
    if (ytId) {
      return { kind: 'youtube', id: ytId, title, artist, scope };
    }
    return { kind: 'url', id: src.url.trim(), title, artist, scope };
  }
  return null;
}

export function sameTrack(a: BgmTrack | null, b: BgmTrack | null) {
  if (!a || !b) return false;
  const na = normalizeTrack(a);
  const nb = normalizeTrack(b);
  return na.kind === nb.kind && na.id === nb.id;
}

/** 메인 fileUrl/url → 플레이리스트 순서. 중복은 한 번만. */
export function buildPagePlaylist(bgm: SiteBgm): BgmTrack[] {
  const tracks: BgmTrack[] = [];
  const add = (track: BgmTrack | null) => {
    if (!track?.id) return;
    if (!tracks.some((t) => sameTrack(t, track))) tracks.push(track);
  };

  const addSrc = (src: {
    fileUrl?: string;
    url?: string;
    title: string;
    artist: string;
  }) => {
    if (src.fileUrl?.trim()) {
      add(
        trackFromSrc({
          fileData: src.fileUrl,
          title: src.title,
          artist: src.artist,
          scope: 'page',
        }),
      );
      return;
    }
    if (src.url?.trim()) {
      add(
        trackFromSrc({
          url: src.url,
          title: src.title,
          artist: src.artist,
          scope: 'page',
        }),
      );
    }
  };

  addSrc({
    fileUrl: bgm.fileUrl,
    url: bgm.url,
    title: bgm.title || 'BGM',
    artist: bgm.artist || '',
  });

  for (const item of bgm.playlist ?? []) {
    addSrc({
      fileUrl: item.fileUrl,
      url: item.url,
      title: item.title || bgm.title || 'BGM',
      artist: item.artist || bgm.artist || '',
    });
  }

  return tracks;
}

export function firstPageTrack(bgm: SiteBgm): BgmTrack | null {
  return buildPagePlaylist(bgm)[0] ?? null;
}

export function trackKey(track: BgmTrack | null) {
  if (!track?.id) return '';
  const n = normalizeTrack(track);
  return `${n.kind}:${n.id}`;
}
