import {
  DEFAULT_STORY_CATEGORIES,
  type OcCharacter,
  type PairCommission,
  type PairItem,
  type PairStorySeries,
  type PreviewItem,
  type StoryChapter,
  type StoryEntry,
  type StoryLog,
  type StoryViewMode,
  type StoryVisibility,
  type ThemeSong,
} from '@/lib/types/character';
import { normalizeImageFrame } from '@/lib/shared/imageFrame';

export function newId(prefix = 'st'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createChapter(body = '', title = ''): StoryChapter {
  return { id: newId('ch'), title: title || undefined, body };
}

export function clampBgEffectOpacity(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 55;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeViewMode(raw: unknown): StoryViewMode {
  if (raw === 'scroll' || raw === 'comic' || raw === 'text') return raw;
  return 'text';
}

function normalizeVisibility(raw: unknown): StoryVisibility {
  return raw === 'secret' ? 'secret' : 'public';
}

function normalizeThemeSong(raw: unknown): ThemeSong | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as ThemeSong;
  const title = typeof o.title === 'string' ? o.title : undefined;
  const artist = typeof o.artist === 'string' ? o.artist : undefined;
  const youtubeId = typeof o.youtubeId === 'string' ? o.youtubeId : undefined;
  const fileData = typeof o.fileData === 'string' ? o.fileData : undefined;
  if (!title && !artist && !youtubeId && !fileData) return undefined;
  return { title, artist, youtubeId, fileData };
}

export function normalizeStorySeries(raw?: PairStorySeries | null): PairStorySeries | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const title = typeof raw.title === 'string' ? raw.title : undefined;
  const quote = typeof raw.quote === 'string' ? raw.quote : undefined;
  const intro = typeof raw.intro === 'string' ? raw.intro : undefined;
  const image = typeof raw.image === 'string' ? raw.image : undefined;
  const imageFit = typeof raw.imageFit === 'string' ? raw.imageFit : undefined;
  const imagePos = typeof raw.imagePos === 'string' ? raw.imagePos : undefined;
  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags.map((h) => String(h || '').trim()).filter(Boolean)
    : undefined;
  if (!title && !quote && !intro && !image && !(hashtags && hashtags.length)) return undefined;
  return { title, quote, intro, image, imageFit, imagePos, hashtags };
}

export function createStoryEntry(
  partial?: Partial<
    Pick<
      StoryEntry,
      | 'title'
      | 'category'
      | 'chapters'
      | 'order'
      | 'author'
      | 'bgAccentMode'
      | 'bgColor'
      | 'bgEffect'
      | 'bgEffectOpacity'
      | 'subtitle'
      | 'date'
      | 'thumbnail'
      | 'thumbnailFrame'
      | 'viewMode'
      | 'visibility'
      | 'secretPassword'
      | 'adult'
      | 'images'
      | 'theme'
      | 'tweetEmbeds'
    >
  >,
): StoryEntry {
  const bgAccentMode =
    partial?.bgAccentMode === 'custom' || (partial?.bgColor || '').trim()
      ? 'custom'
      : 'character';
  return {
    id: newId('se'),
    title: partial?.title ?? '',
    category: partial?.category?.trim() || '기타',
    chapters: partial?.chapters?.length ? partial.chapters : [createChapter()],
    order: partial?.order ?? 0,
    author: partial?.author,
    bgAccentMode,
    bgColor: bgAccentMode === 'custom' ? partial?.bgColor : undefined,
    bgEffect: partial?.bgEffect === 'vignette' ? 'vignette' : 'bottom-gradient',
    bgEffectOpacity: clampBgEffectOpacity(
      partial?.bgEffectOpacity !== undefined ? partial.bgEffectOpacity : 55,
    ),
    subtitle: partial?.subtitle,
    date: partial?.date,
    thumbnail: partial?.thumbnail,
    thumbnailFrame: partial?.thumbnailFrame,
    viewMode: normalizeViewMode(partial?.viewMode),
    visibility: normalizeVisibility(partial?.visibility),
    secretPassword: partial?.secretPassword,
    adult: !!partial?.adult || undefined,
    images: Array.isArray(partial?.images) ? partial.images.filter(Boolean) : undefined,
    theme: partial?.theme,
    tweetEmbeds: normalizeTweetEmbeds(partial?.tweetEmbeds),
  };
}

function normalizeTweetEmbeds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const urls = raw
    .map((u) => String(u || '').trim())
    .filter((u) => /^https?:\/\//i.test(u));
  return urls.length ? urls : undefined;
}

