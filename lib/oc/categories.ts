export const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  세계관: 'Universe OC',
  Universe: 'Universe OC',
  'Universe OC': 'Universe OC',
  TRPG: 'TRPG OC',
  'TRPG OC': 'TRPG OC',
  '일반 OC': 'OC',
  OC: 'OC',
};

/** 저장·필터용 정규 카테고리 (표시 순서) */
export const DEFAULT_CATEGORIES = ['OC', 'Universe OC', 'TRPG OC'];

export function normalizeCategory(cat?: string): string {
  const text = (cat ?? '').trim();
  if (!text) return '';
  return LEGACY_CATEGORY_ALIASES[text] ?? text;
}

export function displayCategory(cat: string): string {
  return normalizeCategory(cat);
}

export function isUniverseCategory(cat?: string): boolean {
  return normalizeCategory(cat) === 'Universe OC';
}

export function isTrpgCategory(cat?: string): boolean {
  return normalizeCategory(cat) === 'TRPG OC';
}

export function mergeCategoryList(cats: string[]): string[] {
  const seen = new Set<string>();
  const extras: string[] = [];

  for (const raw of cats) {
    const cat = normalizeCategory(raw);
    if (!cat || seen.has(cat)) continue;
    seen.add(cat);
    if (!DEFAULT_CATEGORIES.includes(cat)) extras.push(cat);
  }

  const ordered = [...DEFAULT_CATEGORIES];
  for (const cat of extras) {
    if (!ordered.includes(cat)) ordered.push(cat);
  }
  return ordered;
}
