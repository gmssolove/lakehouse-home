/**
 * VN 재생 BGM / 효과음 볼륨.
 * localStorage에 각각 저장하고, 구독자에게 즉시 반영.
 */

export const BGM_VOLUME_KEY = 'lh_vn_bgm_volume';
export const SFX_VOLUME_KEY = 'lh_vn_sfx_volume';

const DEFAULT_BGM = 0.55;
const DEFAULT_SFX = 0.7;

let bgmCache: number | null = null;
let sfxCache: number | null = null;
const bgmListeners = new Set<(v: number) => void>();
const sfxListeners = new Set<(v: number) => void>();

function clamp01(n: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function readStored(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return fallback;
    return clamp01(Number(raw), fallback);
  } catch {
    return fallback;
  }
}

export function getBgmVolume(): number {
  if (bgmCache != null) return bgmCache;
  bgmCache = typeof window === 'undefined' ? DEFAULT_BGM : readStored(BGM_VOLUME_KEY, DEFAULT_BGM);
  return bgmCache;
}

export function setBgmVolume(v: number) {
  const next = clamp01(v, DEFAULT_BGM);
  bgmCache = next;
  try {
    localStorage.setItem(BGM_VOLUME_KEY, String(next));
  } catch {
    /* ignore */
  }
  bgmListeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeBgmVolume(fn: (v: number) => void) {
  bgmListeners.add(fn);
  return () => {
    bgmListeners.delete(fn);
  };
}

export function getSfxVolume(): number {
  if (sfxCache != null) return sfxCache;
  sfxCache = typeof window === 'undefined' ? DEFAULT_SFX : readStored(SFX_VOLUME_KEY, DEFAULT_SFX);
  return sfxCache;
}

export function setSfxVolume(v: number) {
  const next = clamp01(v, DEFAULT_SFX);
  sfxCache = next;
  try {
    localStorage.setItem(SFX_VOLUME_KEY, String(next));
  } catch {
    /* ignore */
  }
  sfxListeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeSfxVolume(fn: (v: number) => void) {
  sfxListeners.add(fn);
  return () => {
    sfxListeners.delete(fn);
  };
}