/** 비밀글 잠금용 itemId */
export function storySecretItemId(pairId: string, entryId: string): string {
  return `${pairId}__story__${entryId}`;
}

export function createPreviewItem(
  partial?: Partial<Pick<PreviewItem, 'title' | 'body' | 'order'>>,
): PreviewItem {
  return {
    id: newId('pv'),
    title: partial?.title ?? '',
    body: partial?.body ?? '',
    order: partial?.order ?? 0,
  };
}

export function countStoryChars(entry: StoryEntry): number {
  return entry.chapters.reduce((sum, ch) => {
    const t = (ch.body || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    return sum + t.length;
  }, 0);
}

export function formatStoryMeta(entry: StoryEntry): string {
  const n = entry.chapters.filter((c) => (c.body || '').trim()).length || entry.chapters.length;
  const chars = countStoryChars(entry);
  const approx = chars > 0 ? `약 ${chars.toLocaleString('ko-KR')}자` : '0자';
  return `${n}장 · ${approx}`;
}

export function mergeStoryCategories(
  custom: string[] | undefined,
  entries: StoryEntry[],
): string[] {
  const out: string[] = [...DEFAULT_STORY_CATEGORIES];
  const seen = new Set(out.map((c) => c.toLowerCase()));
  for (const c of custom || []) {
    const t = c.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  for (const e of entries) {
    const t = e.category?.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/** 기본 분류 프리셋 색 */
export const DEFAULT_STORY_CATEGORY_COLORS: Record<string, string> = {
  본편: '#dc8c50',
  AU: '#78aad6',
  IF: '#d282aa',
  기타: '#a0a0a0',
};

export function resolveStoryCategoryColor(
  cat: string,
  colors?: Record<string, string> | null,
): string | undefined {
  const key = cat.trim();
  if (!key) return undefined;
  const custom = colors?.[key]?.trim();
  if (custom) return custom;
  return DEFAULT_STORY_CATEGORY_COLORS[key];
}

export function storyCategoryTagStyle(
  cat: string,
  colors?: Record<string, string> | null,
): { borderColor: string; color: string } | undefined {
  const hex = resolveStoryCategoryColor(cat, colors);
  if (!hex) return undefined;
  return { borderColor: hex, color: hex };
}

export function normalizeStoryCategoryColors(
  raw: unknown,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const name = k.trim();
    const color = typeof v === 'string' ? v.trim() : '';
    if (!name || !color) continue;
    out[name] = color;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeChapter(raw: unknown, i: number): StoryChapter | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<StoryChapter>;
  const body = typeof o.body === 'string' ? o.body : '';
  const title = typeof o.title === 'string' ? o.title : undefined;
  const id = typeof o.id === 'string' && o.id ? o.id : `ch_${i}`;
  return { id, title, body };
}

function normalizeEntry(raw: unknown, index: number): StoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<StoryEntry> & { body?: string; content?: string };
  const id = typeof o.id === 'string' && o.id ? o.id : `se_${index}`;
  const title = typeof o.title === 'string' ? o.title : '';
  const category = (typeof o.category === 'string' && o.category.trim()) || '기타';
  const order = typeof o.order === 'number' && Number.isFinite(o.order) ? o.order : index;

  let chapters: StoryChapter[] = [];
  if (Array.isArray(o.chapters)) {
    chapters = o.chapters
      .map((c, i) => normalizeChapter(c, i))
      .filter((c): c is StoryChapter => Boolean(c));
  }
  /* legacy single body on entry */
  const legacyBody =
    typeof o.body === 'string'
      ? o.body
      : typeof o.content === 'string'
        ? o.content
        : '';
  if (!chapters.length && legacyBody.trim()) {
    chapters = [createChapter(legacyBody)];
  }
  if (!chapters.length) chapters = [createChapter()];

  const author = typeof o.author === 'string' ? o.author : undefined;
  const bgColorRaw = typeof o.bgColor === 'string' ? o.bgColor.trim() : '';
  const bgAccentMode =
    o.bgAccentMode === 'custom' || o.bgAccentMode === 'character'
      ? o.bgAccentMode
      : bgColorRaw
        ? 'custom'
        : 'character';
  const bgColor = bgAccentMode === 'custom' && bgColorRaw ? bgColorRaw : undefined;
  const bgEffect = o.bgEffect === 'vignette' ? 'vignette' : 'bottom-gradient';
  const bgEffectOpacity = clampBgEffectOpacity(
    o.bgEffectOpacity !== undefined ? o.bgEffectOpacity : 55,
  );

  const subtitle = typeof o.subtitle === 'string' ? o.subtitle : undefined;
  const date = typeof o.date === 'string' ? o.date : undefined;
  const thumbnail = typeof o.thumbnail === 'string' ? o.thumbnail : undefined;
  const thumbnailFrame =
    o.thumbnailFrame && typeof o.thumbnailFrame === 'object'
      ? normalizeImageFrame(o.thumbnailFrame)
      : undefined;
  const viewMode = normalizeViewMode(o.viewMode);
  const visibility = normalizeVisibility(o.visibility);
  const secretPassword = typeof o.secretPassword === 'string' ? o.secretPassword : undefined;
  const adult = o.adult === true ? true : undefined;
  const images = Array.isArray(o.images)
    ? o.images.map((src) => String(src || '').trim()).filter(Boolean)
    : undefined;
  const theme = normalizeThemeSong(o.theme);
  const tweetEmbeds = normalizeTweetEmbeds(o.tweetEmbeds);

  return {
    id,
    title,
    category,
    chapters,
    order,
    author,
    bgAccentMode,
    bgColor,
    bgEffect,
    bgEffectOpacity,
    subtitle,
    date,
    thumbnail,
    thumbnailFrame,
    viewMode,
    visibility,
    secretPassword,
    adult,
    images,
    theme,
    tweetEmbeds,
  };
}

export function normalizeStoryEntries(raw?: StoryEntry[] | null): StoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e, i) => normalizeEntry(e, i))
    .filter((e): e is StoryEntry => Boolean(e))
    .sort((a, b) => a.order - b.order)
    .map((e, i) => ({ ...e, order: i }));
}

