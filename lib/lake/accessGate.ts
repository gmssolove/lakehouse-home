import { auth } from '@/lib/firebase/client';
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

function currentUid(): string | null {
  try {
    return auth.currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

/** 로그인 유저가 비번을 한 번 이상 맞춰 본 경우 기기(localStorage)에 유지 */
function persistScopeKey(uid: string, scope: LakeAccessScope) {
  return `lh_lake_unlock_u_${uid}_${scope}`;
}

function persistItemKey(uid: string, scope: LakeAccessScope, itemId: string) {
  return `lh_lake_item_u_${uid}_${scope}_${itemId}`;
}

function readSession(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSession(key: string) {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

function readPersist(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writePersist(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

export function isLakeAccessUnlocked(scope: LakeAccessScope): boolean {
  if (typeof window === 'undefined') return false;
  if (readSession(unlockKey(scope))) return true;
  const uid = currentUid();
  if (uid && readPersist(persistScopeKey(uid, scope))) {
    writeSession(unlockKey(scope));
    return true;
  }
  return false;
}

export function isLakeItemUnlocked(scope: LakeAccessScope, itemId: string): boolean {
  if (typeof window === 'undefined') return false;
  if (readSession(itemUnlockKey(scope, itemId))) return true;
  const uid = currentUid();
  if (uid && readPersist(persistItemKey(uid, scope, itemId))) {
    writeSession(itemUnlockKey(scope, itemId));
    return true;
  }
  return false;
}

/**
 * 비밀번호 검증 성공 후에만 호출됨.
 * 로그인된 경우에만 localStorage에 기억(다시 안 치게).
 */
export function unlockLakeAccess(scope: LakeAccessScope): void {
  writeSession(unlockKey(scope));
  const uid = currentUid();
  if (uid) writePersist(persistScopeKey(uid, scope));
}

export function unlockLakeItem(scope: LakeAccessScope, itemId: string): void {
  writeSession(itemUnlockKey(scope, itemId));
  const uid = currentUid();
  if (uid) writePersist(persistItemKey(uid, scope, itemId));
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
