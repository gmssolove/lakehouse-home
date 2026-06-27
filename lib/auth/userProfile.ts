import { get, ref, runTransaction, set } from 'firebase/database';
import type { User } from 'firebase/auth';
import { db } from '@/lib/firebase/client';
import { usernameKey, validateUsername } from '@/lib/auth/validation';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/lib/types/character';

export type UserProfile = {
  username: string;
  nickname: string;
  email: string;
  createdAt: string;
};

export async function isUsernameTaken(username: string): Promise<boolean> {
  const key = usernameKey(username);
  const snap = await get(ref(db, `lhdata/users_by_username/${key}`));
  return snap.exists();
}

/** 아이디 중복 없이 등록. 성공 시 true, 이미 사용 중이면 false */
export async function claimUsername(username: string, uid: string): Promise<boolean> {
  const key = usernameKey(username);
  const result = await runTransaction(ref(db, `lhdata/users_by_username/${key}`), (current) => {
    if (current === null) return uid;
    return undefined;
  });
  return result.committed;
}

export async function saveUserProfile(uid: string, profile: Omit<UserProfile, 'createdAt'>): Promise<void> {
  const record: UserProfile = {
    ...profile,
    createdAt: new Date().toISOString(),
  };
  await set(ref(db, `lhdata/users/${uid}`), record);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await get(ref(db, `lhdata/users/${uid}`));
  if (!snap.exists()) return null;
  return snap.val() as UserProfile;
}

/** 아이디로 가입 이메일 조회 (Firebase Auth 로그인용) */
export async function getEmailByUsername(username: string): Promise<string | null> {
  if (validateUsername(username)) return null;
  const key = usernameKey(username);
  const usernameSnap = await get(ref(db, `lhdata/users_by_username/${key}`));
  if (usernameSnap.exists()) {
    const uid = usernameSnap.val() as string;
    const profile = await getUserProfile(uid);
    if (profile?.email?.trim()) return profile.email.trim();
  }
  if (key === usernameKey(ADMIN_USERNAME)) return ADMIN_EMAIL;
  return null;
}

/** 기존 관리자 Firebase 계정 — RTDB 프로필·아이디 매핑 자동 생성 */
export async function ensureAdminProfile(user: User): Promise<void> {
  if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return;

  const key = usernameKey(ADMIN_USERNAME);
  const mappingSnap = await get(ref(db, `lhdata/users_by_username/${key}`));
  if (mappingSnap.exists() && mappingSnap.val() !== user.uid) return;

  const profile = await getUserProfile(user.uid);
  if (profile?.username && usernameKey(profile.username) === key) return;

  if (!mappingSnap.exists()) {
    const claimed = await claimUsername(ADMIN_USERNAME, user.uid);
    if (!claimed) return;
  }

  await saveUserProfile(user.uid, {
    username: ADMIN_USERNAME,
    nickname: profile?.nickname || user.displayName || ADMIN_USERNAME,
    email: user.email,
  });
}

export function isAdminUser(user: User | null, profile: UserProfile | null): boolean {
  if (!user) return false;
  if (profile && usernameKey(profile.username) === usernameKey(ADMIN_USERNAME)) return true;
  return user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
