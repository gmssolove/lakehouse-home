/**
 * 채팅 알림 SFX — 다른 탭(숨은 문서)에서도 재생 시도.
 * 실패분만 큐에 넣고, 탭이 다시 보일 때 재시도.
 */

let unlockedEl: HTMLAudioElement | null = null;
let unlockBound = false;
const pendingUrls: string[] = [];
let flushing = false;

function ensureUnlockListeners() {
  if (typeof window === 'undefined' || unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    try {
      if (!unlockedEl) {
        unlockedEl = new Audio();
        unlockedEl.preload = 'auto';
      }
      unlockedEl.muted = true;
      unlockedEl.src =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
      void unlockedEl
        .play()
        .then(() => {
          unlockedEl!.pause();
          unlockedEl!.muted = false;
          unlockedEl!.removeAttribute('src');
          unlockedEl!.load();
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
    void flushPendingNotifySfx();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushPendingNotifySfx();
  });
}

function playUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const el = unlockedEl || new Audio();
      if (!unlockedEl) unlockedEl = el;
      el.muted = false;
      el.volume = 0.85;
      el.src = url;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => resolve(true)).catch(() => resolve(false));
      } else {
        resolve(true);
      }
    } catch {
      resolve(false);
    }
  });
}

export async function flushPendingNotifySfx() {
  if (flushing) return;
  flushing = true;
  try {
    while (pendingUrls.length) {
      const url = pendingUrls.shift();
      if (!url) break;
      const ok = await playUrl(url);
      if (!ok) {
        pendingUrls.unshift(url);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * 토스트와 함께 호출.
 * 숨은 탭에서도 즉시 재생 시도(예전엔 큐만 넣고 포그라운드에서만 울림).
 */
export function playOcChatNotifySfx(url: string | undefined) {
  const src = (url || '').trim();
  if (!src || typeof window === 'undefined') return;
  ensureUnlockListeners();

  void playUrl(src).then((ok) => {
    if (!ok && !pendingUrls.includes(src)) {
      pendingUrls.push(src);
    }
  });
}

/** 채팅 패널 오픈 시 unlock 리스너만 미리 걸어둠 */
export function armOcChatNotifySfx() {
  ensureUnlockListeners();
}
