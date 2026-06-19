import type { LakeAccessScope, SiteAccessSettings, WithSecret } from '@/lib/types/secret-content';
import { DEFAULT_SITE_ACCESS_SETTINGS } from '@/lib/types/secret-content';

export type { LakeAccessScope } from '@/lib/types/secret-content';

export const LAKE_ARCHIVE_PASSWORD = DEFAULT_SITE_ACCESS_SETTINGS.oc;

function unlockKey(scope: LakeAccessScope) {
  return `lh_lake_unlock_${scope}`;
}

function itemUnlockKey(scope: LakeAccessScope, itemId: string) {
  return `lh_lake_item_${scope}_${itemId}`;
}

export function isLakeAccessUnlocked(scope: LakeAccessScope): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(unlockKey(scope)) === '1';
  } catch {
    return false;
  }
}

export function isLakeItemUnlocked(scope: LakeAccessScope, itemId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(itemUnlockKey(scope, itemId)) === '1';
  } catch {
    return false;
  }
}

export function unlockLakeAccess(scope: LakeAccessScope): void {
  try {
    sessionStorage.setItem(unlockKey(scope), '1');
  } catch {
    /* ignore */
  }
}

export function unlockLakeItem(scope: LakeAccessScope, itemId: string): void {
  try {
    sessionStorage.setItem(itemUnlockKey(scope, itemId), '1');
  } catch {
    /* ignore */
  }
}

export function resolveScopePassword(
  scope: LakeAccessScope,
  settings?: Partial<SiteAccessSettings>,
): string {
  const merged = { ...DEFAULT_SITE_ACCESS_SETTINGS, ...settings };
  const pw = merged[scope]?.trim();
  if (pw) return pw;
  if (scope === 'oc' || scope === 'trpg') return DEFAULT_SITE_ACCESS_SETTINGS.oc;
  return '';
}

export function resolveItemPassword(
  scope: LakeAccessScope,
  item: WithSecret | undefined,
  settings?: Partial<SiteAccessSettings>,
): string {
  const itemPw = item?.secretPassword?.trim();
  if (itemPw) return itemPw;
  return resolveScopePassword(scope, settings);
}

export function verifyLakeAccessPassword(
  scope: LakeAccessScope,
  input: string,
  settings?: Partial<SiteAccessSettings>,
  item?: WithSecret,
): boolean {
  const expected = item?.secret ? resolveItemPassword(scope, item, settings) : resolveScopePassword(scope, settings);
  if (!expected) return true;
  return input.trim() === expected;
}

export function itemNeedsUnlock(
  scope: LakeAccessScope,
  item: WithSecret | undefined,
  settings?: Partial<SiteAccessSettings>,
  isAdmin = false,
): boolean {
  if (isAdmin) return false;
  if (!item?.secret) return false;
  const pw = resolveItemPassword(scope, item, settings);
  if (!pw) return false;
  return !isLakeItemUnlocked(scope, (item as { id?: string }).id ?? 'global');
}

/** @deprecated use isLakeAccessUnlocked('oc') */
export function isOcProfileUnlocked(): boolean {
  return isLakeAccessUnlocked('oc');
}

/** @deprecated use unlockLakeAccess('oc') */
export function unlockOcProfile(): void {
  unlockLakeAccess('oc');
}

/** @deprecated */
export function verifyOcProfilePassword(input: string): boolean {
  return verifyLakeAccessPassword('oc', input);
}

export const OC_PROFILE_PASSWORD = LAKE_ARCHIVE_PASSWORD;
