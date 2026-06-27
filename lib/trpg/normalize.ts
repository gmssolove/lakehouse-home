import { mergePlayerInfoFields } from '@/lib/trpg/defaultPlayerInfo';
import { normalizeImageFrame, type ImageFrame } from '@/lib/shared/imageFrame';
import type {
  TrpgDiceHighlight,
  TrpgGalleryItem,
  TrpgHandout,
  TrpgPlayerItem,
  TrpgPlayerProfile,
  TrpgRelationship,
  TrpgScenario,
  TrpgSessionLog,
} from '@/lib/types/site-content';

function normalizeImageFrameField(raw: unknown): ImageFrame | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const frame = normalizeImageFrame({
    scale: row.scale != null ? Number(row.scale) : undefined,
    x: row.x != null ? Number(row.x) : undefined,
    y: row.y != null ? Number(row.y) : undefined,
  });
  if (frame.scale === 1 && frame.x === 0 && frame.y === 0) return undefined;
  return frame;
}

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
    logFontSize: raw.logFontSize != null ? Number(raw.logFontSize) || undefined : undefined,
    logLineHeight: raw.logLineHeight != null ? Number(raw.logLineHeight) || undefined : undefined,
    secret: Boolean(raw.secret),
    secretPassword: String(raw.secretPassword || '').trim() || undefined,
  };
}

function normalizePlayer(raw: Record<string, unknown>): TrpgPlayerProfile {
  const infoFields = Array.isArray(raw.infoFields)
    ? raw.infoFields
        .map((f) => {
          const row = f as Record<string, unknown>;
          const key = String(row.key || '').trim();
          const value = String(row.value || '').trim();
          return key ? { key, value } : null;
        })
        .filter((f): f is { key: string; value: string } => !!f)
    : undefined;

  const stats = Array.isArray(raw.stats)
    ? raw.stats
        .map((s) => {
          const row = s as Record<string, unknown>;
          const label = String(row.label || '').trim();
          if (!label) return null;
          return {
            label,
            value: Number(row.value) || 0,
            max: row.max != null ? Number(row.max) || undefined : undefined,
          };
        })
        .filter((s): s is NonNullable<typeof s> => !!s)
    : undefined;

  const relations = Array.isArray(raw.relations)
    ? raw.relations
        .map((r) => {
          const row = r as Record<string, unknown>;
          const id = String(row.id || '').trim();
          const name = String(row.name || '').trim();
          const playerId = String(row.playerId || '').trim();
          if (!id || (!name && !playerId)) return null;
          return {
            id,
            playerId: playerId || undefined,
            name,
            desc: String(row.desc || '').trim() || undefined,
          };
        })
        .filter((r): r is NonNullable<typeof r> => !!r)
    : undefined;

  return {
    id: String(raw.id || ''),
    name: String(raw.name || '').trim(),
    nameEn: String(raw.nameEn || '').trim() || undefined,
    role: String(raw.role || '').trim() || undefined,
    img: String(raw.img || '').trim() || undefined,
    imgFrame: normalizeImageFrameField(raw.imgFrame),
    imgFit: String(raw.imgFit || '').trim() || undefined,
    imgPos: String(raw.imgPos || '').trim() || undefined,
    bio: String(raw.bio || '').trim() || undefined,
    appearance: String(raw.appearance || '').trim() || undefined,
    personality: String(raw.personality || '').trim() || undefined,
    traits: String(raw.traits || '').trim() || undefined,
    likes: String(raw.likes || '').trim() || undefined,
    dislikes: String(raw.dislikes || '').trim() || undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined,
    infoFields: mergePlayerInfoFields(infoFields),
    stats: stats?.length ? stats : undefined,
    relations: relations?.length ? relations : undefined,
    money: String(raw.money || '').trim() || undefined,
    itemNote: String(raw.itemNote || '').trim() || undefined,
    items: normalizePlayerItems(raw.items),
    playerName: String(raw.playerName || '').trim() || undefined,
  };
}

function normalizePlayerItems(raw: unknown): TrpgPlayerItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: TrpgPlayerItem[] = [];
  for (const row of raw) {
    const item = (row ?? {}) as Record<string, unknown>;
    const id = String(item.id || '').trim();
    if (!id) continue;
    if (item.empty) {
      items.push({ id, name: String(item.name || '—').trim() || '—', empty: true });
      continue;
    }
    const name = String(item.name || '').trim();
    if (!name) continue;
    items.push({
      id,
      name,
      icon: String(item.icon || '').trim() || undefined,
      count: String(item.count || '').trim() || undefined,
      key: Boolean(item.key),
    });
  }
  return items.length ? items : undefined;
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
    summary: String(raw.summary || '').trim() || undefined,
    review: String(raw.review || '').trim() || undefined,
    sessionUrl: String(raw.sessionUrl || '').trim() || undefined,
    pageBackground: String(raw.pageBackground || '').trim() || undefined,
    pageBgm: raw.pageBgm && typeof raw.pageBgm === 'object'
      ? {
          title: String((raw.pageBgm as Record<string, unknown>).title || '').trim() || undefined,
          artist: String((raw.pageBgm as Record<string, unknown>).artist || '').trim() || undefined,
          fileUrl: String((raw.pageBgm as Record<string, unknown>).fileUrl || '').trim() || undefined,
          url: String((raw.pageBgm as Record<string, unknown>).url || '').trim() || undefined,
        }
      : undefined,
    body: String(raw.body || legacy.desc || '').trim(),
    playerProfiles: asArray(raw.playerProfiles, normalizePlayer).filter((p) => p.id && p.name),
    relationships: asArray(raw.relationships, normalizeRelation).filter((r) => r.id && r.fromId && r.toId),
    gallery: asArray(raw.gallery, normalizeGallery).filter((g) => g.id && g.img),
    diceHighlights: asArray(raw.diceHighlights, normalizeDice).filter((d) => d.id && d.title),
    handouts: asArray(raw.handouts, normalizeHandout).filter((h) => h.id && h.title),
    relationshipNotes: String(raw.relationshipNotes || '').trim() || undefined,
    characterIds,
    logs: (() => {
      const legacyFontSize = raw.logFontSize != null ? Number(raw.logFontSize) || undefined : undefined;
      const legacyLineHeight = raw.logLineHeight != null ? Number(raw.logLineHeight) || undefined : undefined;
      return asArray(raw.logs, normalizeLog)
        .filter((l) => l.id)
        .map((l) => ({
          ...l,
          logFontSize: l.logFontSize ?? legacyFontSize,
          logLineHeight: l.logLineHeight ?? legacyLineHeight,
        }));
    })(),
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
