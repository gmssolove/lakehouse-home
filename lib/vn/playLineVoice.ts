/**
 * OC / Pair 대사창 라인 보이스.
 * BGM·테마곡(_themeAudio / bgm.js)과 분리된 Audio 인스턴스만 사용.
 * 볼륨은 localStorage 키로 전역(일괄) 적용.
 */

export const LINE_VOICE_VOLUME_KEY = 'lh_line_voice_volume';
const DEFAULT_VOLUME = 0.85;

let lineVoice: HTMLAudioElement | null = null;
let volumeCache: number | null = null;
const listeners = new Set<(v: number) => void>();

function clamp01(n: number) {
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, n));
}

export function getLineVoiceVolume(): number {
  if (volumeCache != null) return volumeCache;
  try {
    const raw = localStorage.getItem(LINE_VOICE_VOLUME_KEY);
    if (raw == null || raw === '') {
      volumeCache = DEFAULT_VOLUME;
      return volumeCache;
    }
    volumeCache = clamp01(Number(raw));
    return volumeCache;
  } catch {
    volumeCache = DEFAULT_VOLUME;
    return volumeCache;
  }
}

/** 0~1. 재생 중이면 즉시 반영 + localStorage 저장 */
export function setLineVoiceVolume(v: number) {
  const next = clamp01(v);
  volumeCache = next;
  try {
    localStorage.setItem(LINE_VOICE_VOLUME_KEY, String(next));
  } catch {
    /* ignore */
  }
  if (lineVoice) {
    try {
      lineVoice.volume = next;
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeLineVoiceVolume(fn: (v: number) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function stopLineVoice() {
  if (!lineVoice) return;
  try {
    lineVoice.pause();
    lineVoice.removeAttribute('src');
    lineVoice.load();
  } catch {
    /* ignore */
  }
  lineVoice = null;
}

/** 대사 전환 시 호출. url 없으면 이전 음성만 멈춤 */
export function playLineVoice(url?: string | null) {
  stopLineVoice();
  const src = (url || '').trim();
  if (!src) return;
  try {
    const el = new Audio();
    el.preload = 'auto';
    el.volume = getLineVoiceVolume();
    el.src = src;
    lineVoice = el;
    void el.play().catch(() => {
      /* autoplay / 404 — 대사 진행은 막지 않음 */
    });
  } catch {
    /* ignore */
  }
}
