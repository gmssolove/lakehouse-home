import type {
  TrpgDiceHighlight,
  TrpgGalleryItem,
  TrpgHandout,
  TrpgPlayerProfile,
  TrpgRelationship,
  TrpgScenario,
  TrpgSessionLog,
} from '@/lib/types/site-content';

function asArray<T>(raw: unknown, map: (v: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => map((item ?? {}) as Record<string, unknown>));
}

function normalizeLog(raw: Record<string, unknown>): TrpgSessionLog {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '세션 로그').trim(),
    subtitle: String(raw.subtitle || '').trim() || undefined,
    date: String(raw.date || '').trim() || undefined,
    body: String(raw.body || '').trim(),
    html: String(raw.html || '').trim() || undefined,
    thumbnail: String(raw.thumbnail || '').trim() || undefined,
    thumbnailSpoiler: Boolean(raw.thumbnailSpoiler),
    summary: String(raw.summary || '').trim() || undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined,
    playerIds: Array.isArray(raw.playerIds) ? raw.playerIds.map(String).filter(Boolean) : undefined,
    secret: Boolean(raw.secret),
    secretPassword: String(raw.secretPassword || '').trim() || undefined,
  };
}

function normalizePlayer(raw: Record<string, unknown>): TrpgPlayerProfile {
  return {
    id: String(raw.id || ''),
    name: String(raw.name || '').trim(),
    role: String(raw.role || '').trim() || undefined,
    img: String(raw.img || '').trim() || undefined,
    bio: String(raw.bio || '').trim() || undefined,
  };
}

function normalizeRelation(raw: Record<string, unknown>): TrpgRelationship {
  return {
    id: String(raw.id || ''),
    fromId: String(raw.fromId || '').trim(),
    toId: String(raw.toId || '').trim(),
    label: String(raw.label || '').trim() || undefined,
  };
}

function normalizeGallery(raw: Record<string, unknown>): TrpgGalleryItem {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '').trim() || undefined,
    img: String(raw.img || '').trim(),
    caption: String(raw.caption || '').trim() || undefined,
    artist: String(raw.artist || '').trim() || undefined,
  };
}

function normalizeDice(raw: Record<string, unknown>): TrpgDiceHighlight {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '').trim(),
    roll: String(raw.roll || '').trim() || undefined,
    result: String(raw.result || '').trim() || undefined,
    note: String(raw.note || '').trim() || undefined,
    session: String(raw.session || '').trim() || undefined,
  };
}

function normalizeHandout(raw: Record<string, unknown>): TrpgHandout {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '').trim(),
    body: String(raw.body || '').trim() || undefined,
    img: String(raw.img || '').trim() || undefined,
    spoiler: Boolean(raw.spoiler),
  };
}

/** Firebase·레거시 SitePost 필드 호환 */
export function normalizeTrpgScenario(raw: Partial<TrpgScenario> & Record<string, unknown>): TrpgScenario {
  const legacy = raw as Record<string, unknown>;
  const title = String(raw.title || legacy.scenario || legacy.name || '시나리오').trim();
  const legacyBody = String(raw.body || legacy.desc || legacy.character || raw.players || '').trim();
  const legacyDate = String(legacy.date || '').trim();
  const rawIds = raw.characterIds ?? legacy.characterIds;
  const characterIds = Array.isArray(rawIds)
    ? rawIds.map((id) => String(id)).filter(Boolean)
    : typeof rawIds === 'string'
      ? rawIds.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    id: String(raw.id || ''),
    title,
    subtitle: String(raw.subtitle || '').trim() || undefined,
    titleFont: raw.titleFont,
    subtitleFont: raw.subtitleFont,
    thumbnail: String(raw.thumbnail || legacy.img || '').trim(),
    thumbnailFrame: raw.thumbnailFrame,
    thumbnailFit: String(raw.thumbnailFit || 'cover').trim() || 'cover',
    thumbnailPos: String(raw.thumbnailPos || 'center center').trim() || 'center center',
    author: String(raw.author || legacy.writer || '').trim(),
    kp: String(raw.kp || '').trim(),
    system: String(raw.system || '').trim(),
    dateStart: String(raw.dateStart || legacyDate || '').trim(),
    dateEnd: String(raw.dateEnd || '').trim(),
    players: String(raw.players || legacyBody || '').trim(),
    cleared: Boolean(raw.cleared),
    summary: String(raw.summary || '').trim(),
    body: String(raw.body || legacy.desc || '').trim(),
    playerProfiles: asArray(raw.playerProfiles, normalizePlayer).filter((p) => p.id && p.name),
    relationships: asArray(raw.relationships, normalizeRelation).filter((r) => r.id && r.fromId && r.toId),
    gallery: asArray(raw.gallery, normalizeGallery).filter((g) => g.id && g.img),
    diceHighlights: asArray(raw.diceHighlights, normalizeDice).filter((d) => d.id && d.title),
    handouts: asArray(raw.handouts, normalizeHandout).filter((h) => h.id && h.title),
    relationshipNotes: String(raw.relationshipNotes || '').trim() || undefined,
    characterIds,
    logs: asArray(raw.logs, normalizeLog).filter((l) => l.id),
  };
}

export function formatTrpgDateRange(item: TrpgScenario) {
  if (item.dateStart && item.dateEnd) return `${item.dateStart} ~ ${item.dateEnd}`;
  if (item.dateStart) return item.dateStart;
  return '';
}

export function playerNameMap(profiles: TrpgPlayerProfile[]) {
  return new Map(profiles.map((p) => [p.id, p.name]));
}
