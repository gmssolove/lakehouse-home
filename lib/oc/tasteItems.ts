import type { OcCharacter, TasteItem } from '@/lib/types/character';

function newTasteId(prefix = 'ti') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function listToBody(list?: string[]): string {
  if (!list?.length) return '';
  if (list.length === 1) return list[0];
  return list.join(', ');
}

const DEFAULT_TASTE_ITEMS: Omit<TasteItem, 'id'>[] = [
  { title: 'HOBBY', body: '', width: 'full' },
  { title: 'LIKES', body: '', width: 'half' },
  { title: 'HATES', body: '', width: 'half' },
];

function normalizeItem(it: TasteItem): TasteItem {
  return {
    id: it.id || newTasteId(),
    title: it.title ?? '',
    body: it.body ?? '',
    width: it.width === 'half' ? 'half' : 'full',
    divider: it.divider ? true : undefined,
  };
}

/** 레거시 hobby/likes/hates/tasteExtra → tasteItems, 없으면 기본 3항목 */
export function resolveTasteItems(
  character: Pick<OcCharacter, 'tasteItems' | 'hobby' | 'likes' | 'hates' | 'tasteExtra'>,
): TasteItem[] {
  if (character.tasteItems && character.tasteItems.length > 0) {
    return character.tasteItems.map(normalizeItem);
  }

  const migrated: TasteItem[] = [];
  if (character.hobby?.trim()) {
    migrated.push({ id: newTasteId('legacy'), title: 'HOBBY', body: character.hobby, width: 'full' });
  }
  const likesBody = listToBody(character.likes);
  if (likesBody.trim()) {
    migrated.push({ id: newTasteId('legacy'), title: 'LIKES', body: likesBody, width: 'half' });
  }
  const hatesBody = listToBody(character.hates);
  if (hatesBody.trim()) {
    migrated.push({ id: newTasteId('legacy'), title: 'HATES', body: hatesBody, width: 'half' });
  }
  for (const row of character.tasteExtra ?? []) {
    if (!row?.k?.trim() && !row?.v?.trim()) continue;
    migrated.push({
      id: newTasteId('legacy'),
      title: (row.k || '').trim() || 'ITEM',
      body: row.v || '',
      width: 'full',
    });
  }

  if (migrated.length) return migrated;

  return DEFAULT_TASTE_ITEMS.map((d) => ({ ...d, id: newTasteId('def') }));
}

export function tasteItemsHaveContent(items: TasteItem[] | undefined): boolean {
  return (items ?? []).some((it) => it.divider || it.body?.trim());
}

export function createEmptyTasteItem(): TasteItem {
  return { id: newTasteId(), title: '', body: '', width: 'full' };
}

export function createTasteDivider(): TasteItem {
  return { id: newTasteId('div'), title: '', body: '', divider: true, width: 'full' };
}

export type TasteLayoutRow =
  | { kind: 'divider'; id: string }
  | { kind: 'full'; item: TasteItem }
  | { kind: 'pair'; left: TasteItem; right: TasteItem }
  | { kind: 'halfSolo'; item: TasteItem };

/** 표시용 행 묶기 — 연속 half끼리 pair, 홀수 잔여는 halfSolo */
export function layoutTasteRows(items: TasteItem[]): TasteLayoutRow[] {
  const rows: TasteLayoutRow[] = [];
  let pending: TasteItem | null = null;

  const flushPending = () => {
    if (!pending) return;
    rows.push({ kind: 'halfSolo', item: pending });
    pending = null;
  };

  for (const raw of items) {
    const it = normalizeItem(raw);
    if (it.divider) {
      flushPending();
      rows.push({ kind: 'divider', id: it.id });
      continue;
    }
    if (!it.body?.trim() && !it.title?.trim()) continue;

    if (it.width !== 'half') {
      flushPending();
      rows.push({ kind: 'full', item: it });
      continue;
    }

    if (pending) {
      rows.push({ kind: 'pair', left: pending, right: it });
      pending = null;
    } else {
      pending = it;
    }
  }
  flushPending();
  return rows;
}
