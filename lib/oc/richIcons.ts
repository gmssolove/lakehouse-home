/**
 * 서식 에디터용 Tabler Icons(아웃라인) 큐레이션.
 * 저장 마커: {!icon-name}  →  렌더/에디터: <i class="ti ti-{name} oc-rich-icon" …>
 */

export const STORY_RICH_ICONS = [
  'cake',
  'candy',
  'cookie',
  'gift',
  'music',
  'heart',
  'hearts',
  'diamond',
  'gem',
  'moon',
  'moon-stars',
  'sun',
  'star',
  'sparkles',
  'flower',
  'leaf',
  'clover',
  'cherry',
  'snowflake',
  'feather',
  'droplet',
  'flame',
  'candle',
  'book',
  'key',
  'lock',
  'bell',
  'crown',
  'eye',
  'ghost',
  'butterfly',
  'paw',
  'anchor',
  'compass',
  'hourglass',
  'palette',
  'wand',
  'skull',
  'cloud',
  'wind',
] as const;

export type StoryRichIconId = (typeof STORY_RICH_ICONS)[number];

const ICON_SET = new Set<string>(STORY_RICH_ICONS);

/** 평문 오프셋에서 아이콘 1칸 자리표시 */
export const RICH_ICON_PLAIN = '\uFFFC';

const RECENT_KEY = 'lh-story-rich-icon-recent';
const RECENT_MAX = 6;

export function normalizeRichIconId(raw: string): StoryRichIconId | null {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  return ICON_SET.has(id) ? (id as StoryRichIconId) : null;
}

export function matchRichIconAt(
  text: string,
  at: number,
): { id: StoryRichIconId; len: number } | null {
  const m = text.slice(at).match(/^\{!([a-z0-9-]+)\}/);
  if (!m) return null;
  const id = normalizeRichIconId(m[1]);
  if (!id) return null;
  return { id, len: m[0].length };
}

export function richIconMarker(id: StoryRichIconId | string): string {
  const n = normalizeRichIconId(id);
  return n ? `{!${n}}` : '';
}

export function richIconToHtml(id: StoryRichIconId | string): string {
  const n = normalizeRichIconId(id);
  if (!n) return '';
  return `<i class="ti ti-${n} oc-rich-icon" data-rich="icon" data-icon="${n}" contenteditable="false" aria-hidden="true"></i>`;
}

export function readRecentRichIcons(): StoryRichIconId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: StoryRichIconId[] = [];
    for (const x of parsed) {
      const id = normalizeRichIconId(String(x));
      if (id && !out.includes(id)) out.push(id);
      if (out.length >= RECENT_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function pushRecentRichIcon(id: StoryRichIconId | string): StoryRichIconId[] {
  const n = normalizeRichIconId(id);
  if (!n) return readRecentRichIcons();
  const next = [n, ...readRecentRichIcons().filter((x) => x !== n)].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}
