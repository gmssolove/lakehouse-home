const warmed = new Set<string>();

/** HTTP 캐시에 다음 곡을 올려 플레이어 전환 지연을 줄인다. */
export function prefetchAudio(url: string | null | undefined) {
  const src = String(url || '').trim();
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
  if (typeof window === 'undefined') return;
  if (warmed.has(src)) return;
  warmed.add(src);
  const run = () => {
    void fetch(src, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
    }).catch(() => {
      warmed.delete(src);
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2500 });
    return;
  }
  window.setTimeout(run, 400);
}
