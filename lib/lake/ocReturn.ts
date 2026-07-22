const KEY = 'lh-oc-return';

/** 페어/TRPG 등에서 OC 상세로 들어올 때 복귀 경로 저장 */
export function setOcReturnPath(path: string) {
  try {
    sessionStorage.setItem(KEY, path.trim());
  } catch {
    /* ignore */
  }
}

export function clearOcReturnPath() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function peekOcReturnPath(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function consumeOcReturnPath(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

/** URL ?from=&pair=&trpg= 또는 sessionStorage 로 복귀 경로 결정 */
export function resolveOcReturnHref(search: URLSearchParams | null | undefined): string | null {
  const from = search?.get('from')?.trim();
  if (from === 'pair') {
    const pairId = search?.get('pair')?.trim();
    if (pairId) return `/pair?p=${encodeURIComponent(pairId)}`;
    return '/pair';
  }
  if (from === 'trpg') {
    const trpgId = search?.get('trpg')?.trim();
    if (trpgId) return `/trpg/${encodeURIComponent(trpgId)}`;
  }
  return peekOcReturnPath();
}
