/** 손글씨 쪽지 비율·효과음. 이미지는 CDN 직행 — 사이트 Worker(/api/r2-blob)를 쓰지 않는다. */

type NoteDim = { width: number; height: number };

const dimCache = new Map<string, Promise<NoteDim | null>>();
const sfxCache = new Map<string, HTMLAudioElement>();

function dimFromImageUrl(url: string): Promise<NoteDim | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      resolve(w > 0 && h > 0 ? { width: w, height: h } : null);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function loadNoteDims(src: string): Promise<NoteDim | null> {
  const url = src.trim();
  if (!url) return Promise.resolve(null);
  const hit = dimCache.get(url);
  if (hit) return hit;
  const pending = dimFromImageUrl(url);
  dimCache.set(url, pending);
  return pending;
}

export function preloadHandNoteImage(src: string): Promise<NoteDim | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return loadNoteDims(src);
}

export function preloadHandNoteImages(
  urls: Array<string | undefined | null> | undefined | null,
) {
  if (typeof window === 'undefined') return;
  const list = Array.from(
    new Set((urls ?? []).map((u) => (u || '').trim()).filter(Boolean)),
  );
  list.forEach((src) => {
    void loadNoteDims(src);
  });
}

/** 쪽지 펼침/닫기음 — 첫 재생 전 HTTP·디코드를 미리 채움 */
export function warmHandNoteSfx(urls: Array<string | undefined | null>) {
  if (typeof window === 'undefined') return;
  for (const raw of urls) {
    const url = (raw || '').trim();
    if (!url || sfxCache.has(url)) continue;
    try {
      const el = new Audio();
      el.preload = 'auto';
      el.volume = 0.62;
      el.src = url;
      try {
        el.load();
      } catch {
        /* ignore */
      }
      sfxCache.set(url, el);
    } catch {
      /* ignore */
    }
  }
}

/** 워밍된 Audio를 재사용 — 없으면 새로 만들어 캐시 */
export function takeHandNoteSfx(url: string): HTMLAudioElement | null {
  const trimmed = url.trim();
  if (!trimmed || typeof window === 'undefined') return null;
  warmHandNoteSfx([trimmed]);
  const el = sfxCache.get(trimmed);
  if (!el) return null;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
  return el;
}

/** 제스처 시점 워밍 헬퍼 (warmHandNoteSfx 와 동일) */
export function unlockHandNoteSfx(urls: Array<string | undefined | null>) {
  warmHandNoteSfx(urls);
}

export function collectPairHandNoteUrls(pair: {
  charNotes?: Array<{ handwritingNotes?: string[] } | undefined> | null;
}): string[] {
  const out: string[] = [];
  for (const note of pair.charNotes ?? []) {
    for (const u of note?.handwritingNotes ?? []) {
      const t = (u || '').trim();
      if (t) out.push(t);
    }
  }
  return out;
}

export function collectPairHandNoteSfx(pair: {
  charNotes?: Array<
    | { handwritingNoteSfx?: string; handwritingNoteCloseSfx?: string }
    | undefined
  > | null;
}): string[] {
  const out: string[] = [];
  for (const note of pair.charNotes ?? []) {
    const open = note?.handwritingNoteSfx?.trim();
    const close = note?.handwritingNoteCloseSfx?.trim();
    if (open) out.push(open);
    if (close) out.push(close);
  }
  return out;
}
