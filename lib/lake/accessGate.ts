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

/**
 * 검증에 성공한 비밀번호 값을 기기(localStorage)에 저장.
 * uid에 의존하지 않으므로 새로고침 직후(인증 복원 전)에도 유지되고,
 * 관리자가 비밀번호를 바꾸면 저장값과 달라져 다시 묻게 된다.
 */
function scopePwKey(scope: LakeAccessScope) {
  return `lh_lake_pw_${scope}`;
}

function itemPwKey(scope: LakeAccessScope, itemId: string) {
  return `lh_lake_pw_${scope}_${itemId}`;
}

function readStr(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStr(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
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

export function isLakeAccessUnlocked(scope: LakeAccessScope, expectedPassword?: string): boolean {
  if (typeof window === 'undefined') return false;
  const stored = readStr(scopePwKey(scope));
  if (stored != null) {
    return expectedPassword === undefined ? true : stored === expectedPassword;
  }
  // 레거시(비번 값 저장 이전) 폴백
  if (readSession(unlockKey(scope))) return true;
  const uid = currentUid();
  if (uid && readPersist(persistScopeKey(uid, scope))) {
    writeSession(unlockKey(scope));
    return true;
  }
  return false;
}

export function isLakeItemUnlocked(
  scope: LakeAccessScope,
  itemId: string,
  expectedPassword?: string,
): boolean {
  if (typeof window === 'undefined') return false;
  const stored = readStr(itemPwKey(scope, itemId));
  if (stored != null) {
    return expectedPassword === undefined ? true : stored === expectedPassword;
  }
  // 레거시(비번 값 저장 이전) 폴백
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
 * 검증한 비밀번호 값을 기기에 저장 → 새로고침·로그인 상태와 무관하게 유지,
 * 비밀번호가 바뀌면 저장값과 달라져 다시 묻는다. (verifiedPassword 미전달 시 레거시 boolean)
 */
export function unlockLakeAccess(scope: LakeAccessScope, verifiedPassword?: string): void {
  writeSession(unlockKey(scope));
  writeStr(scopePwKey(scope), verifiedPassword ?? '1');
  const uid = currentUid();
  if (uid) writePersist(persistScopeKey(uid, scope));
}

export function unlockLakeItem(
  scope: LakeAccessScope,
  itemId: string,
  verifiedPassword?: string,
): void {
  writeSession(itemUnlockKey(scope, itemId));
  writeStr(itemPwKey(scope, itemId), verifiedPassword ?? '1');
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
  if (scope === 'oc' || scope === 'pair' || scope === 'trpg') {
    return DEFAULT_SITE_ACCESS_SETTINGS[scope] || DEFAULT_SITE_ACCESS_SETTINGS.oc;
  }
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
  return !isLakeItemUnlocked(scope, (item as { id?: string }).id ?? 'global', pw);
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