export function normalizePreviewItems(raw?: PreviewItem[] | null): PreviewItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PreviewItem[] = [];
  raw.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const body = typeof p.body === 'string' ? p.body : '';
    const title = typeof p.title === 'string' ? p.title : '';
    const id = typeof p.id === 'string' && p.id ? p.id : `pv_${i}`;
    const order = typeof p.order === 'number' && Number.isFinite(p.order) ? p.order : i;
    if (!body.trim() && !title.trim()) return;
    items.push({ id, title, body, order });
  });
  return items.sort((a, b) => a.order - b.order).map((p, i) => ({ ...p, order: i }));
}

function storyLogsToEntries(logs: StoryLog[]): StoryEntry[] {
  return logs
    .filter((l) => l && (l.body?.trim() || l.title?.trim()))
    .map((l, i) => ({
      id: l.id || newId('se'),
      title: l.title?.trim() || '',
      category: '기타',
      chapters: [createChapter(l.body || '')],
      order: i,
    }));
}

function novelToPreview(
  novel?: { title?: string; preview?: string }[],
): PreviewItem[] {
  if (!Array.isArray(novel)) return [];
  const items: PreviewItem[] = [];
  novel.forEach((n, i) => {
    const body = n?.preview?.trim() || '';
    const title = n?.title?.trim() || '';
    if (!body && !title) return;
    items.push({ id: newId('pv'), title, body, order: i });
  });
  return items;
}

/**
 * OC 로드 시 legacy story / storyLogs / novel → storyEntries / previewItems
 */
export function hydrateOcStories(character: OcCharacter): OcCharacter {
  let entries = normalizeStoryEntries(character.storyEntries);
  if (!entries.length) {
    const fromLogs = Array.isArray(character.storyLogs)
      ? storyLogsToEntries(character.storyLogs)
      : [];
    const main = character.story?.trim() || '';
    if (main) {
      const dup = fromLogs.some((e) => e.chapters.some((c) => c.body.trim() === main));
      if (!dup) {
        fromLogs.unshift({
          id: newId('se'),
          title: '',
          category: '본편',
          chapters: [createChapter(main)],
          order: 0,
        });
      }
    }
    entries = fromLogs.map((e, i) => ({ ...e, order: i }));
  }

  let previewItems = normalizePreviewItems(character.previewItems);
  if (!previewItems.length) {
    previewItems = novelToPreview(character.novel);
  }

  const storyCategories = mergeStoryCategories(character.storyCategories, entries);

  return {
    ...character,
    storyEntries: entries,
    previewItems,
    storyCategories,
    storyCategoryColors: normalizeStoryCategoryColors(character.storyCategoryColors),
  };
}

function commissionCategory(kind: PairCommission['kind']): string {
  if (kind === 'if') return 'IF';
  if (kind === 'au') return 'AU';
  return '기타';
}

