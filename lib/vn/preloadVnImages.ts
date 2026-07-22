/**
 * VN 스탠딩 이미지 웜 캐시.
 * 숨은 <img> 를 DOM에 유지해 메모리/디코드 캐시를 살리고,
 * 등장 시 네트워크·디코드를 다시 기다리지 않게 한다.
 */

const ready = new Set<string>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();

function notify(src: string) {
  const set = listeners.get(src);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function isVnImageReady(url: string): boolean {
  return Boolean(url && ready.has(url));
}

export function markVnImageReady(url: string) {
  const src = (url || '').trim();
  if (!src || ready.has(src)) return;
  ready.add(src);
  inflight.delete(src);
  notify(src);
}

export function subscribeVnImageReady(url: string, fn: () => void) {
  const src = (url || '').trim();
  if (!src) return () => {};
  if (ready.has(src)) {
    fn();
    return () => {};
  }
  let set = listeners.get(src);
  if (!set) {
    set = new Set();
    listeners.set(src, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) listeners.delete(src);
  };
}

/** link rel=preload — 브라우저 HTTP 캐시를 먼저 채움 (개수 상한) */
const PRELOAD_LINK_CAP = 48;

function injectLinkPreload(src: string) {
  if (typeof document === 'undefined') return;
  const id = `vn-preload-${src.length}-${src.slice(-48).replace(/[^\w.-]/g, '_')}`;
  if (document.getElementById(id)) return;
  const existing = document.querySelectorAll('link[data-vn-preload="1"]');
  if (existing.length >= PRELOAD_LINK_CAP) {
    existing[0]?.parentNode?.removeChild(existing[0]);
  }
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.setAttribute('fetchpriority', 'low');
  link.setAttribute('data-vn-preload', '1');
  document.head.appendChild(link);
}

export function preloadVnImage(url: string | null | undefined): Promise<void> {
  const src = (url || '').trim();
  if (!src) return Promise.resolve();
  if (ready.has(src)) return Promise.resolve();
  const hit = inflight.get(src);
  if (hit) return hit;

  injectLinkPreload(src);

  const p = new Promise<void>((resolve) => {
    const done = () => {
      markVnImageReady(src);
      resolve();
    };
    try {
      const img = new Image();
      img.decoding = 'async';
      img.onload = done;
      img.onerror = done;
      img.src = src;
      if (img.complete && img.naturalHeight > 0) done();
    } catch {
      done();
    }
  });

  inflight.set(src, p);
  return p;
}

export function preloadVnImages(urls: Array<string | null | undefined>): Promise<void> {
  const list = [...new Set(urls.map((u) => (u || '').trim()).filter(Boolean))];
  if (!list.length) return Promise.resolve();
  /* 앞쪽부터 우선 — 동시 过多 방지하되 충분한 병렬 */
  const CONCURRENCY = 8;
  let i = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
    while (i < list.length) {
      const idx = i++;
      await preloadVnImage(list[idx]);
    }
  });
  return Promise.all(workers).then(() => undefined);
}

export function collectSceneSpriteUrls(
  lines: Array<{ sprites?: Array<{ character: string; expression: string }> } | null | undefined>,
  resolve: (character: string, expression: string) => string | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const s of line?.sprites ?? []) {
      const u = resolve(s.character, s.expression)?.trim();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}
