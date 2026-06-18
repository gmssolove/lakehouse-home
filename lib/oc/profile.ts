import type { OcCharacter, ProfileField } from '@/lib/types/character';

export const CORE_PROFILE_FIELD_KEYS = [
  '나이',
  '성별',
  '신장',
  '체중',
  '생일',
  '직업',
  '혈액형',
] as const;

export type CoreProfileFieldKey = (typeof CORE_PROFILE_FIELD_KEYS)[number];

export function isKeywordProfileKey(k: string): boolean {
  return /^(키워드|keywords?)$/i.test(k.trim());
}

export function isCoreProfileKey(k: string): boolean {
  return (CORE_PROFILE_FIELD_KEYS as readonly string[]).includes(k.trim());
}

export function getProfileFieldValue(c: OcCharacter, key: string): string {
  if (key === '나이' && c.role?.trim()) return c.role.trim();
  const row = (c.profile ?? []).find((p) => p.k?.trim() === key);
  return (row?.v ?? '').trim();
}

export function collectProfileFieldValues(characters: OcCharacter[], key: string): string[] {
  return [...new Set(characters.map((c) => getProfileFieldValue(c, key)).filter(Boolean))];
}

export function formatCardTag(tag?: string): string | null {
  const text = tag?.trim();
  if (!text) return null;
  return text.startsWith('#') ? text : `#${text}`;
}

export function mergeCharacterProfile(
  profile: ProfileField[] | undefined,
  age?: string,
  extras?: ProfileField[],
): ProfileField[] {
  const extraSource = extras ?? splitExtraProfileRows(profile);
  const map = new Map<string, string>();
  const pendingExtras: ProfileField[] = [];

  for (const row of extraSource) {
    const key = row.k?.trim();
    if (!key) {
      pendingExtras.push({ k: '', v: row.v ?? '' });
      continue;
    }
    if (isKeywordProfileKey(key) || isCoreProfileKey(key)) continue;
    map.set(key, row.v ?? '');
  }

  const core = CORE_PROFILE_FIELD_KEYS.map((key) => {
    if (key === '나이') return { k: key, v: (age ?? '').trim() };
    const fromProfile = (profile ?? []).find((p) => p.k?.trim() === key);
    return { k: key, v: (fromProfile?.v ?? '').trim() };
  });

  const extraRows = [...map.entries()].map(([k, v]) => ({ k, v }));
  return [...core, ...extraRows, ...pendingExtras];
}

export function splitExtraProfileRows(profile: ProfileField[] | undefined): ProfileField[] {
  return (profile ?? []).filter((row) => {
    const key = row.k?.trim();
    if (!key) return true;
    return !isCoreProfileKey(key) && !isKeywordProfileKey(key);
  });
}

export function buildDetailProfileRows(character: OcCharacter): ProfileField[] {
  const rows: ProfileField[] = [];

  for (const key of CORE_PROFILE_FIELD_KEYS) {
    const value = getProfileFieldValue(character, key);
    if (value) rows.push({ k: key, v: value });
  }

  const faction = character.faction?.trim();
  if (faction) rows.push({ k: '소속', v: faction });

  for (const row of character.profile ?? []) {
    const key = row.k?.trim();
    if (!key || isCoreProfileKey(key) || isKeywordProfileKey(key) || key === '소속') continue;
    if (!row.v?.trim()) continue;
    if (rows.some((r) => r.k === key)) continue;
    rows.push({ k: key, v: row.v.trim() });
  }

  return rows;
}

export function formatStatDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw.trim();
  return digits.padStart(2, '0');
}
