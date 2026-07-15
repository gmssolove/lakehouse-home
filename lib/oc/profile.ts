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
  const map = new Map<string, ProfileField>();
  const pendingExtras: ProfileField[] = [];

  for (const row of extraSource) {
    const keyRaw = row.k ?? '';
    const keyTrimmed = keyRaw.trim();
    if (!keyTrimmed) {
      // 입력 중 앞뒤 공백을 지우지 않음 (띄어쓰기 허용)
      pendingExtras.push({ k: keyRaw, v: row.v ?? '', tip: row.tip });
      continue;
    }
    if (isKeywordProfileKey(keyTrimmed) || isCoreProfileKey(keyTrimmed)) continue;
    map.set(keyTrimmed, { k: keyRaw, v: row.v ?? '', tip: row.tip });
  }

  const core = CORE_PROFILE_FIELD_KEYS.map((key) => {
    if (key === '나이') {
      const tip = (profile ?? []).find((p) => p.k?.trim() === key)?.tip;
      return { k: key, v: age ?? '', tip };
    }
    const fromProfile = (profile ?? []).find((p) => p.k?.trim() === key);
    return { k: key, v: fromProfile?.v ?? '', tip: fromProfile?.tip };
  });

  return [...core, ...[...map.values()], ...pendingExtras];
}

/** 저장 직전 — 항목/값 앞뒤 공백만 정리 */
export function finalizeCharacterProfile(profile: ProfileField[] | undefined): ProfileField[] {
  return (profile ?? [])
    .map((p) => ({
      k: (p.k ?? '').trim(),
      v: (p.v ?? '').trim(),
      tip: p.tip?.trim() || undefined,
    }))
    .filter((p) => isCoreProfileKey(p.k) || p.k.length > 0 || p.v.length > 0 || Boolean(p.tip));
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
  const tipOf = (key: string) =>
    (character.profile ?? []).find((p) => p.k?.trim() === key)?.tip?.trim() || undefined;

  for (const key of CORE_PROFILE_FIELD_KEYS) {
    const value = getProfileFieldValue(character, key);
    if (value) rows.push({ k: key, v: value, tip: tipOf(key) });
  }

  const faction = character.faction?.trim();
  if (faction) rows.push({ k: '소속', v: faction, tip: tipOf('소속') });

  for (const row of character.profile ?? []) {
    const key = row.k?.trim();
    if (!key || isCoreProfileKey(key) || isKeywordProfileKey(key) || key === '소속') continue;
    if (!row.v?.trim()) continue;
    if (rows.some((r) => r.k === key)) continue;
    rows.push({ k: key, v: row.v.trim(), tip: row.tip?.trim() || undefined });
  }

  return rows;
}

export function formatStatDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw.trim();
  return digits.padStart(2, '0');
}

/** 스탯 문자열 → 0~100 퍼센트 (75, 75/100, 75% 등) */
export function parseStatPercent(raw: string): number {
  const text = raw.trim();
  if (!text) return 0;
  const ratio = text.match(/(\d+(?:\.\d+)?)\s*[/⁄]\s*(\d+(?:\.\d+)?)/);
  if (ratio) {
    const a = Number(ratio[1]);
    const b = Number(ratio[2]);
    if (b > 0) return Math.max(0, Math.min(100, (a / b) * 100));
  }
  const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return Math.max(0, Math.min(100, Number(pct[1])));
  const n = Number(text.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  if (n <= 1) return Math.max(0, Math.min(100, n * 100));
  if (n <= 10) return Math.max(0, Math.min(100, n * 10));
  return Math.max(0, Math.min(100, n));
}
