/** 손글씨 쪽지 이미지·효과음 프리로드 — 펼침 전 캐시로 뚝/첫 효과음 지연 완화 */

type NoteDim = { width: number; height: number };

const dimResolved = new Map<string, NoteDim | null>();
const dimCache = new Map<string, Promise<NoteDim | null>>();
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const sfxCache = new Map<string, HTMLAudioElement>();
let notePaperChunk: Promise<unknown> | null = null;

export function prefetchNotePaperChunk() {
  if (typeof window === 'undefined') return;
  if (!notePaperChunk) {
    notePaperChunk = import('@/components/pair/NotePaperUncrumple');
  }
}

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

  const pending = dimFromImageUrl(url).then((dim) => {
    dimResolved.set(url, dim);
    return dim;
  });
  dimCache.set(url, pending);
  return pending;
}

function loadCorsImage(src: string): Promise<HTMLImageElement | null> {
  const url = src.trim();
  if (!url) return Promise.resolve(null);
  const hit = imageCache.get(url);
  if (hit) return hit;

  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageCache.set(url, pending);
  return pending;
}

async function loadNoteDecodedImage(src: string): Promise<HTMLImageElement | null> {
  const url = src.trim();
  if (!url) return null;
  const cors = await loadCorsImage(url);
  if (cors) return cors;
  try {
    const proxy = `/api/r2-blob?src=${encodeURIComponent(url)}`;
    let res = await fetch(proxy);
    if (!res.ok) res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const objectUrl = URL.createObjectURL(await res.blob());
    const image = new window.Image();
    image.src = objectUrl;
    await new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
    });
    imageCache.set(url, Promise.resolve(image));
    return image;
  } catch {
    return null;
  }
}

/** 이미 끝난 비율 — 있으면 쪽지를 기다리지 않고 바로 그림 */
export function peekHandNoteDim(src: string): NoteDim | null | undefined {
  const url = src.trim();
  if (!url) return null;
  if (!dimResolved.has(url)) return undefined;
  return dimResolved.get(url) ?? null;
}

export function preloadHandNoteImage(src: string): Promise<NoteDim | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  prefetchNotePaperChunk();
  void loadCorsImage(src);
  return loadNoteDims(src);
}

export async function getHandNoteDecodedImage(
  src: string,
): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return null;
  return loadNoteDecodedImage(src);
}

export function preloadHandNoteImages(
  urls: Array<string | undefined | null> | undefined | null,
) {
  if (typeof window === 'undefined') return;
  prefetchNotePaperChunk();
  const list = Array.from(
    new Set((urls ?? []).map((u) => (u || '').trim()).filter(Boolean)),
  );
  list.forEach((src) => {
    void loadNoteDims(src);
    void loadCorsImage(src);
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
