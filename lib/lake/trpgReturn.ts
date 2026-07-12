const KEY = 'lh-trpg-return';
const SKIP_BGM_RESTORE_KEY = 'lh-trpg-skip-bgm-restore';

export function setTrpgReturnPath(path: string) {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* ignore */
  }
}

export function clearTrpgReturnPath() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function consumeTrpgReturnPath(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

/** OC 상세로 돌아갈 때 TRPG cleanup이 페이지 BGM을 다시 켜지 않도록 */
export function markTrpgSkipBgmRestore() {
  try {
    sessionStorage.setItem(SKIP_BGM_RESTORE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeTrpgSkipBgmRestore(): boolean {
  try {
    const v = sessionStorage.getItem(SKIP_BGM_RESTORE_KEY);
    if (v) sessionStorage.removeItem(SKIP_BGM_RESTORE_KEY);
    return v === '1';
  } catch {
    return false;
  }
}
