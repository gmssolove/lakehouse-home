export const OC_PROFILE_PASSWORD = '1145';
const UNLOCK_KEY = 'lh_oc_profile_unlocked';

export function isOcProfileUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function unlockOcProfile(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function verifyOcProfilePassword(input: string): boolean {
  return input.trim() === OC_PROFILE_PASSWORD;
}