/**
 * Pair 로드 시 legacy story / charNotes.story / commissions → storyEntries
 * storyEntries 필드가 있으면(빈 배열 포함) legacy 마이그레이션을 다시 하지 않음
 */
export function hydratePairStories(pair: PairItem): PairItem {
  if (pair.storyEntries != null) {
    const entries = normalizeStoryEntries(pair.storyEntries);
    return {
      ...pair,
      storyEntries: entries,
      storyCategories: mergeStoryCategories(pair.storyCategories, entries),
      storyCategoryColors: normalizeStoryCategoryColors(pair.storyCategoryColors),
      storySeries: normalizeStorySeries(pair.storySeries),
    };
  }

  const built: StoryEntry[] = [];
  const shared = pair.story?.trim() || '';
  if (shared) {
    built.push({
      id: newId('se'),
      title: '공통 서사',
      category: '본편',
      chapters: [createChapter(shared)],
      order: built.length,
    });
  }
  const noteA = pair.charNotes?.[0]?.story?.trim() || '';
  if (noteA) {
    built.push({
      id: newId('se'),
      title: `${pair.chars?.[0] || 'A'} 서술`,
      category: '본편',
      chapters: [createChapter(noteA)],
      order: built.length,
    });
  }
  const noteB = pair.charNotes?.[1]?.story?.trim() || '';
  if (noteB) {
    built.push({
      id: newId('se'),
      title: `${pair.chars?.[1] || 'B'} 서술`,
      category: '본편',
      chapters: [createChapter(noteB)],
      order: built.length,
    });
  }
  for (const c of pair.commissions || []) {
    if (!c) continue;
    const body = c.body?.trim() || '';
    const title = c.title?.trim() || '';
    if (!body && !title && !c.url?.trim()) continue;
    const chapterBody = [body, c.url?.trim() ? `\n\n${c.url.trim()}` : '', c.note?.trim() ? `\n\n${c.note.trim()}` : '']
      .join('')
      .trim();
    built.push({
      id: c.id || newId('se'),
      title: title || '(제목 없음)',
      category: commissionCategory(c.kind),
      chapters: [createChapter(chapterBody)],
      order: built.length,
    });
  }
  const entries = built.map((e, i) => ({ ...e, order: i }));
  const storyCategories = mergeStoryCategories(pair.storyCategories, entries);

  return {
    ...pair,
    storyEntries: entries,
    storyCategories,
    storyCategoryColors: normalizeStoryCategoryColors(pair.storyCategoryColors),
    storySeries: normalizeStorySeries(pair.storySeries),
  };
}

/** 저장 직전 — canonical만 남기고 legacy 필드는 비움(선택적 strip) */
export function pinOcStoriesForSave(character: OcCharacter): OcCharacter {
  const hydrated = hydrateOcStories(character);
  return {
    ...hydrated,
    storyEntries: normalizeStoryEntries(hydrated.storyEntries),
    previewItems: normalizePreviewItems(hydrated.previewItems),
    storyCategories: mergeStoryCategories(
      hydrated.storyCategories,
      hydrated.storyEntries || [],
    ),
    storyCategoryColors: normalizeStoryCategoryColors(hydrated.storyCategoryColors),
  };
}

export function pinPairStoriesForSave(pair: PairItem): PairItem {
  /* hydrate로 legacy를 되살리지 않음 — 삭제된 []도 그대로 저장 */
  const entries = normalizeStoryEntries(pair.storyEntries);
  const notes = pair.charNotes;
  return {
    ...pair,
    storyEntries: entries,
    storyCategories: mergeStoryCategories(pair.storyCategories, entries),
    storyCategoryColors: normalizeStoryCategoryColors(pair.storyCategoryColors),
    storySeries: normalizeStorySeries(pair.storySeries),
    story: '',
    charNotes: notes
      ? ([
          { ...notes[0], story: '' },
          { ...notes[1], story: '' },
        ] as PairItem['charNotes'])
      : notes,
    commissions: [],
  };
}

export function reorderEntries(entries: StoryEntry[], from: number, to: number): StoryEntry[] {
  const next = [...entries];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((e, i) => ({ ...e, order: i }));
}

export function moveEntry(entries: StoryEntry[], id: string, dir: -1 | 1): StoryEntry[] {
  const i = entries.findIndex((e) => e.id === id);
  if (i < 0) return entries;
  return reorderEntries(entries, i, i + dir);
}
