import type { MusicPlaylist, MusicTrack } from '@/lib/types/site-content';

function ensureArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw as Record<string, T>);
  return [];
}

export function normalizeMusicTrack(raw: unknown, index = 0): MusicTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<MusicTrack>;
  const id = String(item.id ?? '').trim() || `legacy-track-${index}`;
  return {
    id,
    title: String(item.title ?? '제목 없음'),
    artist: String(item.artist ?? ''),
    fileUrl: String(item.fileUrl ?? ''),
    coverUrl: item.coverUrl ? String(item.coverUrl) : undefined,
    lyrics: item.lyrics ? String(item.lyrics) : undefined,
    lyricLines: Array.isArray(item.lyricLines) ? item.lyricLines : undefined,
    comments: Array.isArray(item.comments) ? item.comments : undefined,
    secret: Boolean(item.secret),
    secretPassword: item.secretPassword ? String(item.secretPassword) : undefined,
  };
}

export function normalizeMusicTracks(raw: unknown): MusicTrack[] {
  return ensureArray<unknown>(raw)
    .map((item, index) => normalizeMusicTrack(item, index))
    .filter((track): track is MusicTrack => !!track);
}

export function normalizeMusicPlaylist(raw: unknown, index = 0): MusicPlaylist | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<MusicPlaylist>;
  const id = String(item.id ?? '').trim() || `legacy-pl-${index}`;
  const trackIdsRaw = item.trackIds;
  let trackIds: string[] = [];
  if (Array.isArray(trackIdsRaw)) {
    trackIds = trackIdsRaw.map(String);
  } else if (trackIdsRaw && typeof trackIdsRaw === 'object') {
    trackIds = Object.values(trackIdsRaw as Record<string, unknown>).map(String);
  }
  return {
    id,
    title: String(item.title ?? '제목 없음'),
    description: item.description ? String(item.description) : undefined,
    coverUrl: item.coverUrl ? String(item.coverUrl) : undefined,
    trackIds,
    secret: Boolean(item.secret),
    secretPassword: item.secretPassword ? String(item.secretPassword) : undefined,
  };
}

export function normalizeMusicPlaylists(raw: unknown): MusicPlaylist[] {
  return ensureArray<unknown>(raw)
    .map((item, index) => normalizeMusicPlaylist(item, index))
    .filter((playlist): playlist is MusicPlaylist => !!playlist);
}
